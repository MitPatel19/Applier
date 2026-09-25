"""Job searches: natural-language parsing, saved (scheduled) searches and running searches."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, get_owned
from app.models import AgentTask, JobSearch, UserPreference, utcnow
from app.schemas.jobs import JobSearchIn, JobSearchOut, JobSearchUpdate, ParsedQuery, ParseQueryIn, RunSearchIn
from app.schemas.tracking import AgentTaskOut
from app.services import audit
from app.services.agent.runner import start_search_task
from app.services.query_parser import parse_query
from app.services.search_prefs import SCHEDULE_INTERVAL_HOURS

router = APIRouter(prefix="/job-searches", tags=["job-searches"])


def _next_run(search: JobSearch) -> datetime | None:
    hours = SCHEDULE_INTERVAL_HOURS.get(search.schedule)
    if not hours or not search.is_active:
        return None
    return (search.last_run_at or utcnow()) + timedelta(hours=hours)


def _task_out(task: AgentTask) -> AgentTaskOut:
    return AgentTaskOut.model_validate(task)


@router.post("/parse", response_model=ParsedQuery)
def parse(body: ParseQueryIn, db: DB, user: CurrentUser) -> ParsedQuery:
    prefs = db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    return parse_query(body.text, prefs)


@router.get("", response_model=list[JobSearchOut])
def list_searches(db: DB, user: CurrentUser) -> list[JobSearch]:
    return list(db.scalars(select(JobSearch).where(JobSearch.user_id == user.id).order_by(JobSearch.created_at.desc())))


@router.post("", response_model=JobSearchOut, status_code=201)
def create_search(body: JobSearchIn, db: DB, user: CurrentUser) -> JobSearch:
    search = JobSearch(user_id=user.id, name=body.name.strip(), query_text=body.query_text,
                       filters=body.filters.model_dump(), sources=list(body.sources), schedule=body.schedule,
                       is_active=body.is_active)
    search.next_run_at = _next_run(search)
    db.add(search)
    db.flush()
    schedule = {"manual": "", "daily": " (runs daily)", "several_daily": " (runs several times a day)"}[body.schedule]
    audit.record(db, user.id, "job_search.created", f"You saved the search \"{search.name}\"{schedule}",
                 entity_type="job_search", entity_id=search.id)
    db.commit()
    return search


@router.patch("/{search_id}", response_model=JobSearchOut)
def update_search(search_id: int, body: JobSearchUpdate, db: DB, user: CurrentUser) -> JobSearch:
    search = get_owned(db, JobSearch, search_id, user, "saved search")
    data = body.model_dump(exclude_unset=True)
    if "filters" in data and body.filters is not None:
        data["filters"] = body.filters.model_dump()
    for key, value in data.items():
        if value is not None or key == "query_text":
            setattr(search, key, value)
    if {"schedule", "is_active"} & data.keys():
        search.next_run_at = _next_run(search)
    audit.record(db, user.id, "job_search.updated", f"You updated the search \"{search.name}\"",
                 entity_type="job_search", entity_id=search.id, details={"fields": sorted(data)})
    db.commit()
    return search


@router.delete("/{search_id}", status_code=204)
def delete_search(search_id: int, db: DB, user: CurrentUser) -> Response:
    search = get_owned(db, JobSearch, search_id, user, "saved search")
    audit.record(db, user.id, "job_search.deleted", f"You deleted the search \"{search.name}\"",
                 entity_type="job_search", entity_id=search.id)
    db.delete(search)
    db.commit()
    return Response(status_code=204)


@router.post("/run", response_model=AgentTaskOut, status_code=202)
def run_search(body: RunSearchIn, db: DB, user: CurrentUser) -> AgentTaskOut:
    if body.job_search_id is not None:
        get_owned(db, JobSearch, body.job_search_id, user, "saved search")
    audit.record(db, user.id, "agent.search_requested",
                 f"You asked the agent to search: {body.query_text or 'custom filters'}", entity_type="job_search",
                 entity_id=body.job_search_id)
    task = start_search_task(db, user, body.filters, list(body.sources), trigger="user",
                             job_search_id=body.job_search_id, query_text=body.query_text)
    return _task_out(task)


@router.post("/{search_id}/run", response_model=AgentTaskOut, status_code=202)
def run_saved_search(search_id: int, db: DB, user: CurrentUser) -> AgentTaskOut:
    search = get_owned(db, JobSearch, search_id, user, "saved search")
    audit.record(db, user.id, "agent.search_requested", f"You ran the saved search \"{search.name}\"",
                 entity_type="job_search", entity_id=search.id)
    task = start_search_task(db, user, search.filters or {}, search.sources or [], trigger="user",
                             job_search_id=search.id, query_text=search.query_text)
    return _task_out(task)
