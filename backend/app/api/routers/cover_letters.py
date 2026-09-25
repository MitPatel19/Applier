"""Cover letters: generate (3 variants), edit, switch variants, render."""

from __future__ import annotations

import re
from datetime import date

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.api.routers.resumes import DocFormat, attachment
from app.api.serializers_applications import cover_letter_out, cover_letter_outs
from app.core.errors import AppError
from app.models import CoverLetter, Job, Template
from app.schemas.resume import CoverLetterCreate, CoverLetterGenerateIn, CoverLetterOut, CoverLetterUpdate
from app.services import audit, cover_letter, documents
from app.services.profile_bundle import load_bundle
from app.services.resume_builder import build_contact

router = APIRouter(prefix="/cover-letters", tags=["cover-letters"])


def _job(db: Session, letter: CoverLetter) -> Job | None:
    return db.get(Job, letter.job_id) if letter.job_id else None


@router.get("", response_model=list[CoverLetterOut])
def list_cover_letters(user: CurrentUser, db: DB, job_id: int | None = Query(None)) -> list[CoverLetterOut]:
    query = select(CoverLetter).where(CoverLetter.user_id == user.id)
    if job_id is not None:
        query = query.where(CoverLetter.job_id == job_id)
    return cover_letter_outs(db, list(db.scalars(query.order_by(CoverLetter.updated_at.desc()))))


@router.post("/generate", response_model=CoverLetterOut, status_code=201)
def generate_cover_letter(payload: CoverLetterGenerateIn, user: CurrentUser, db: DB) -> CoverLetterOut:
    job = get_owned(db, Job, payload.job_id, user, "job")
    template = get_owned(db, Template, payload.template_id, user, "template") if payload.template_id else None
    if template is not None and template.kind != "cover_letter":
        raise AppError("That template isn't a cover letter template.", code="wrong_template_kind", status_code=422)
    draft = cover_letter.generate(load_bundle(db, user), job, job.company, template)
    letter = CoverLetter(user_id=user.id, job_id=job.id, title=f"{job.title} — {job.company_name}"[:255],
                         variant=payload.variant, content=draft.variants[payload.variant], variants=draft.variants,
                         status="draft", generated_by=draft.generated_by)
    db.add(letter)
    db.flush()
    audit.record(db, user.id, "cover_letter.generated", f"Cover letter generated for {job.title} at {job.company_name}",
                 entity_type="cover_letter", entity_id=letter.id,
                 details={"variant": payload.variant, "generated_by": draft.generated_by,
                          "template_id": payload.template_id})
    db.commit()
    return cover_letter_out(letter, job)


@router.post("", response_model=CoverLetterOut, status_code=201)
def create_cover_letter(payload: CoverLetterCreate, user: CurrentUser, db: DB) -> CoverLetterOut:
    job = get_owned(db, Job, payload.job_id, user, "job") if payload.job_id else None
    letter = CoverLetter(user_id=user.id, job_id=payload.job_id, title=payload.title, content=payload.content,
                         variant="professional", variants={}, status="draft", generated_by="user")
    db.add(letter)
    db.flush()
    audit.record(db, user.id, "cover_letter.created", f"Created cover letter “{letter.title}”",
                 entity_type="cover_letter", entity_id=letter.id)
    db.commit()
    return cover_letter_out(letter, job)


@router.get("/{letter_id}", response_model=CoverLetterOut)
def get_cover_letter(letter_id: int, user: CurrentUser, db: DB) -> CoverLetterOut:
    letter = get_owned(db, CoverLetter, letter_id, user, "cover letter")
    return cover_letter_out(letter, _job(db, letter))


@router.patch("/{letter_id}", response_model=CoverLetterOut)
def update_cover_letter(letter_id: int, payload: CoverLetterUpdate, user: CurrentUser, db: DB) -> CoverLetterOut:
    letter = get_owned(db, CoverLetter, letter_id, user, "cover letter")
    before = (letter.variant, letter.content)
    if payload.variant is not None:
        if payload.variant not in (letter.variants or {}) and payload.content is None:
            raise AppError("That version of the letter isn't available. Generate the letter again to get it.",
                           code="variant_missing", status_code=422)
        letter.variant = payload.variant
        if payload.content is None:
            letter.content = letter.variants[payload.variant]
    if payload.content is not None and payload.content != letter.content:
        letter.content = payload.content
        letter.variants = {**(letter.variants or {}), letter.variant: payload.content}
        letter.generated_by = "user"
    if payload.title is not None:
        letter.title = payload.title
    if payload.status is not None:
        letter.status = payload.status
    elif (letter.variant, letter.content) != before:
        letter.status = "draft"  # edited text needs a fresh approval
    audit.record(db, user.id, "cover_letter.updated", f"Updated cover letter “{letter.title}”",
                 entity_type="cover_letter", entity_id=letter.id,
                 details={"fields": sorted(payload.model_dump(exclude_unset=True))})
    db.commit()
    return cover_letter_out(letter, _job(db, letter))


@router.delete("/{letter_id}", status_code=204)
def delete_cover_letter(letter_id: int, user: CurrentUser, db: DB) -> Response:
    letter = get_owned(db, CoverLetter, letter_id, user, "cover letter")
    audit.record(db, user.id, "cover_letter.deleted", f"Deleted cover letter “{letter.title}”",
                 entity_type="cover_letter", entity_id=letter.id)
    db.delete(letter)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def cover_letter_file_name(company: str | None, fmt: DocFormat = "pdf") -> str:
    """``XYZ_Cover_Letter.pdf``"""
    stem = re.sub(r"[^A-Za-z0-9]+", "_", company or "").strip("_") or "My"
    return f"{stem}_Cover_Letter.{fmt}"


@router.get("/{letter_id}/render")
def render_cover_letter(letter_id: int, user: CurrentUser, db: DB,
                        fmt: DocFormat = Query("pdf", alias="format")) -> Response:
    letter = get_owned(db, CoverLetter, letter_id, user, "cover letter")
    job = _job(db, letter)
    company = job.company_name if job else None
    data = documents.render_cover_letter(letter.content, build_contact(load_bundle(db, user)), fmt, company=company,
                                         on=date.today())
    return attachment(data, cover_letter_file_name(company, fmt), documents.MIME_TYPES[fmt])
