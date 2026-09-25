"""Prepare an application for review: resume → tailoring → cover letter → answers → research → readiness.

Nothing here submits anything. Preparation ends at "ready" (or "reviewing" when something
blocks approval); the user must then review and explicitly approve the application.
"""

from __future__ import annotations

import logging
from difflib import SequenceMatcher

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusChange,
    Company,
    CoverLetter,
    Job,
    Resume,
    ResumeVersion,
    User,
    utcnow,
)
from app.schemas.profile import AgentSettings
from app.services import answers as answers_service
from app.services import audit, cover_letter, readiness, resume_builder, resume_tailor
from app.services.application_status import change_status
from app.services.profile_bundle import ProfileBundle, load_bundle

log = logging.getLogger("applier.prep")

PREPARABLE = {ApplicationStatus.discovered, ApplicationStatus.saved, ApplicationStatus.reviewing,
              ApplicationStatus.ready}


def agent_settings(bundle: ProfileBundle) -> AgentSettings:
    stored = {k: v for k, v in (bundle.preferences.agent_settings or {}).items() if k != "auto_submit"}
    try:
        return AgentSettings(**stored)
    except ValidationError:
        return AgentSettings()


# ---------------------------------------------------------------------------
# Application record
# ---------------------------------------------------------------------------


def snapshot_job(app: Application, job: Job) -> None:
    """Copy job details onto the application so its history survives job deletion."""
    source = next((s for s in job.sources if s.apply_url), job.sources[0] if job.sources else None)
    app.company_name = job.company_name
    app.job_title = job.title
    app.location = job.location
    app.source = source.source if source else None
    app.url = source.url if source else None
    app.apply_url = (source.apply_url or source.url) if source else None
    app.date_discovered = app.date_discovered or job.first_seen_at
    app.is_demo = job.is_demo
    if job.match is not None:
        app.match_score = job.match.overall


def create_application(db: Session, user: User, job: Job, status: ApplicationStatus, *,
                       actor: str = "user") -> Application:
    app = Application(user_id=user.id, job_id=job.id, status=status, answers=[], documents=[], status_history=[],
                      interviews=[], readiness=[])
    snapshot_job(app, job)
    app.status_history.append(ApplicationStatusChange(from_status=None, to_status=status.value, actor=actor))
    db.add(app)
    db.flush()
    audit.record(db, user.id, "application.created", f"Started tracking {job.title} at {job.company_name}",
                 actor=actor, entity_type="application", entity_id=app.id, details={"job_id": job.id})
    return app


def get_or_create_application(db: Session, user: User, job: Job) -> Application:
    app = db.scalar(select(Application).where(Application.user_id == user.id, Application.job_id == job.id))
    return app or create_application(db, user, job, ApplicationStatus.discovered, actor="agent")


def _ensure_match(db: Session, job: Job, bundle: ProfileBundle) -> None:
    if job.match is not None:
        return
    try:
        from app.services import matching

        matching.upsert_match(db, job, bundle)
    except (ImportError, AttributeError):
        return


# ---------------------------------------------------------------------------
# Resume selection & tailoring
# ---------------------------------------------------------------------------


def _resume_fit(resume: Resume, job: Job, job_skills: set[str]) -> tuple[float, int]:
    title = (resume.target_role or resume.name or "").lower()
    title_sim = SequenceMatcher(None, title, job.title.lower()).ratio()
    overlap = len(job_skills & resume_tailor.content_skills(resume.content or {}))
    coverage = overlap / len(job_skills) if job_skills else 0.0
    return 50 * title_sim + 50 * coverage + (5 if resume.is_default else 0), overlap


def build_profile_resume(db: Session, bundle: ProfileBundle, target_role: str | None, name: str) -> Resume:
    has_default = db.scalar(select(Resume.id).where(Resume.user_id == bundle.user.id, Resume.is_default.is_(True)))
    resume = Resume(user_id=bundle.user.id, name=name, target_role=target_role, status="active",
                    is_default=has_default is None, content=resume_builder.build_from_profile(bundle, target_role))
    db.add(resume)
    db.flush()
    return resume


