"""Jobs: unified job list with views, filters and counts; job details; save/hide/feedback; manual add."""

from __future__ import annotations

import hashlib
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Query, Request
from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.api.deps import DB, CurrentUser, client_ip, get_owned
from app.api.serializers import job_detail_out, job_out, match_out
from app.models import Application, Job, JobMatch, JobSource, User, UserPreference, utcnow
from app.schemas.jobs import (
    HideJobIn,
    JobCounts,
    JobDetailOut,
    JobFeedbackIn,
    JobListOut,
    JobMatchOut,
    JobOut,
    ManualJobIn,
)
from app.services import audit
from app.services.jobs_ingest import ingest_postings
from app.services.matching import load_signals, upsert_match
from app.services.profile_bundle import load_bundle
from app.services.quality import USER_HIDDEN_PREFIX, USER_UNHIDDEN_FLAG, apply_quality
from app.services.search_prefs import HOURS_PER_YEAR, quality_filters_for
from app.services.sources.base import RawPosting
from app.services.sources.registry import SOURCE_GROUP_MEMBERS

router = APIRouter(prefix="/jobs", tags=["jobs"])

View = Literal["all", "recommended", "new", "saved", "closing_soon", "hidden"]
Sort = Literal["match", "date", "salary", "deadline"]
NEW_WINDOW_HOURS = 72


def _view_conditions(view: View, closing_until: date) -> list[ColumnElement[bool]]:
    today = date.today()
    new_since = utcnow() - timedelta(hours=NEW_WINDOW_HOURS)
    visible = Job.is_hidden.is_(False)
    return {
        "all": [visible],
        "recommended": [visible, JobMatch.tier.in_(["strong", "good"])],
        "new": [visible, Job.first_seen_at >= new_since, Job.is_seen.is_(False)],
        "saved": [visible, Job.is_saved.is_(True)],
        "closing_soon": [visible, Job.deadline.is_not(None), Job.deadline >= today, Job.deadline <= closing_until],
        "hidden": [Job.is_hidden.is_(True)],
    }[view]


def _counts(db: Session, user: User, closing_until: date) -> JobCounts:
    def total(*conds: ColumnElement[bool]):
        return func.coalesce(func.sum(case((and_(*conds), 1), else_=0)), 0)

    visible = Job.is_hidden.is_(False)
    row = db.execute(
        select(
            total(visible),
            total(*_view_conditions("recommended", closing_until)),
            total(*_view_conditions("new", closing_until)),
            total(*_view_conditions("saved", closing_until)),
            total(*_view_conditions("closing_soon", closing_until)),
            total(Job.is_hidden.is_(True)),
            total(visible, JobMatch.tier == "strong"),
            total(visible, JobMatch.tier == "good"),
            total(visible, JobMatch.tier == "possible"),
        ).select_from(Job).outerjoin(JobMatch, JobMatch.job_id == Job.id).where(Job.user_id == user.id)
    ).one()
    keys = ("all", "recommended", "new", "saved", "closing_soon", "hidden", "strong", "good", "possible")
    return JobCounts(**{k: int(v) for k, v in zip(keys, row, strict=True)})


def _search_condition(q: str) -> ColumnElement[bool]:
    escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    return or_(*(col.ilike(pattern, escape="\\") for col in (Job.title, Job.company_name, Job.location,
                                                            Job.description)))


def _order_by(sort: Sort) -> list:
    recency = func.coalesce(Job.posted_at, Job.first_seen_at)
    if sort == "date":
        return [recency.desc(), Job.id.desc()]
    if sort == "salary":
        top = func.coalesce(Job.salary_max, Job.salary_min)
        yearly = case((Job.salary_period == "hourly", top * HOURS_PER_YEAR), else_=top)
        return [yearly.is_(None), yearly.desc(), recency.desc()]
    if sort == "deadline":
        return [Job.deadline.is_(None), Job.deadline.asc(), recency.desc()]
    return [JobMatch.overall.is_(None), JobMatch.overall.desc(), recency.desc(), Job.id.desc()]


