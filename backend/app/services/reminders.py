"""Scheduled reminders: follow-ups due, application deadlines approaching, interviews within 24 hours.

``run_due_reminders`` is called by the scheduler on every tick and is idempotent: follow-ups are
marked with ``notified_at``; deadline and interview reminders carry a reminder-specific link, and
a reminder is only created when no notification with that link exists yet.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import Application, ApplicationStatus, FollowUp, Interview, Job, Notification, UserPreference, utcnow
from app.services.ics import KIND_LABELS
from app.services.notifications import notify

DEFAULT_DEADLINE_WARNING_DAYS = 5
MAX_DEADLINE_WARNING_DAYS = 60
PREPARING = (ApplicationStatus.saved, ApplicationStatus.reviewing, ApplicationStatus.ready)


def deadline_link(job_id: int) -> str:
    return f"/jobs/{job_id}?reminder=deadline"


def interview_link(interview_id: int) -> str:
    return f"/interviews/{interview_id}?reminder=24h"


def _existing_links(db: Session, kind: str, links: list[str]) -> set[tuple[int, str]]:
    if not links:
        return set()
    rows = db.execute(select(Notification.user_id, Notification.link)
                      .where(Notification.type == kind, Notification.link.in_(links)))
    return {(uid, link) for uid, link in rows if link}


def _follow_ups_due(db: Session, now: datetime) -> int:
    items = db.execute(
        select(FollowUp, Application).outerjoin(Application, Application.id == FollowUp.application_id)
        .where(FollowUp.status == "pending", FollowUp.due_at <= now, FollowUp.notified_at.is_(None))
    ).all()
    created = 0
    for item, app in items:
        title = f"Time to follow up with {app.company_name}" if app else "A follow-up is due"
        body = (f"You planned to follow up about the {app.job_title} role. Applier can draft the message for you to "
                "review." if app else item.note or "Open your follow-ups to review it.")
        created += notify(db, item.user_id, "follow_up", title, body, link="/follow-ups") is not None
        item.notified_at = now
    return created


def _days_phrase(days: int) -> str:
    return "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"


def _deadlines(db: Session, now: datetime) -> int:
    today = now.date()
    rows = db.execute(
        select(Job, UserPreference.quality_filters, Application.status)
        .outerjoin(UserPreference, UserPreference.user_id == Job.user_id)
        .outerjoin(Application, and_(Application.job_id == Job.id, Application.user_id == Job.user_id))
        .where(Job.deadline >= today, Job.deadline <= today + timedelta(days=MAX_DEADLINE_WARNING_DAYS),
               Job.is_hidden.is_(False), Job.is_open.is_(True),
               or_(Job.is_saved.is_(True), Application.status.in_(PREPARING)))
    ).all()
    existing = _existing_links(db, "deadline", [deadline_link(job.id) for job, _, _ in rows])
    created = 0
    for job, filters, status in rows:
        warning_days = int((filters or {}).get("deadline_warning_days", DEFAULT_DEADLINE_WARNING_DAYS))
        deadline: date = job.deadline
        days = (deadline - today).days
        link = deadline_link(job.id)
        if days > warning_days or (job.user_id, link) in existing:
            continue
        next_step = ("Your application is ready — review and approve it when you're happy with it."
                     if status == ApplicationStatus.ready else "Prepare your application soon if you'd like to apply.")
        title = f"Deadline {_days_phrase(days)}: {job.title} at {job.company_name}"
        created += notify(db, job.user_id, "deadline", title,
                          f"Applications close {deadline:%B} {deadline.day}. {next_step}", link=link,
                          priority="high" if days <= 2 else "normal") is not None
    return created


def _interviews_soon(db: Session, now: datetime) -> int:
    interviews = list(db.scalars(
        select(Interview).options(joinedload(Interview.application))
        .where(Interview.scheduled_at > now, Interview.scheduled_at <= now + timedelta(hours=24),
               or_(Interview.outcome.is_(None), Interview.outcome != "cancelled"))
    ))
    existing = _existing_links(db, "interview", [interview_link(i.id) for i in interviews])
    created = 0
    for interview in interviews:
        link = interview_link(interview.id)
        if (interview.user_id, link) in existing:
            continue
        app = interview.application
        kind = KIND_LABELS.get(interview.kind, "Interview").lower()
        created += notify(db, interview.user_id, "interview", f"Interview coming up: {app.company_name}",
                          f"Your {kind} for the {app.job_title} role is in the next 24 hours. Review your prep notes "
                          "and practice a couple of answers.", link=link, priority="high") is not None
    return created


def run_due_reminders(db: Session, now: datetime | None = None) -> int:
    """Create due reminder notifications for all users. Returns how many notifications were created."""
    now = now or utcnow()
    created = _follow_ups_due(db, now) + _deadlines(db, now) + _interviews_soon(db, now)
    db.commit()
    return created
