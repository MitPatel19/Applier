"""Application answers: add custom questions, edit (becomes the user's own answer), delete."""

from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.core.errors import NotFound
from app.models import Application, ApplicationAnswer, User
from app.schemas.applications import AnswerIn, AnswerOut, AnswerUpdate
from app.services import audit
from app.services.application_prep import invalidate_approval, refresh_readiness
from app.services.profile_bundle import load_bundle

router = APIRouter(tags=["application-answers"])


def _owned_answer(db: Session, answer_id: int, user: User) -> ApplicationAnswer:
    answer = db.scalar(select(ApplicationAnswer).join(Application)
                       .where(ApplicationAnswer.id == answer_id, Application.user_id == user.id))
    if answer is None:
        raise NotFound("answer")
    return answer


def _after_edit(db: Session, user: User, app: Application, *, content_changed: bool = True) -> None:
    if content_changed:
        invalidate_approval(db, app, "answers")
    refresh_readiness(db, app, load_bundle(db, user), actor="user")


@router.post("/applications/{app_id}/answers", response_model=AnswerOut, status_code=201)
def add_answer(app_id: int, payload: AnswerIn, user: CurrentUser, db: DB) -> ApplicationAnswer:
    app = get_owned(db, Application, app_id, user, "application")
    answer = ApplicationAnswer(**payload.model_dump(), source="user", needs_confirmation=False, confirmed=True,
                               sort_order=max((a.sort_order for a in app.answers), default=-1) + 1)
    app.answers.append(answer)
    db.flush()
    _after_edit(db, user, app)
    audit.record(db, user.id, "application.answer_added", f"Added a question for {app.job_title}: {answer.question}",
                 entity_type="application", entity_id=app.id)
    db.commit()
    return answer


@router.patch("/application-answers/{answer_id}", response_model=AnswerOut)
def update_answer(answer_id: int, payload: AnswerUpdate, user: CurrentUser, db: DB) -> ApplicationAnswer:
    answer = _owned_answer(db, answer_id, user)
    app = answer.application
    edited = payload.answer is not None and payload.answer != answer.answer
    if edited:
        answer.answer = payload.answer
        answer.source = "user"
        answer.confirmed = True  # the user wrote this answer themselves
    if payload.confirmed is not None:
        answer.confirmed = payload.confirmed
    _after_edit(db, user, app, content_changed=edited)
    audit.record(db, user.id, "application.answer_updated",
                 f"{'Edited' if edited else 'Reviewed'} the answer to "
                 f"“{answer.question}”", entity_type="application", entity_id=app.id)
    db.commit()
    return answer


@router.delete("/application-answers/{answer_id}", status_code=204)
def delete_answer(answer_id: int, user: CurrentUser, db: DB) -> Response:
    answer = _owned_answer(db, answer_id, user)
    app = answer.application
    app.answers.remove(answer)
    db.flush()
    _after_edit(db, user, app)
    audit.record(db, user.id, "application.answer_removed", f"Removed the question “{answer.question}”",
                 entity_type="application", entity_id=app.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
