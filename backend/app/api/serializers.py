"""Shared ORM -> schema serializers for jobs, matches and companies.

Used by the jobs, companies, applications and dashboard routers so every endpoint returns
job data in exactly the same shape.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Application, Company, Job, JobMatch
from app.schemas.jobs import (
    CompanyOut,
    JobDetailOut,
    JobMatchOut,
    JobMatchSummary,
    JobOut,
    JobRequirements,
    JobSourceOut,
)


def match_out(match: JobMatch | None) -> JobMatchOut | None:
    if match is None:
        return None
    return JobMatchOut(
        job_id=match.job_id,
        overall=match.overall,
        tier=match.tier,  # type: ignore[arg-type]
        breakdown=match.breakdown or [],
        missing_required=match.missing_required or [],
        missing_preferred=match.missing_preferred or [],
        recommendation=match.recommendation or "",
        should_apply=match.should_apply,  # type: ignore[arg-type]
        concerns=match.concerns or [],
        weights=match.weights or {},
        updated_at=match.updated_at,
    )


def match_summary(match: JobMatch | None) -> JobMatchSummary | None:
    if match is None:
        return None
    matched: list[str] = []
    missing: list[str] = []
    for cat in match.breakdown or []:
        if cat.get("key") == "skills":
            matched = list(cat.get("matched", []))[:5]
            missing = list(cat.get("missing", []))[:5]
    return JobMatchSummary(overall=match.overall, tier=match.tier, recommendation=match.recommendation or "",
                           top_matched=matched, top_missing=missing)


def _application_for(db: Session, job: Job) -> Application | None:
    return db.scalar(select(Application).where(Application.user_id == job.user_id, Application.job_id == job.id))


def job_out(db: Session, job: Job, application: Application | None = None, *, lookup_application: bool = True) -> JobOut:
    app = application if application is not None or not lookup_application else _application_for(db, job)
    return JobOut(
        id=job.id,
        title=job.title,
        company_name=job.company_name,
        company_id=job.company_id,
        location=job.location,
        work_arrangement=job.work_arrangement,
        employment_type=job.employment_type,
        experience_level=job.experience_level,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        salary_period=job.salary_period,
        currency=job.currency,
        posted_at=job.posted_at,
        deadline=job.deadline,
        first_seen_at=job.first_seen_at,
        is_saved=job.is_saved,
        is_hidden=job.is_hidden,
        is_seen=job.is_seen,
        is_demo=job.is_demo,
        flags=job.flags or [],
        hidden_reasons=job.hidden_reasons or [],
        sources=[JobSourceOut.model_validate(s) for s in job.sources],
        match=match_summary(job.match),
        application_id=app.id if app else None,
        application_status=app.status.value if app else None,
    )


def company_out(db: Session, company: Company | None) -> CompanyOut | None:
    if company is None:
        return None
    open_jobs = db.scalar(
        select(func.count(Job.id)).where(Job.company_id == company.id, Job.is_open.is_(True), Job.is_hidden.is_(False))
    ) or 0
    out = CompanyOut.model_validate(company)
    out.open_jobs = open_jobs
    return out


def job_detail_out(db: Session, job: Job) -> JobDetailOut:
    base = job_out(db, job)
    return JobDetailOut(
        **base.model_dump(),
        description=job.description or "",
        department=job.department,
        requirements=JobRequirements(**(job.requirements or {})),
        full_match=match_out(job.match),
        company=company_out(db, job.company),
        duplicates_merged=max(0, len(job.sources) - 1),
    )