def select_resume(db: Session, bundle: ProfileBundle, job: Job, resume_id: int | None = None) -> tuple[Resume, str]:
    """Return (resume, human-readable reason for choosing it)."""
    if resume_id is not None:
        resume = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == bundle.user.id))
        if resume is None:
            raise NotFound("resume")
        return resume, f"You chose “{resume.name}”."
    candidates = list(db.scalars(select(Resume).where(Resume.user_id == bundle.user.id, Resume.status == "active")))
    if candidates:
        job_skills = set(resume_tailor.job_terms(job).skills)
        scored = [(resume, *_resume_fit(resume, job, job_skills)) for resume in candidates]
        best, _, overlap = max(scored, key=lambda t: t[1])
        reason = f"Chose “{best.name}” as the closest fit"
        if job_skills:
            reason += f" — it covers {overlap} of the {len(job_skills)} skills this job lists"
        return best, f"{reason}."
    resume = build_profile_resume(db, bundle, job.title, "Resume (built from your profile)")
    return resume, "You had no resumes yet, so one was built from your profile."


def tailor_version(db: Session, bundle: ProfileBundle, resume: Resume, job: Job, *, customize: bool = True,
                   existing: ResumeVersion | None = None) -> ResumeVersion:
    """Create (or refresh a draft) ResumeVersion of ``resume`` for ``job``."""
    result = resume_tailor.tailor(bundle, resume.content or {}, job, propose_changes=customize)
    version = existing if existing is not None and existing.status == "draft" and existing.resume_id == resume.id \
        else ResumeVersion(user_id=bundle.user.id, resume_id=resume.id)
    version.job_id = job.id
    version.label = f"{job.title} — {job.company_name}"[:255]
    version.file_name = resume_tailor.tailored_file_name(bundle.user.full_name, job.title, job.company_name)
    version.base_content = resume.content or {}
    version.content = result.content
    version.changes = result.changes
    version.insights = result.insights
    version.ats_score = result.ats_score
    version.status = "draft"
    db.add(version)
    db.flush()
    return version


# ---------------------------------------------------------------------------
# Cover letter
# ---------------------------------------------------------------------------


def should_include_cover_letter(settings: AgentSettings, job: Job, include: bool | None) -> bool:
    if include is not None:
        return include
    return settings.auto_cover_letter or readiness.posting_requests_cover_letter(job)


def write_cover_letter(db: Session, bundle: ProfileBundle, job: Job, company: Company | None, variant: str,
                       existing: CoverLetter | None = None) -> CoverLetter:
    draft = cover_letter.generate(bundle, job, company)
    letter = existing or CoverLetter(user_id=bundle.user.id)
    letter.job_id = job.id
    letter.title = f"{job.title} — {job.company_name}"[:255]
    letter.variants = draft.variants
    letter.variant = variant
    letter.content = draft.variants[variant]
    letter.generated_by = draft.generated_by
    letter.status = "draft"
    db.add(letter)
    db.flush()
    return letter


# ---------------------------------------------------------------------------
# Company research (owned by services.company_research; optional and non-fatal)
# ---------------------------------------------------------------------------


def _research_company(db: Session, user: User, job: Job, enabled: bool) -> Company | None:
    try:
        from app.services import company_research
    except ImportError:
        return job.company
    try:
        with db.begin_nested():
            company = job.company
            if company is None:
                company = company_research.get_or_create_company(db, user.id, job.company_name)
                job.company_id = company.id
                job.company = company
            if enabled and company.researched_at is None:
                company_research.research_company(db, company)
            return company
    except Exception:  # research is a nice-to-have; preparation must still succeed
        log.exception("Company research failed for job %s", job.id)
        return job.company


# ---------------------------------------------------------------------------
# Readiness & orchestration
# ---------------------------------------------------------------------------


