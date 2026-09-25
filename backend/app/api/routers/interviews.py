"""Interviews: scheduling, preparation, practice and calendar export."""

from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.api.deps import DB, CurrentUser, get_owned
from app.core.errors import AppError
from app.models import Application, Interview, utcnow
from app.schemas.tracking import (
    InterviewDetailOut,
    InterviewIn,
    InterviewOut,
    InterviewPrep,
    InterviewUpdate,
    PracticeEntry,
    PracticeIn,
)
from app.services import audit, practice
from app.services.ics import KIND_LABELS, interview_ics
from app.services.interview_prep import generate_prep

router = APIRouter(prefix="/interviews", tags=["interviews"])


def interview_out(interview: Interview) -> InterviewOut:
    out = InterviewOut.model_validate(interview)
    out.company_name, out.job_title = interview.application.company_name, interview.application.job_title
    return out


def interview_detail_out(interview: Interview) -> InterviewDetailOut:
    return InterviewDetailOut(
        **interview_out(interview).model_dump(),
        prep=InterviewPrep.model_validate(interview.prep or {}),
        practice_log=[PracticeEntry.model_validate(p) for p in interview.practice_log or []],
    )


def _describe(interview: Interview) -> str:
    kind = KIND_LABELS.get(interview.kind, "Interview").lower()
    when = f" on {interview.scheduled_at:%B} {interview.scheduled_at.day}" if interview.scheduled_at else ""
    return f"{kind} with {interview.application.company_name}{when}"


@router.get("", response_model=list[InterviewOut])
def list_interviews(user: CurrentUser, db: DB, upcoming: bool = False) -> list[InterviewOut]:
    stmt = select(Interview).options(joinedload(Interview.application)).where(Interview.user_id == user.id)
    if upcoming:
        stmt = stmt.where(Interview.scheduled_at >= utcnow()).order_by(Interview.scheduled_at.asc())
    else:
        stmt = stmt.order_by(Interview.scheduled_at.is_(None), Interview.scheduled_at.desc(), Interview.id.desc())
    return [interview_out(i) for i in db.scalars(stmt)]


@router.post("", response_model=InterviewDetailOut, status_code=201)
def create_interview(body: InterviewIn, user: CurrentUser, db: DB) -> InterviewDetailOut:
    application = get_owned(db, Application, body.application_id, user, "application")
    interview = Interview(user_id=user.id, outcome="pending", **body.model_dump())
    interview.application = application
    db.add(interview)
    db.flush()
    interview.prep = generate_prep(db, application)
    audit.record(db, user.id, "interview.scheduled", f"Added a {_describe(interview)} and prepared interview notes",
                 entity_type="interview", entity_id=interview.id, details={"application_id": application.id})
    db.commit()
    return interview_detail_out(interview)


@router.get("/{interview_id}", response_model=InterviewDetailOut)
def get_interview(interview_id: int, user: CurrentUser, db: DB) -> InterviewDetailOut:
    return interview_detail_out(get_owned(db, Interview, interview_id, user, "interview"))


@router.patch("/{interview_id}", response_model=InterviewDetailOut)
def update_interview(interview_id: int, body: InterviewUpdate, user: CurrentUser, db: DB) -> InterviewDetailOut:
    interview = get_owned(db, Interview, interview_id, user, "interview")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(interview, field, value)
    if changes:
        audit.record(db, user.id, "interview.updated", f"Updated the {_describe(interview)}",
                     entity_type="interview", entity_id=interview.id, details={"fields": sorted(changes)})
    db.commit()
    return interview_detail_out(interview)


@router.delete("/{interview_id}", status_code=204)
def delete_interview(interview_id: int, user: CurrentUser, db: DB) -> Response:
    interview = get_owned(db, Interview, interview_id, user, "interview")
    audit.record(db, user.id, "interview.deleted", f"Removed the {_describe(interview)}",
                 entity_type="interview", entity_id=interview.id)
    db.delete(interview)
    db.commit()
    return Response(status_code=204)


@router.post("/{interview_id}/prep/regenerate", response_model=InterviewDetailOut)
def regenerate_prep(interview_id: int, user: CurrentUser, db: DB) -> InterviewDetailOut:
    interview = get_owned(db, Interview, interview_id, user, "interview")
    interview.prep = generate_prep(db, interview.application)
    audit.record(db, user.id, "interview.prep_generated", f"Refreshed preparation notes for the {_describe(interview)}",
                 actor="agent", entity_type="interview", entity_id=interview.id)
    db.commit()
    return interview_detail_out(interview)


@router.post("/{interview_id}/practice", response_model=PracticeEntry)
def practice_answer(interview_id: int, body: PracticeIn, user: CurrentUser, db: DB) -> PracticeEntry:
    interview = get_owned(db, Interview, interview_id, user, "interview")
    entry = practice.evaluate(body.question, body.answer)
    interview.practice_log = [*(interview.practice_log or []), entry.model_dump(mode="json")]
    db.commit()
    return entry


@router.get("/{interview_id}/ics")
def interview_calendar_file(interview_id: int, user: CurrentUser, db: DB) -> Response:
    interview = get_owned(db, Interview, interview_id, user, "interview")
    if interview.scheduled_at is None:
        raise AppError("Add a date and time to this interview before adding it to your calendar.",
                       code="not_scheduled")
    return Response(content=interview_ics(interview), media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="interview-{interview.id}.ics"'})
