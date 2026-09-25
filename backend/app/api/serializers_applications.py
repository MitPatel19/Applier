"""ORM -> schema serializers for resumes, cover letters and applications.

List serializers compute derived fields with a fixed number of queries (no N+1).
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import company_out, job_detail_out, match_out
from app.models import Application, CoverLetter, FollowUp, Interview, Job, Resume, ResumeVersion, utcnow
from app.schemas.applications import (
    AnswerOut,
    ApplicationDetailOut,
    ApplicationDocumentOut,
    ApplicationOut,
    FollowUpBrief,
    InterviewBrief,
    ReadinessItem,
    StatusChangeOut,
)
from app.schemas.resume import (
    CoverLetterOut,
    ResumeContent,
    ResumeDetailOut,
    ResumeOut,
    ResumeVersionDetailOut,
    ResumeVersionOut,
)
from app.services.readiness import summarize

# ---------------------------------------------------------------------------
# Resumes
# ---------------------------------------------------------------------------


def _skills_count(content: dict | None) -> int:
    return sum(len(g.get("items", [])) for g in (content or {}).get("skills", []))


def _versions_counts(db: Session, resume_ids: list[int]) -> dict[int, int]:
    if not resume_ids:
        return {}
    rows = db.execute(select(ResumeVersion.resume_id, func.count(ResumeVersion.id))
                      .where(ResumeVersion.resume_id.in_(resume_ids)).group_by(ResumeVersion.resume_id))
    return {rid: count for rid, count in rows}


def _resume_out(resume: Resume, versions_count: int) -> ResumeOut:
    out = ResumeOut.model_validate(resume)
    out.has_file = bool(resume.file_key)
    out.skills_count = _skills_count(resume.content)
    out.versions_count = versions_count
    return out


def resume_outs(db: Session, resumes: Sequence[Resume]) -> list[ResumeOut]:
    counts = _versions_counts(db, [r.id for r in resumes])
    return [_resume_out(r, counts.get(r.id, 0)) for r in resumes]


def resume_out(db: Session, resume: Resume) -> ResumeOut:
    return resume_outs(db, [resume])[0]


def resume_detail_out(db: Session, resume: Resume) -> ResumeDetailOut:
    return ResumeDetailOut(**resume_out(db, resume).model_dump(),
                           content=ResumeContent.model_validate(resume.content or {}), parsed_text=resume.parsed_text)


def resume_version_out(version: ResumeVersion) -> ResumeVersionOut:
    return ResumeVersionOut.model_validate(version)


def resume_version_detail_out(version: ResumeVersion) -> ResumeVersionDetailOut:
    insights = version.insights or {}
    return ResumeVersionDetailOut(
        **resume_version_out(version).model_dump(),
        content=ResumeContent.model_validate(version.content or {}),
        base_content=ResumeContent.model_validate(version.base_content or {}),
        changes=version.changes or [],
        keywords_matched=insights.get("keywords_matched", []),
        keywords_missing=insights.get("keywords_missing", []),
        integrity_notes=insights.get("integrity_notes", []),
    )


# ---------------------------------------------------------------------------
# Cover letters
# ---------------------------------------------------------------------------


def cover_letter_out(letter: CoverLetter, job: Job | None) -> CoverLetterOut:
    out = CoverLetterOut.model_validate(letter)
    if job is not None:
        out.company_name, out.job_title = job.company_name, job.title
    return out


def cover_letter_outs(db: Session, letters: Sequence[CoverLetter]) -> list[CoverLetterOut]:
    job_ids = {letter.job_id for letter in letters if letter.job_id}
    jobs = {j.id: j for j in db.scalars(select(Job).where(Job.id.in_(job_ids)))} if job_ids else {}
    return [cover_letter_out(letter, jobs.get(letter.job_id) if letter.job_id else None) for letter in letters]


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------


def _resume_names(db: Session, apps: Sequence[Application]) -> dict[int, str]:
    ids = {a.resume_id for a in apps if a.resume_id}
    return dict(db.execute(select(Resume.id, Resume.name).where(Resume.id.in_(ids))).all()) if ids else {}


def _next_interviews(db: Session, app_ids: list[int]) -> dict[int, datetime]:
    rows = db.execute(select(Interview.application_id, func.min(Interview.scheduled_at))
                      .where(Interview.application_id.in_(app_ids), Interview.scheduled_at >= utcnow())
                      .group_by(Interview.application_id))
    return dict(rows.all())


def _next_follow_ups(db: Session, app_ids: list[int]) -> dict[int, datetime]:
    rows = db.execute(select(FollowUp.application_id, func.min(FollowUp.due_at))
                      .where(FollowUp.application_id.in_(app_ids), FollowUp.status == "pending")
                      .group_by(FollowUp.application_id))
    return dict(rows.all())


def application_outs(db: Session, apps: Sequence[Application]) -> list[ApplicationOut]:
    if not apps:
        return []
    ids = [a.id for a in apps]
    names, interviews, follow_ups = _resume_names(db, apps), _next_interviews(db, ids), _next_follow_ups(db, ids)
    out: list[ApplicationOut] = []
    for app in apps:
        item = ApplicationOut.model_validate(app)
        item.status = app.status.value
        item.resume_name = names.get(app.resume_id) if app.resume_id else None
        item.next_interview_at = interviews.get(app.id)
        item.next_follow_up_at = follow_ups.get(app.id)
        item.readiness_summary = summarize(app.readiness or [])
        out.append(item)
    return out


def application_out(db: Session, app: Application) -> ApplicationOut:
    return application_outs(db, [app])[0]


def application_detail_out(db: Session, app: Application) -> ApplicationDetailOut:
    base = application_out(db, app)
    job = app.job
    follow_ups = db.scalars(select(FollowUp).where(FollowUp.application_id == app.id).order_by(FollowUp.due_at))
    return ApplicationDetailOut(
        **base.model_dump(),
        apply_url=app.apply_url,
        job=job_detail_out(db, job) if job else None,
        match=match_out(job.match) if job else None,
        company=company_out(db, job.company) if job else None,
        resume=resume_out(db, app.resume) if app.resume else None,
        resume_version=resume_version_detail_out(app.resume_version) if app.resume_version else None,
        cover_letter=cover_letter_out(app.cover_letter, job) if app.cover_letter else None,
        answers=[AnswerOut.model_validate(a) for a in sorted(app.answers, key=lambda a: a.sort_order)],
        readiness=[ReadinessItem.model_validate(i) for i in app.readiness or []],
        documents=[ApplicationDocumentOut.model_validate(d) for d in app.documents],
        status_history=[StatusChangeOut.model_validate(h) for h in app.status_history],
        interviews=[InterviewBrief.model_validate(i) for i in app.interviews],
        follow_ups=[FollowUpBrief.model_validate(f) for f in follow_ups],
    )
