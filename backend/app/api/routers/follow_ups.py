"""Follow-up reminders and follow-up email drafts."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.models import Application, FollowUp, Recruiter, User, utcnow
from app.schemas.common import GeneratedText
from app.schemas.tracking import FollowUpIn, FollowUpOut, FollowUpSuggestion, FollowUpUpdate
from app.services import audit, followups

router = APIRouter(prefix="/follow-ups", tags=["follow-ups"])


def _subject_of(db: Session, item: FollowUp) -> str:
    out = followups.followup_out(db, item)
    if out.company_name and out.job_title:
        return f"{out.job_title} at {out.company_name}"
    return out.recruiter_name or out.company_name or "your follow-up"


def _check_links(db: Session, user: User, application_id: int | None, recruiter_id: int | None) -> None:
    if application_id:
        get_owned(db, Application, application_id, user, "application")
    if recruiter_id:
        get_owned(db, Recruiter, recruiter_id, user, "contact")


@router.get("", response_model=list[FollowUpOut])
def list_follow_ups(user: CurrentUser, db: DB,
                    status: Literal["pending", "done", "dismissed", "snoozed"] | None = None) -> list[FollowUpOut]:
    stmt = select(FollowUp).where(FollowUp.user_id == user.id)
    if status:
        stmt = stmt.where(FollowUp.status == status)
    return followups.followups_out(db, list(db.scalars(stmt.order_by(FollowUp.due_at))))


@router.get("/suggestions", response_model=list[FollowUpSuggestion])
def follow_up_suggestions(user: CurrentUser, db: DB) -> list[FollowUpSuggestion]:
    return followups.suggestions(db, user)


@router.post("", response_model=FollowUpOut, status_code=201)
def create_follow_up(body: FollowUpIn, user: CurrentUser, db: DB) -> FollowUpOut:
    _check_links(db, user, body.application_id, body.recruiter_id)
    item = FollowUp(user_id=user.id, **body.model_dump())
    db.add(item)
    db.flush()
    audit.record(db, user.id, "follow_up.created",
                 f"Scheduled a follow-up for {_subject_of(db, item)} on {item.due_at:%B} {item.due_at.day}",
                 entity_type="follow_up", entity_id=item.id)
    db.commit()
    return followups.followup_out(db, item)


@router.patch("/{follow_up_id}", response_model=FollowUpOut)
def update_follow_up(follow_up_id: int, body: FollowUpUpdate, user: CurrentUser, db: DB) -> FollowUpOut:
    item = get_owned(db, FollowUp, follow_up_id, user, "follow-up")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(item, field, value)
    if "due_at" in changes:
        item.notified_at = None  # re-arm the reminder for the new date
    if changes.get("status") == "done" and item.completed_at is None:
        item.completed_at = utcnow()
    if changes:
        audit.record(db, user.id, "follow_up.updated", f"Updated the follow-up for {_subject_of(db, item)}",
                     entity_type="follow_up", entity_id=item.id, details={"fields": sorted(changes)})
    db.commit()
    return followups.followup_out(db, item)


@router.delete("/{follow_up_id}", status_code=204)
def delete_follow_up(follow_up_id: int, user: CurrentUser, db: DB) -> Response:
    item = get_owned(db, FollowUp, follow_up_id, user, "follow-up")
    audit.record(db, user.id, "follow_up.deleted", f"Removed the follow-up for {_subject_of(db, item)}",
                 entity_type="follow_up", entity_id=item.id)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.post("/{follow_up_id}/complete", response_model=FollowUpOut)
def complete_follow_up(follow_up_id: int, user: CurrentUser, db: DB) -> FollowUpOut:
    item = get_owned(db, FollowUp, follow_up_id, user, "follow-up")
    item.status, item.completed_at = "done", utcnow()
    audit.record(db, user.id, "follow_up.completed", f"Marked the follow-up for {_subject_of(db, item)} as done",
                 entity_type="follow_up", entity_id=item.id)
    db.commit()
    return followups.followup_out(db, item)


@router.post("/{follow_up_id}/generate-message", response_model=GeneratedText)
def generate_follow_up_message(follow_up_id: int, user: CurrentUser, db: DB) -> GeneratedText:
    item = get_owned(db, FollowUp, follow_up_id, user, "follow-up")
    message = followups.generate_message(db, user, item)
    audit.record(db, user.id, "follow_up.message_drafted",
                 f"Drafted a follow-up email for {_subject_of(db, item)} for your review", actor="agent",
                 entity_type="follow_up", entity_id=item.id, details={"generated_by": message.generated_by})
    db.commit()
    return message
