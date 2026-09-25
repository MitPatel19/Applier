"""The career agent: status, task history and progress, cancellation, settings and manual runs."""

from __future__ import annotations

from dataclasses import asdict
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Body, Query
from pydantic import ValidationError
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser, get_owned
from app.core.config import get_settings
from app.core.errors import AppError
from app.models import AgentTask, AgentTaskStatus, JobSearch, utcnow
from app.schemas.profile import AgentSettings
from app.schemas.tracking import AgentRunIn, AgentStatusOut, AgentTaskOut
from app.services import audit, llm
from app.services.agent.runner import STALE_TASK_MINUTES, start_analyze_task, start_preference_search
from app.services.agent.scheduler import next_preference_search_at
from app.services.profile_bundle import ensure_profile_rows
from app.services.search_prefs import agent_settings_for
from app.services.sources.registry import SOURCE_KEYS, source_statuses

router = APIRouter(prefix="/agent", tags=["agent"])

_ACTIVE = [AgentTaskStatus.queued, AgentTaskStatus.running]


def _out(task: AgentTask | None) -> AgentTaskOut | None:
    return AgentTaskOut.model_validate(task) if task is not None else None


@router.get("/status", response_model=AgentStatusOut)
def status(db: DB, user: CurrentUser) -> AgentStatusOut:
    _, prefs = ensure_profile_rows(db, user)
    settings = agent_settings_for(prefs)
    # Tasks left "running" by a server restart long ago aren't reported as running.
    running = db.scalar(select(AgentTask).where(
        AgentTask.user_id == user.id, AgentTask.status.in_(_ACTIVE),
        AgentTask.created_at >= utcnow() - timedelta(minutes=STALE_TASK_MINUTES),
    ).order_by(AgentTask.id.desc()).limit(1))
    last = db.scalar(select(AgentTask).where(AgentTask.user_id == user.id, AgentTask.status.not_in(_ACTIVE))
                     .order_by(AgentTask.id.desc()).limit(1))
    saved_next = db.scalar(select(func.min(JobSearch.next_run_at)).where(
        JobSearch.user_id == user.id, JobSearch.is_active.is_(True), JobSearch.schedule != "manual"))
    candidates = [t for t in (saved_next, next_preference_search_at(db, user, prefs)) if t is not None]
    db.commit()  # persist profile/preference rows created on first access
    return AgentStatusOut(
        running=_out(running),
        last=_out(last),
        next_scheduled_run=min(candidates) if candidates else None,
        search_frequency=settings.search_frequency,
        ai_writing_available=llm.available(),
        demo_mode=get_settings().demo_mode,
        sources=[asdict(s) for s in source_statuses(db, user)],
    )


@router.get("/tasks", response_model=list[AgentTaskOut])
def list_tasks(db: DB, user: CurrentUser, limit: int = Query(default=20, ge=1, le=100)) -> list[AgentTask]:
    return list(db.scalars(select(AgentTask).where(AgentTask.user_id == user.id)
                           .order_by(AgentTask.id.desc()).limit(limit)))


@router.get("/tasks/{task_id}", response_model=AgentTaskOut)
def get_task(task_id: int, db: DB, user: CurrentUser) -> AgentTask:
    return get_owned(db, AgentTask, task_id, user, "agent task")


@router.post("/tasks/{task_id}/cancel", response_model=AgentTaskOut)
def cancel_task(task_id: int, db: DB, user: CurrentUser) -> AgentTask:
    task = get_owned(db, AgentTask, task_id, user, "agent task")
    if task.status in _ACTIVE:
        task.status = AgentTaskStatus.cancelled
        task.finished_at = utcnow()
        task.steps = [{**s, "status": "skipped", "detail": "Cancelled"} if s.get("status") in ("pending", "running")
                      else s for s in task.steps]
        audit.record(db, user.id, "agent.task_cancelled", f"You cancelled the agent task: {task.title}",
                     entity_type="agent_task", entity_id=task.id)
        db.commit()
    return task


@router.get("/settings", response_model=AgentSettings)
def get_agent_settings(db: DB, user: CurrentUser) -> AgentSettings:
    _, prefs = ensure_profile_rows(db, user)
    db.commit()
    return agent_settings_for(prefs)


@router.patch("/settings", response_model=AgentSettings)
def update_agent_settings(db: DB, user: CurrentUser, body: dict[str, Any] = Body(...)) -> AgentSettings:
    _, prefs = ensure_profile_rows(db, user)
    current = agent_settings_for(prefs).model_dump()
    changes = {k: v for k, v in body.items() if k != "auto_submit"}  # submission always needs your approval
    errors = [{"field": k, "message": "Unknown setting"} for k in sorted(set(changes) - set(current))]
    if isinstance(changes.get("sources"), list):
        errors += [{"field": "sources", "message": f"Unknown job source: {s}"} for s in changes["sources"]
                   if s not in SOURCE_KEYS]
    if errors:
        raise AppError("Some agent settings need attention before we can save them.", code="validation_error",
                       status_code=422, details=errors)
    try:
        updated = AgentSettings(**{**current, **changes})
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in err["loc"]), "message": err["msg"]} for err in exc.errors()]
        raise AppError("Some agent settings need attention before we can save them.", code="validation_error",
                       status_code=422, details=details) from exc
    prefs.agent_settings = updated.model_dump()
    changed = sorted(k for k in changes if current.get(k) != getattr(updated, k))
    if changed:
        audit.record(db, user.id, "agent.settings_updated", f"You updated agent settings: {', '.join(changed)}",
                     entity_type="user_preference", entity_id=prefs.id,
                     details={k: getattr(updated, k) for k in changed})
    db.commit()
    return updated


@router.post("/run", response_model=AgentTaskOut, status_code=202)
def run_agent(body: AgentRunIn, db: DB, user: CurrentUser) -> AgentTaskOut:
    audit.record(db, user.id, "agent.run_requested",
                 "You asked the agent to search for jobs matching your preferences" if body.kind == "search"
                 else "You asked the agent to re-analyze your jobs", entity_type="agent_task")
    db.commit()
    task = start_preference_search(db, user) if body.kind == "search" else start_analyze_task(db, user)
    out = _out(task)
    assert out is not None
    return out