@router.get("", response_model=JobListOut)
def list_jobs(
    db: DB,
    user: CurrentUser,
    view: View = "all",
    q: str | None = Query(default=None, max_length=200),
    tier: Literal["strong", "good", "possible", "weak"] | None = None,
    source: str | None = Query(default=None, max_length=30),
    work_arrangement: Literal["onsite", "hybrid", "remote"] | None = None,
    sort: Sort = "match",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> JobListOut:
    qf = quality_filters_for(db.scalar(select(UserPreference).where(UserPreference.user_id == user.id)))
    closing_until = date.today() + timedelta(days=qf.deadline_warning_days)
    conditions = [Job.user_id == user.id, *_view_conditions(view, closing_until)]
    if q and q.strip():
        conditions.append(_search_condition(q))
    if tier:
        conditions.append(JobMatch.tier == tier)
    if source:
        members = SOURCE_GROUP_MEMBERS.get(source, (source,))
        conditions.append(exists().where(JobSource.job_id == Job.id, JobSource.source.in_(members)))
    if work_arrangement:
        conditions.append(Job.work_arrangement == work_arrangement)

    base = select(Job).outerjoin(JobMatch, JobMatch.job_id == Job.id).where(*conditions)
    total = db.scalar(select(func.count()).select_from(base.with_only_columns(Job.id).subquery())) or 0
    jobs = db.scalars(base.options(selectinload(Job.sources), selectinload(Job.match))
                      .order_by(*_order_by(sort)).offset((page - 1) * page_size).limit(page_size)).all()
    apps = {a.job_id: a for a in db.scalars(select(Application).where(
        Application.user_id == user.id, Application.job_id.in_([j.id for j in jobs])))} if jobs else {}
    return JobListOut(
        items=[job_out(db, j, apps.get(j.id), lookup_application=False) for j in jobs],
        total=total, page=page, page_size=page_size, counts=_counts(db, user, closing_until),
    )


def _manual_posting(body: ManualJobIn) -> RawPosting:
    digest = hashlib.sha1(f"{body.company_name}|{body.title}|{body.url or ''}|{body.location or ''}".lower().encode())
    return RawPosting(
        source="manual", source_label="Added by you", external_id=f"manual-{digest.hexdigest()[:16]}",
        title=body.title.strip(), company_name=body.company_name.strip(), description=body.description,
        url=body.url, apply_url=body.url, location=body.location, work_arrangement=body.work_arrangement,
        employment_type=body.employment_type, salary_min=body.salary_min, salary_max=body.salary_max,
        salary_period=body.salary_period if (body.salary_min or body.salary_max) else None, deadline=body.deadline,
    )


@router.post("/manual", response_model=JobDetailOut, status_code=201)
def add_manual_job(body: ManualJobIn, db: DB, user: CurrentUser) -> JobDetailOut:
    result = ingest_postings(db, user, [_manual_posting(body)], actor="user")
    db.commit()
    job = get_owned(db, Job, result.job_ids[0], user, "job")
    return job_detail_out(db, job)


@router.get("/{job_id}", response_model=JobDetailOut)
def get_job(job_id: int, db: DB, user: CurrentUser) -> JobDetailOut:
    job = get_owned(db, Job, job_id, user, "job")
    if not job.is_seen:
        job.is_seen = True
        db.commit()
    return job_detail_out(db, job)


def _audit(db: Session, user: User, job: Job, action: str, summary: str, request: Request | None = None,
           details: dict | None = None) -> None:
    audit.record(db, user.id, action, summary, entity_type="job", entity_id=job.id, details=details,
                 ip_address=client_ip(request) if request else None)


@router.post("/{job_id}/save", response_model=JobOut)
def save_job(job_id: int, db: DB, user: CurrentUser, request: Request) -> JobOut:
    job = get_owned(db, Job, job_id, user, "job")
    if not job.is_saved:
        job.is_saved, job.saved_at = True, utcnow()
        if job.is_hidden and not any(r.startswith(USER_HIDDEN_PREFIX) for r in job.hidden_reasons or []):
            job.is_hidden, job.hidden_reasons = False, []  # never hide a job you saved
        _audit(db, user, job, "job.saved", f"You saved {job.title} at {job.company_name}", request)
        db.commit()
    return job_out(db, job)


@router.delete("/{job_id}/save", response_model=JobOut)
def unsave_job(job_id: int, db: DB, user: CurrentUser, request: Request) -> JobOut:
    job = get_owned(db, Job, job_id, user, "job")
    if job.is_saved:
        job.is_saved, job.saved_at = False, None
        apply_quality(job, load_bundle(db, user))
        _audit(db, user, job, "job.unsaved", f"You removed {job.title} at {job.company_name} from saved jobs", request)
        db.commit()
    return job_out(db, job)


@router.post("/{job_id}/hide", response_model=JobOut)
def hide_job(job_id: int, body: HideJobIn, db: DB, user: CurrentUser, request: Request) -> JobOut:
    job = get_owned(db, Job, job_id, user, "job")
    reason = (body.reason or "").strip()[:200]
    job.is_hidden = True
    job.is_saved, job.saved_at = False, None
    job.hidden_reasons = [f"{USER_HIDDEN_PREFIX}: {reason}" if reason else USER_HIDDEN_PREFIX]
    job.flags = [f for f in job.flags or [] if f.get("code") != USER_UNHIDDEN_FLAG["code"]]
    _audit(db, user, job, "job.hidden", f"You hid {job.title} at {job.company_name}" + (f" ({reason})" if reason
                                                                                          else ""), request)
    db.commit()
    return job_out(db, job)


@router.post("/{job_id}/unhide", response_model=JobOut)
def unhide_job(job_id: int, db: DB, user: CurrentUser, request: Request) -> JobOut:
    job = get_owned(db, Job, job_id, user, "job")
    had_filter_reasons = job.is_hidden and not any(r.startswith(USER_HIDDEN_PREFIX) for r in job.hidden_reasons or [])
    job.is_hidden, job.hidden_reasons = False, []
    if had_filter_reasons and not any(f.get("code") == USER_UNHIDDEN_FLAG["code"] for f in job.flags or []):
        job.flags = [*(job.flags or []), USER_UNHIDDEN_FLAG]
    _audit(db, user, job, "job.unhidden", f"You restored {job.title} at {job.company_name} to your job list", request)
    db.commit()
    return job_out(db, job)


@router.post("/{job_id}/feedback", response_model=JobOut)
def job_feedback(job_id: int, body: JobFeedbackIn, db: DB, user: CurrentUser, request: Request) -> JobOut:
    job = get_owned(db, Job, job_id, user, "job")
    job.user_feedback = body.feedback
    text = {"interested": "interested in", "not_interested": "not interested in"}.get(body.feedback or "")
    summary = f"You marked yourself {text} {job.title} at {job.company_name}" if text else \
        f"You cleared your feedback on {job.title} at {job.company_name}"
    _audit(db, user, job, "job.feedback", summary, request, {"feedback": body.feedback})
    db.commit()
    return job_out(db, job)


@router.post("/{job_id}/rescore", response_model=JobMatchOut)
def rescore_job(job_id: int, db: DB, user: CurrentUser) -> JobMatchOut:
    job = get_owned(db, Job, job_id, user, "job")
    bundle = load_bundle(db, user)
    apply_quality(job, bundle)
    match = upsert_match(db, job, bundle, load_signals(db, user.id))
    db.commit()
    out = match_out(match)
    assert out is not None
    return out
