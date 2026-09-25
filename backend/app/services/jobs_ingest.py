"""Turn raw postings from any source into unified, analyzed and scored ``Job`` records.

Pipeline (each phase is also callable on its own so the agent can report progress per step):

1. ``merge_postings`` — upsert postings: a re-seen posting refreshes its job, a duplicate from
   another source is attached to the existing job (filling fields it lacked, e.g. salary), and
   anything else becomes a new job. One ``job.discovered`` audit row per new job.
2. ``analyze_jobs`` — extract requirements from the description, infer missing structured fields
   and apply the user's quality filters.
3. ``score_jobs`` — compute the transparent match for each job.

``ingest_postings`` runs all three.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Company, Job, JobSource, User, utcnow
from app.services import audit
from app.services.company_research import get_or_create_company
from app.services.dedup import (
    clean_title,
    dedup_key,
    find_duplicate,
    find_existing_source,
    normalize_company,
    normalize_title,
)
from app.services.jd_extract import extract_requirements, infer_fields
from app.services.location import CANADA, normalize_location, parse_location
from app.services.matching import load_signals, upsert_match
from app.services.profile_bundle import ProfileBundle, load_bundle
from app.services.quality import apply_quality
from app.services.search_prefs import quality_filters_for
from app.services.sources.base import RawPosting

_SALARY_FIELDS = ("salary_min", "salary_max", "salary_period", "currency")
_SIMPLE_FIELDS = ("work_arrangement", "employment_type", "experience_level", "department", "deadline")


@dataclass
class IngestResult:
    found: int = 0  # postings received
    new: int = 0  # jobs created
    merged_duplicates: int = 0  # postings attached to a job already known from another source
    updated: int = 0  # postings seen before (same source + id), refreshed
    job_ids: list[int] = field(default_factory=list)  # every job touched, in first-seen order
    new_job_ids: list[int] = field(default_factory=list)

    @property
    def unique(self) -> int:
        return len(self.job_ids)

    def _touch(self, job_id: int) -> None:
        if job_id not in self.job_ids:
            self.job_ids.append(job_id)


def _fill_missing(job: Job, posting: RawPosting) -> bool:
    """Complete ``job`` with details only ``posting`` has. Returns True if the description changed."""
    if not (job.salary_min or job.salary_max) and (posting.salary_min or posting.salary_max):
        for key in _SALARY_FIELDS:
            setattr(job, key, getattr(posting, key))
    for key in _SIMPLE_FIELDS:
        if getattr(job, key) is None and getattr(posting, key) is not None:
            setattr(job, key, getattr(posting, key))
    if posting.posted_at and (job.posted_at is None or posting.posted_at < job.posted_at):
        job.posted_at = posting.posted_at
    if len(posting.description or "") > 1.3 * len(job.description or ""):
        job.description = posting.description
        return True
    return False


def _source_row(posting: RawPosting) -> JobSource:
    return JobSource(source=posting.source, source_label=posting.source_label, external_id=posting.external_id[:200],
                     url=posting.url, apply_url=posting.apply_url or posting.url, apply_method=posting.apply_method,
                     fetched_at=utcnow(), raw=posting.raw or {})


def _new_job(user: User, company: Company, posting: RawPosting) -> Job:
    parsed = parse_location(posting.location)
    now = utcnow()
    job = Job(
        user_id=user.id,
        company_id=company.id,
        title=clean_title(posting.title)[:300],
        normalized_title=normalize_title(posting.title)[:300],
        company_name=company.name if company.is_demo else posting.company_name.strip()[:200],
        department=posting.department,
        location=(normalize_location(posting.location) or None) if posting.location else None,
        city=posting.city or parsed.city,
        province=posting.province or parsed.province,
        country=posting.country or parsed.country,
        work_arrangement=posting.work_arrangement or ("remote" if parsed.is_remote else "hybrid"
                                                      if parsed.is_hybrid else None),
        employment_type=posting.employment_type,
        experience_level=posting.experience_level,
        salary_min=posting.salary_min,
        salary_max=posting.salary_max,
        salary_period=posting.salary_period,
        currency=posting.currency,
        description=posting.description or "",
        requirements={},
        posted_at=posting.posted_at,
        deadline=posting.deadline,
        dedup_key=dedup_key(posting.company_name, posting.title, posting.location),
        first_seen_at=now,
        last_seen_at=now,
        flags=[],
        hidden_reasons=[],
        is_demo=posting.is_demo,
    )
    job.company = company
    job.sources.append(_source_row(posting))
    return job


def merge_postings(db: Session, user: User, postings: Iterable[RawPosting], *, dedupe: bool = True,
                   actor: str = "agent") -> tuple[IngestResult, set[int]]:
    """Upsert postings into jobs. Returns the result and ids of jobs whose description changed. Caller commits."""
    result = IngestResult()
    changed: set[int] = set()
    companies: dict[str, Company] = {}
    now = utcnow()
    for posting in postings:
        result.found += 1
        existing = find_existing_source(db, user.id, posting.source, posting.external_id)
        if existing is not None:
            job = existing.job
            existing.fetched_at, existing.url = now, posting.url or existing.url
            existing.apply_url = posting.apply_url or existing.apply_url
            job.last_seen_at, job.is_open = now, True
            if _fill_missing(job, posting):
                changed.add(job.id)
            result.updated += 1
            result._touch(job.id)
            continue
        duplicate = find_duplicate(db, user.id, posting, check_source=False) if dedupe else None
        if duplicate is not None:
            duplicate.sources.append(_source_row(posting))
            duplicate.last_seen_at, duplicate.is_open = now, True
            if _fill_missing(duplicate, posting):
                changed.add(duplicate.id)
            db.flush()
            result.merged_duplicates += 1
            result._touch(duplicate.id)
            continue
        key = normalize_company(posting.company_name)
        company = companies.get(key) or get_or_create_company(
            db, user.id, posting.company_name, website=posting.company_website,
            careers_url=posting.company_careers_url)
        companies[key] = company
        job = _new_job(user, company, posting)
        db.add(job)
        db.flush()
        if actor == "user":
            summary = f"You added job: {job.title} at {job.company_name}"
        else:
            summary = f"Agent discovered job: {job.title} at {job.company_name}"
        audit.record(db, user.id, "job.discovered" if actor != "user" else "job.added", summary, actor=actor,
                     entity_type="job", entity_id=job.id,
                     details={"source": posting.source_label, "external_id": posting.external_id, "url": posting.url})
        result.new += 1
        result.new_job_ids.append(job.id)
        result._touch(job.id)
    return result, changed


def analyze_job(job: Job) -> None:
    """Extract requirements and fill structured fields the posting didn't provide."""
    job.requirements = extract_requirements(job.description, job.title)
    inferred = infer_fields(job.title, job.description, job.location)
    for key in ("work_arrangement", "employment_type", "experience_level"):
        if getattr(job, key) is None and inferred.get(key):
            setattr(job, key, inferred[key])
    if not (job.salary_min or job.salary_max) and inferred.get("salary_min"):
        for key in _SALARY_FIELDS:
            setattr(job, key, inferred.get(key))
    if (job.salary_min or job.salary_max) and not job.currency and job.country == CANADA:
        job.currency = "CAD"


