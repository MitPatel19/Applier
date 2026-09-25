"""Background scheduler: runs due saved searches and preference searches, and sends reminders.

An asyncio loop wakes every ``settings.scheduler_interval_seconds``; the blocking database work of
each tick runs in a worker thread. Each search it starts is a normal agent task (trigger
``schedule``), visible to the user with step-by-step progress. Nothing is ever submitted.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import AgentTask, JobSearch, User, UserPreference, utcnow
from app.services.agent.runner import start_preference_search, start_search_task
from app.services.search_prefs import SCHEDULE_INTERVAL_HOURS, agent_settings_for

log = logging.getLogger("applier.scheduler")

_task: asyncio.Task | None = None


def run_due_searches(db: Session) -> int:
    """Start every active scheduled saved search whose ``next_run_at`` has passed."""
    now = utcnow()
    due = db.scalars(select(JobSearch).where(
        JobSearch.is_active.is_(True), JobSearch.schedule.in_(list(SCHEDULE_INTERVAL_HOURS)),
        (JobSearch.next_run_at.is_(None)) | (JobSearch.next_run_at <= now))).all()
    started = 0
    for search in due:
        user = db.get(User, search.user_id)
        if user is None or not user.is_active:
            continue
        # Reserve the next slot first so a slow or failing run isn't restarted every tick.
        search.next_run_at = now + timedelta(hours=SCHEDULE_INTERVAL_HOURS[search.schedule])
        db.commit()
        start_search_task(db, user, search.filters or {}, search.sources or [], trigger="schedule",
                          job_search_id=search.id, query_text=search.query_text)
        started += 1
    return started


def last_preference_search_at(db: Session, user_id: int) -> datetime | None:
    return db.scalar(select(AgentTask.created_at).where(
        AgentTask.user_id == user_id, AgentTask.kind == "search", AgentTask.job_search_id.is_(None)
    ).order_by(AgentTask.created_at.desc()).limit(1))


def next_preference_search_at(db: Session, user: User, prefs: UserPreference | None, *,
                              now: datetime | None = None) -> datetime | None:
    """When the automatic preference search is next due (None when automatic search is off)."""
    settings = agent_settings_for(prefs)
    hours = SCHEDULE_INTERVAL_HOURS.get(settings.search_frequency)
    if not hours or not settings.auto_search or not user.onboarding_completed:
        return None
    last = last_preference_search_at(db, user.id)
    return (last + timedelta(hours=hours)) if last else (now or utcnow())


def run_due_preference_searches(db: Session) -> int:
    """Start the automatic preference search for onboarded users whose frequency interval has elapsed."""
    now = utcnow()
    started = 0
    rows = db.execute(select(User, UserPreference).join(UserPreference, UserPreference.user_id == User.id).where(
        User.is_active.is_(True), User.onboarding_completed.is_(True))).all()
    for user, prefs in rows:
        due_at = next_preference_search_at(db, user, prefs, now=now)
        if due_at is not None and due_at <= now:
            start_preference_search(db, user, trigger="schedule")
            started += 1
    return started


def tick() -> None:
    """One scheduler pass. Each part is isolated so one failure doesn't block the others."""
    jobs = (("saved searches", run_due_searches), ("preference searches", run_due_preference_searches))
    for name, fn in jobs:
        with SessionLocal() as db:
            try:
                count = fn(db)
                if count:
                    log.info("Scheduler started %d %s", count, name)
            except Exception:
                log.exception("Scheduler failed running %s", name)
                db.rollback()
    with SessionLocal() as db:
        try:
            from app.services.reminders import run_due_reminders

            run_due_reminders(db)
        except ImportError:
            log.debug("Reminders module not available yet")
        except Exception:
            log.exception("Scheduler failed sending reminders")
            db.rollback()


async def _loop() -> None:
    interval = max(30, get_settings().scheduler_interval_seconds)
    while True:
        try:
            await asyncio.to_thread(tick)
        except Exception:  # never let the loop die
            log.exception("Scheduler tick failed")
        await asyncio.sleep(interval)


async def start_scheduler() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop(), name="applier-scheduler")
        log.info("Scheduler started")


async def stop_scheduler() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _task
        _task = None
