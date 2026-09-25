"""Networking contacts (recruiters, hiring managers) and message drafting."""

from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.models import Application, Job, Recruiter
from app.schemas.common import GeneratedText
from app.schemas.tracking import NetworkingMessageIn, RecruiterIn, RecruiterOut, RecruiterUpdate
from app.services import audit, networking

router = APIRouter(prefix="/recruiters", tags=["recruiters"])


def _application_counts(db: Session, recruiter_ids: list[int]) -> dict[int, int]:
    if not recruiter_ids:
        return {}
    rows = db.execute(select(Application.recruiter_id, func.count(Application.id))
                      .where(Application.recruiter_id.in_(recruiter_ids)).group_by(Application.recruiter_id))
    return {rid: count for rid, count in rows}


def recruiter_out(recruiter: Recruiter, applications_count: int = 0) -> RecruiterOut:
    out = RecruiterOut.model_validate(recruiter)
    out.applications_count = applications_count
    return out


@router.get("", response_model=list[RecruiterOut])
def list_recruiters(user: CurrentUser, db: DB) -> list[RecruiterOut]:
    recruiters = list(db.scalars(select(Recruiter).where(Recruiter.user_id == user.id).order_by(Recruiter.name)))
    counts = _application_counts(db, [r.id for r in recruiters])
    return [recruiter_out(r, counts.get(r.id, 0)) for r in recruiters]


@router.post("", response_model=RecruiterOut, status_code=201)
def create_recruiter(body: RecruiterIn, user: CurrentUser, db: DB) -> RecruiterOut:
    recruiter = Recruiter(user_id=user.id, **body.model_dump())
    db.add(recruiter)
    db.flush()
    at = f" ({recruiter.company})" if recruiter.company else ""
    audit.record(db, user.id, "contact.created", f"Added {recruiter.name}{at} to your contacts",
                 entity_type="recruiter", entity_id=recruiter.id)
    db.commit()
    return recruiter_out(recruiter)


@router.get("/{recruiter_id}", response_model=RecruiterOut)
def get_recruiter(recruiter_id: int, user: CurrentUser, db: DB) -> RecruiterOut:
    recruiter = get_owned(db, Recruiter, recruiter_id, user, "contact")
    return recruiter_out(recruiter, _application_counts(db, [recruiter.id]).get(recruiter.id, 0))


@router.patch("/{recruiter_id}", response_model=RecruiterOut)
def update_recruiter(recruiter_id: int, body: RecruiterUpdate, user: CurrentUser, db: DB) -> RecruiterOut:
    recruiter = get_owned(db, Recruiter, recruiter_id, user, "contact")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(recruiter, field, value)
    if changes:
        audit.record(db, user.id, "contact.updated", f"Updated contact details for {recruiter.name}",
                     entity_type="recruiter", entity_id=recruiter.id, details={"fields": sorted(changes)})
    db.commit()
    return recruiter_out(recruiter, _application_counts(db, [recruiter.id]).get(recruiter.id, 0))


@router.delete("/{recruiter_id}", status_code=204)
def delete_recruiter(recruiter_id: int, user: CurrentUser, db: DB) -> Response:
    recruiter = get_owned(db, Recruiter, recruiter_id, user, "contact")
    audit.record(db, user.id, "contact.deleted", f"Removed {recruiter.name} from your contacts",
                 entity_type="recruiter", entity_id=recruiter.id)
    db.delete(recruiter)
    db.commit()
    return Response(status_code=204)


@router.post("/{recruiter_id}/message", response_model=GeneratedText)
def draft_message(recruiter_id: int, body: NetworkingMessageIn, user: CurrentUser, db: DB) -> GeneratedText:
    recruiter = get_owned(db, Recruiter, recruiter_id, user, "contact")
    application = get_owned(db, Application, body.application_id, user, "application") if body.application_id else None
    job = get_owned(db, Job, body.job_id, user, "job") if body.job_id else None
    message = networking.generate_message(db, user, recruiter, body.purpose, application=application, job=job,
                                          extra_context=body.extra_context)
    audit.record(db, user.id, "contact.message_drafted",
                 f"Drafted a {networking.PURPOSE_LABELS[body.purpose]} message to {recruiter.name} for your review",
                 actor="agent", entity_type="recruiter", entity_id=recruiter.id,
                 details={"purpose": body.purpose, "generated_by": message.generated_by})
    db.commit()
    return message