def load_jobs(db: Session, user: User, job_ids: list[int]) -> list[Job]:
    if not job_ids:
        return []
    jobs = db.scalars(select(Job).where(Job.user_id == user.id, Job.id.in_(job_ids)).options(
        selectinload(Job.sources), selectinload(Job.match), selectinload(Job.company))).all()
    order = {jid: i for i, jid in enumerate(job_ids)}
    return sorted(jobs, key=lambda j: order[j.id])


def analyze_jobs(jobs: list[Job], bundle: ProfileBundle, *, extract: bool = True,
                 only_ids: set[int] | None = None) -> None:
    """Analyze jobs (``only_ids`` limits extraction to those ids) and (re)apply quality filters."""
    qf = quality_filters_for(bundle.preferences)
    for job in jobs:
        if extract and (only_ids is None or job.id in only_ids or not job.requirements):
            analyze_job(job)
        apply_quality(job, bundle, qf)


def score_jobs(db: Session, jobs: list[Job], bundle: ProfileBundle) -> None:
    signals = load_signals(db, bundle.user.id)
    for job in jobs:
        upsert_match(db, job, bundle, signals)


def ingest_postings(db: Session, user: User, postings: list[RawPosting], *, actor: str = "agent") -> IngestResult:
    """Merge, analyze and score ``postings`` for ``user``. Caller commits."""
    result, changed = merge_postings(db, user, postings, actor=actor)
    jobs = load_jobs(db, user, result.job_ids)
    bundle = load_bundle(db, user)
    analyze_jobs(jobs, bundle, only_ids=set(result.new_job_ids) | changed)
    score_jobs(db, jobs, bundle)
    db.flush()
    return result