def invalidate_approval(db: Session, app: Application, what: str) -> None:
    """An approval covers exact content; editing that content requires a fresh review."""
    if app.approved_at is None or app.status not in (ApplicationStatus.reviewing, ApplicationStatus.ready):
        return
    app.approved_at = None
    audit.record(db, app.user_id, "application.approval_cleared",
                 f"Approval cleared because the {what} changed — please review {app.job_title} again",
                 entity_type="application", entity_id=app.id)


def refresh_readiness(db: Session, app: Application, bundle: ProfileBundle, *, actor: str = "agent") -> None:
    """Recompute readiness and move between reviewing/ready accordingly."""
    app.readiness = readiness.compute_readiness(db, bundle, app)
    if app.status in (ApplicationStatus.reviewing, ApplicationStatus.ready):
        target = ApplicationStatus.reviewing if readiness.has_blocking(app.readiness) else ApplicationStatus.ready
        change_status(db, app, target, actor=actor)


def prepare_application(db: Session, user: User, job: Job, *, resume_id: int | None = None,
                        cover_letter_variant: str = "professional",
                        include_cover_letter: bool | None = None, actor: str = "agent") -> Application:
    """Prepare everything for review. Never submits. Caller commits.

    ``actor`` is recorded on status changes ("user" when the user asked for preparation).
    """
    bundle = load_bundle(db, user)
    settings = agent_settings(bundle)
    app = get_or_create_application(db, user, job)
    if app.status not in PREPARABLE:
        raise Conflict("This application has already been sent, so its documents can't be prepared again.")
    _ensure_match(db, job, bundle)
    snapshot_job(app, job)
    app.approved_at = None  # any earlier approval covered different documents
    change_status(db, app, ApplicationStatus.reviewing, actor=actor, note="Preparing application")

    resume, reason = select_resume(db, bundle, job, resume_id)
    version = tailor_version(db, bundle, resume, job, customize=settings.auto_customize_resume,
                             existing=app.resume_version)
    app.resume_id, app.resume_version_id = resume.id, version.id
    app.resume_version = version
    audit.record(db, user.id, "resume.customized",
                 f"Resume customized for {job.title} at {job.company_name}" if version.changes else
                 f"Resume selected for {job.title} at {job.company_name} (no automatic changes)",
                 actor="agent", entity_type="resume_version", entity_id=version.id,
                 details={"resume_id": resume.id, "selection_reason": reason, "changes": len(version.changes),
                          "keywords_missing": version.insights.get("keywords_missing", [])})

    company = _research_company(db, user, job, settings.auto_company_research)

    if should_include_cover_letter(settings, job, include_cover_letter):
        letter = write_cover_letter(db, bundle, job, company, cover_letter_variant, app.cover_letter)
        app.cover_letter_id, app.cover_letter = letter.id, letter
        audit.record(db, user.id, "cover_letter.generated",
                     f"Cover letter generated for {job.title} at {job.company_name}", actor="agent",
                     entity_type="cover_letter", entity_id=letter.id,
                     details={"variant": cover_letter_variant, "generated_by": letter.generated_by})
    else:
        app.cover_letter_id, app.cover_letter = None, None

    prepared = answers_service.prepare_answers(db, bundle, job, app)
    to_confirm = sum(1 for a in prepared if a.needs_confirmation and not a.confirmed)
    audit.record(db, user.id, "application.answers_prepared",
                 f"Prepared {len(prepared)} answers ({to_confirm} need your confirmation)",
                 actor="agent", entity_type="application", entity_id=app.id)

    app.prepared_at = utcnow()
    refresh_readiness(db, app, bundle, actor=actor)
    audit.record(db, user.id, "application.prepared", f"Application prepared for {job.title} at {job.company_name}",
                 actor="agent", entity_type="application", entity_id=app.id,
                 details={"status": app.status.value, "readiness": readiness.summarize(app.readiness)})
    db.flush()
    return app
