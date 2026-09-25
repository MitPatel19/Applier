"""Application status transitions: history, audit trail and side effects."""

from __future__ import annotations

import logging

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Application, ApplicationStatus, ApplicationStatusChange, FollowUp, Interview, utcnow
from app.schemas.applications import STATUS_LABELS
from app.services import audit, notifications

log = logging.getLogger("applier.applications")

INTERVIEW_KINDS: dict[ApplicationStatus, str] = {
    ApplicationStatus.interview: "phone_screen",
    ApplicationStatus.technical_interview: "technical",
    ApplicationStatus.final_interview: "final",
}
# Intermediate steps the agent moves through while preparing; not worth a notification on their own.
QUIET_STATUSES = {ApplicationStatus.discovered, ApplicationStatus.saved, ApplicationStatus.reviewing}
CLOSING_STATUSES = {ApplicationStatus.offer, ApplicationStatus.rejected, ApplicationStatus.withdrawn,
                    ApplicationStatus.closed}


def label(status: ApplicationStatus | str) -> str:
    value = status.value if isinstance(status, ApplicationStatus) else status
    return STATUS_LABELS.get(value, value.replace("_", " ").title())


def _next_board_position(db: Session, app: Application, status: ApplicationStatus) -> float:
    current_max = db.scalar(select(func.max(Application.board_position)).where(
        Application.user_id == app.user_id, Application.status == status, Application.id != app.id))
    return float(current_max or 0) + 1.0


def _has_upcoming_interview(db: Session, app: Application, kind: str) -> bool:
    now = utcnow()
    return db.scalar(select(func.count(Interview.id)).where(
        Interview.application_id == app.id, Interview.kind == kind,
        (Interview.scheduled_at.is_(None)) | (Interview.scheduled_at >= now),
        (Interview.outcome.is_(None)) | (Interview.outcome == "pending"),
    )) > 0


def _generate_prep(db: Session, app: Application) -> dict:
    try:
        from app.services import interview_prep

        return interview_prep.generate_prep(db, app)
    except (ImportError, AttributeError):
        return {}
    except Exception:  # prep is helpful but never worth failing a status change for
        log.exception("Interview prep generation failed for application %s", app.id)
        return {}


def _create_interview(db: Session, app: Application, kind: str) -> None:
    if _has_upcoming_interview(db, app, kind):
        return
    interview = Interview(user_id=app.user_id, kind=kind, outcome="pending", interviewers=[], practice_log=[], prep={})
    app.interviews.append(interview)
    db.flush()
    interview.prep = _generate_prep(db, app)
    audit.record(db, app.user_id, "interview.created", f"Interview added for {app.job_title} at {app.company_name}",
                 actor="agent", entity_type="interview", entity_id=interview.id, details={"kind": kind})


def _dismiss_follow_ups(db: Session, app: Application) -> None:
    db.execute(update(FollowUp).where(FollowUp.application_id == app.id, FollowUp.status == "pending")
               .values(status="dismissed"))


def change_status(db: Session, app: Application, new_status: ApplicationStatus | str, *, actor: str = "user",
                  note: str | None = None, board_position: float | None = None) -> Application:
    """Move ``app`` to ``new_status`` with history, audit and side effects. Caller commits."""
    target = ApplicationStatus(new_status)
    previous = app.status
    if target == previous:
        if board_position is not None:
            app.board_position = board_position
        return app
    app.status = target
    app.board_position = board_position if board_position is not None else _next_board_position(db, app, target)
    app.status_history.append(ApplicationStatusChange(from_status=previous.value if previous else None,
                                                      to_status=target.value, actor=actor, note=note))
    audit.record(db, app.user_id, "application.status_changed",
                 f"Moved {app.job_title} at {app.company_name} from {label(previous) if previous else 'new'} "
                 f"to {label(target)}",
                 actor=actor, entity_type="application", entity_id=app.id,
                 details={"from": previous.value if previous else None, "to": target.value, "note": note})
    if target == ApplicationStatus.applied and app.applied_at is None:
        app.applied_at = utcnow()
    if target in INTERVIEW_KINDS:
        _create_interview(db, app, INTERVIEW_KINDS[target])
    if target in CLOSING_STATUSES:
        _dismiss_follow_ups(db, app)
    if actor != "user" and target not in QUIET_STATUSES:
        notifications.notify(db, app.user_id, "status_change", f"{app.company_name}: {label(target)}",
                             f"{app.job_title} moved to {label(target)}.", link=f"/applications/{app.id}")
    db.flush()
    return app
