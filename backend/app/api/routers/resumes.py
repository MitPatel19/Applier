"""Resumes: uploads (parsed), profile-built resumes, rendering, and job-tailored versions."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.api.serializers_applications import (
    resume_detail_out,
    resume_out,
    resume_outs,
    resume_version_detail_out,
    resume_version_out,
)
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.storage import get_storage, safe_filename
from app.models import Job, Resume, ResumeVersion, User
from app.schemas.profile import ParsedResume
from app.schemas.resume import (
    ChangeDecisionIn,
    ResumeCreateFromProfile,
    ResumeDetailOut,
    ResumeOut,
    ResumeUpdate,
    ResumeVersionDetailOut,
    ResumeVersionOut,
    TailorIn,
)
from app.services import audit, documents, resume_parser, resume_tailor
from app.services.application_prep import build_profile_resume, select_resume, tailor_version
from app.services.profile_bundle import load_bundle

router = APIRouter(prefix="/resumes", tags=["resumes"])

DocFormat = Literal["pdf", "docx"]


def attachment(data: bytes, file_name: str, media_type: str) -> Response:
    return Response(content=data, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{safe_filename(file_name)}"'})


def _set_default(db: Session, user: User, resume: Resume) -> None:
    db.execute(update(Resume).where(Resume.user_id == user.id, Resume.id != resume.id).values(is_default=False))
    resume.is_default = True


def _has_resumes(db: Session, user: User) -> bool:
    return db.scalar(select(Resume.id).where(Resume.user_id == user.id).limit(1)) is not None


def _read_upload(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise AppError(f"This file is larger than {get_settings().max_upload_mb} MB. Please upload a smaller file.",
                       code="file_too_large", status_code=413)
    if not data:
        raise AppError("The file is empty. Please choose your resume file again.", code="empty_file")
    return data


def _person_file_name(user: User, suffix: str, fmt: DocFormat) -> str:
    names = user.full_name.split()
    person = "_".join([names[0], names[-1]] if len(names) > 1 else names) or "Resume"
    return f"{person}_{suffix}.{fmt}"


# ---------------------------------------------------------------------------
# Tailored versions (declared before "/{resume_id}" routes for clarity)
# ---------------------------------------------------------------------------


def _refresh_version(db: Session, version: ResumeVersion) -> None:
    """Re-derive content from base + decisions and update the job-keyword analysis."""
    version.content = resume_tailor.apply_changes(version.base_content or {}, version.changes or [])
    job = db.get(Job, version.job_id) if version.job_id else None
    if job is not None:
        version.ats_score, matched = resume_tailor.evaluate(version.content, job)
        version.insights = {**(version.insights or {}), "keywords_matched": matched}


@router.post("/tailor", response_model=ResumeVersionDetailOut, status_code=201)
def tailor_resume(payload: TailorIn, user: CurrentUser, db: DB) -> ResumeVersionDetailOut:
    job = get_owned(db, Job, payload.job_id, user, "job")
    bundle = load_bundle(db, user)
    resume, reason = select_resume(db, bundle, job, payload.resume_id)
    version = tailor_version(db, bundle, resume, job)
    audit.record(db, user.id, "resume.customized", f"Resume customized for {job.title} at {job.company_name}",
                 entity_type="resume_version", entity_id=version.id,
                 details={"resume_id": resume.id, "selection_reason": reason, "changes": len(version.changes)})
    db.commit()
    return resume_version_detail_out(version)


@router.get("/versions/{version_id}", response_model=ResumeVersionDetailOut)
def get_version(version_id: int, user: CurrentUser, db: DB) -> ResumeVersionDetailOut:
    return resume_version_detail_out(get_owned(db, ResumeVersion, version_id, user, "resume version"))


@router.post("/versions/{version_id}/decisions", response_model=ResumeVersionDetailOut)
def decide_changes(version_id: int, payload: ChangeDecisionIn, user: CurrentUser, db: DB) -> ResumeVersionDetailOut:
    version = get_owned(db, ResumeVersion, version_id, user, "resume version")
    known = {c["id"] for c in version.changes or []}
    unknown = sorted(set(payload.decisions) - known)
    if unknown:
        raise AppError("Some of those changes no longer exist. Please refresh and try again.",
                       code="unknown_changes", status_code=422, details=[{"field": "decisions", "message": i}
                                                                         for i in unknown])
    version.changes = [{**c, "accepted": payload.decisions.get(c["id"], c.get("accepted"))} for c in version.changes]
    version.status = "draft"
    _refresh_version(db, version)
    accepted = sum(1 for v in payload.decisions.values() if v)
    audit.record(db, user.id, "resume.changes_reviewed",
                 f"Reviewed resume changes: {accepted} accepted, {len(payload.decisions) - accepted} rejected",
                 entity_type="resume_version", entity_id=version.id, details={"decisions": payload.decisions})
    db.commit()
    return resume_version_detail_out(version)


@router.post("/versions/{version_id}/approve", response_model=ResumeVersionDetailOut)
def approve_version(version_id: int, user: CurrentUser, db: DB) -> ResumeVersionDetailOut:
    version = get_owned(db, ResumeVersion, version_id, user, "resume version")
    version.changes = [{**c, "accepted": False if c.get("accepted") is None else c["accepted"]}
                       for c in version.changes or []]
    version.status = "approved"
    _refresh_version(db, version)
    audit.record(db, user.id, "resume.version_approved", f"Approved tailored resume “{version.label}”",
                 entity_type="resume_version", entity_id=version.id)
    db.commit()
    return resume_version_detail_out(version)


@router.get("/versions/{version_id}/render")
def render_version(version_id: int, user: CurrentUser, db: DB,
                   fmt: DocFormat = Query("pdf", alias="format")) -> Response:
    version = get_owned(db, ResumeVersion, version_id, user, "resume version")
    data = documents.render_resume(version.content or {}, fmt)
    return attachment(data, documents.with_extension(version.file_name, fmt), documents.MIME_TYPES[fmt])


# ---------------------------------------------------------------------------
# Resumes
# ---------------------------------------------------------------------------


@router.get("", response_model=list[ResumeOut])
def list_resumes(user: CurrentUser, db: DB) -> list[ResumeOut]:
    resumes = list(db.scalars(select(Resume).where(Resume.user_id == user.id)
                              .order_by(Resume.is_default.desc(), Resume.updated_at.desc())))
    return resume_outs(db, resumes)


@router.post("", response_model=ResumeDetailOut, status_code=201)
def upload_resume(user: CurrentUser, db: DB, file: UploadFile = File(...),
                  name: str = Form(..., min_length=1, max_length=200), target_role: str | None = Form(None),
                  set_default: bool = Form(False)) -> ResumeDetailOut:
    data = _read_upload(file)
    filename = file.filename or "resume"
    kind = resume_parser.detect_kind(data, filename)
    if kind is None:
        raise AppError("Please upload a PDF or Word (.docx) file.", code="unsupported_file", status_code=415)
    try:
        text, parsed = resume_parser.parse_file(data, filename)
    except resume_parser.ResumeReadError as exc:
        raise AppError(str(exc), code="unreadable_file", status_code=422) from exc
    first = not _has_resumes(db, user)
    resume = Resume(
        user_id=user.id, name=name.strip(), target_role=target_role or None, status="active", is_default=False,
        file_key=get_storage().put(user.id, filename, data), file_name=filename,
        mime_type=resume_parser.PDF_MIME if kind == "pdf" else resume_parser.DOCX_MIME, file_size=len(data),
        parsed_text=text, content=resume_parser.parsed_to_content(parsed, user),
    )
    db.add(resume)
    db.flush()
    if first or set_default:
        _set_default(db, user, resume)
    audit.record(db, user.id, "resume.uploaded", f"Uploaded resume “{resume.name}”", entity_type="resume",
                 entity_id=resume.id, details={"warnings": parsed.warnings})
    db.commit()
    return resume_detail_out(db, resume)


@router.post("/from-profile", response_model=ResumeDetailOut, status_code=201)
def create_from_profile(payload: ResumeCreateFromProfile, user: CurrentUser, db: DB) -> ResumeDetailOut:
    resume = build_profile_resume(db, load_bundle(db, user), payload.target_role, payload.name)
    if payload.set_default:
        _set_default(db, user, resume)
    audit.record(db, user.id, "resume.created", f"Created resume “{resume.name}” from your profile",
                 entity_type="resume", entity_id=resume.id)
    db.commit()
    return resume_detail_out(db, resume)


@router.get("/{resume_id}", response_model=ResumeDetailOut)
def get_resume(resume_id: int, user: CurrentUser, db: DB) -> ResumeDetailOut:
    return resume_detail_out(db, get_owned(db, Resume, resume_id, user, "resume"))


@router.patch("/{resume_id}", response_model=ResumeDetailOut)
def update_resume(resume_id: int, payload: ResumeUpdate, user: CurrentUser, db: DB) -> ResumeDetailOut:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    changes = payload.model_dump(exclude_unset=True, exclude={"content"})
    for key, value in changes.items():
        setattr(resume, key, value)
    if payload.content is not None:
        content = payload.content.model_dump()
        if content != resume.content:
            resume.content = content
            resume.version += 1
            changes["content"] = f"version {resume.version}"
    audit.record(db, user.id, "resume.updated", f"Updated resume “{resume.name}”", entity_type="resume",
                 entity_id=resume.id, details={"fields": sorted(changes)})
    db.commit()
    return resume_detail_out(db, resume)


@router.post("/{resume_id}/default", response_model=ResumeOut)
def make_default(resume_id: int, user: CurrentUser, db: DB) -> ResumeOut:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    _set_default(db, user, resume)
    audit.record(db, user.id, "resume.default_set", f"Set “{resume.name}” as your default resume",
                 entity_type="resume", entity_id=resume.id)
    db.commit()
    return resume_out(db, resume)


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: int, user: CurrentUser, db: DB) -> Response:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    was_default, file_key, name = resume.is_default, resume.file_key, resume.name
    db.delete(resume)
    db.flush()
    if was_default:
        successor = db.scalar(select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc()))
        if successor is not None:
            successor.is_default = True
    audit.record(db, user.id, "resume.deleted", f"Deleted resume “{name}”", entity_type="resume", entity_id=resume_id)
    db.commit()
    if file_key:
        get_storage().delete(file_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{resume_id}/file")
def download_original(resume_id: int, user: CurrentUser, db: DB) -> Response:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    if not resume.file_key:
        raise AppError("This resume was created in Applier, so there's no uploaded file. Use Download instead.",
                       code="no_file", status_code=404)
    return attachment(get_storage().get(resume.file_key), resume.file_name or "resume",
                      resume.mime_type or "application/octet-stream")


@router.get("/{resume_id}/parsed", response_model=ParsedResume)
def get_parsed(resume_id: int, user: CurrentUser, db: DB) -> ParsedResume:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    if not resume.parsed_text:
        raise AppError("This resume was created in Applier, so there's nothing to import.", code="not_uploaded",
                       status_code=404)
    return resume_parser.parse_text(resume.parsed_text)


@router.get("/{resume_id}/render")
def render_resume(resume_id: int, user: CurrentUser, db: DB,
                  fmt: DocFormat = Query("pdf", alias="format")) -> Response:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    data = documents.render_resume(resume.content or {}, fmt)
    return attachment(data, _person_file_name(user, "Resume", fmt), documents.MIME_TYPES[fmt])


@router.get("/{resume_id}/versions", response_model=list[ResumeVersionOut])
def list_versions(resume_id: int, user: CurrentUser, db: DB) -> list[ResumeVersionOut]:
    resume = get_owned(db, Resume, resume_id, user, "resume")
    versions = db.scalars(select(ResumeVersion).where(ResumeVersion.resume_id == resume.id)
                          .order_by(ResumeVersion.created_at.desc()))
    return [resume_version_out(v) for v in versions]
