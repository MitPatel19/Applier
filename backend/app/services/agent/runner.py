"""The career agent's search run: search sources → remove duplicates → analyze → score → recommend.

A run is an ``AgentTask`` whose ``steps`` are updated and committed as the agent works, so the UI
can show progress in plain language ("Searching LinkedIn — 42 jobs found"). Runs execute in a
background daemon thread with their own database session (synchronously under
``APPLIER_ENVIRONMENT=test``). A failing source never stops the run; cancellation is honoured
between steps. The agent only discovers and prepares — it never applies to anything.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import AgentTask, AgentTaskStatus, Job, JobSearch, User, utcnow
from app.schemas.jobs import SearchFilters
from app.services import audit, notifications
from app.services.jobs_ingest import IngestResult, analyze_jobs, load_jobs, merge_postings, score_jobs
from app.services.profile_bundle import load_bundle
from app.services.search_prefs import SCHEDULE_INTERVAL_HOURS, agent_settings_for, preference_filters
from app.services.sources.base import RawPosting, SourceError
from app.services.sources.filtering import is_relevant
from app.services.sources.registry import SOURCE_KEYS, SOURCE_LABELS, resolve

log = logging.getLogger("applier.agent")

SEARCH_STEPS: list[tuple[str, str]] = [
    ("search_linkedin", "Searching LinkedIn"),
    ("search_indeed", "Searching Indeed"),
    ("search_company_sites", "Searching employer websites"),
    ("dedupe", "Removing duplicates"),
    ("analyze", "Analyzing relevance"),
    ("score", "Scoring matches"),
    ("recommend", "Preparing recommendations"),
]
ANALYZE_STEPS: list[tuple[str, str]] = [
    ("analyze", "Re-checking your jobs against your filters"),
    ("score", "Re-scoring matches"),
    ("recommend", "Preparing recommendations"),
]
SOURCE_STEP = {"linkedin": "search_linkedin", "indeed": "search_indeed", "company_sites": "search_company_sites"}
DEMO_MIN_STEP_SECONDS = 0.6
STALE_TASK_MINUTES = 15
SOURCE_FAILED = "We couldn't retrieve jobs from this source right now. You can retry or continue with the other " \
                "job sources."


class TaskCancelled(Exception):
    pass


def _is_test() -> bool:
    return get_settings().environment == "test"


def _plural(n: int, word: str, plural: str | None = None) -> str:
    return f"{n} {word if n == 1 else (plural or word + 's')}"


# ---------------------------------------------------------------------------
# Task bookkeeping
# ---------------------------------------------------------------------------


class StepTracker:
    """Updates one task's steps and commits after every change so polling clients see progress."""

    def __init__(self, db: Session, task: AgentTask) -> None:
        self.db, self.task = db, task
        self.min_seconds = DEMO_MIN_STEP_SECONDS if get_settings().demo_mode and not _is_test() else 0.0
        self._started: dict[str, float] = {}

    def _update(self, key: str, **fields: Any) -> None:
        steps = [dict(s) for s in self.task.steps]
        for step in steps:
            if step["key"] == key:
                step.update(fields)
        self.task.steps = steps
        self.db.commit()

    def check_cancelled(self) -> None:
        self.db.refresh(self.task, attribute_names=["status"])
        if self.task.status == AgentTaskStatus.cancelled:
            raise TaskCancelled

    def start(self, key: str) -> None:
        self.check_cancelled()
        self._started[key] = time.monotonic()
        self._update(key, status="running", started_at=utcnow().isoformat())

    def finish(self, key: str, status: str, detail: str | None = None, count: int | None = None) -> None:
        elapsed = time.monotonic() - self._started.get(key, time.monotonic())
        if elapsed < self.min_seconds:  # let people watch the agent work in demo mode
            time.sleep(self.min_seconds - elapsed)
        self._update(key, status=status, detail=detail, count=count, finished_at=utcnow().isoformat())

    def skip(self, key: str, reason: str) -> None:
        self._update(key, status="skipped", detail=reason, finished_at=utcnow().isoformat())

    def skip_remaining(self, reason: str) -> None:
        steps = [dict(s) for s in self.task.steps]
        for step in steps:
            if step["status"] in ("pending", "running"):
                step.update(status="skipped", detail=reason, finished_at=utcnow().isoformat())
        self.task.steps = steps


def _new_task(db: Session, user: User, kind: str, title: str, steps: list[tuple[str, str]], params: dict[str, Any],
              trigger: str, job_search_id: int | None = None) -> AgentTask:
    task = AgentTask(user_id=user.id, kind=kind, title=title[:300], status=AgentTaskStatus.queued, trigger=trigger,
                     job_search_id=job_search_id, params=params, result={},
                     steps=[{"key": k, "label": label, "status": "pending", "detail": None, "count": None,
                             "started_at": None, "finished_at": None} for k, label in steps])
    db.add(task)
    db.commit()
    return task


def active_task(db: Session, user_id: int, kind: str = "search") -> AgentTask | None:
    """A queued/running task of ``kind`` started recently (older ones are considered abandoned)."""
    cutoff = utcnow() - timedelta(minutes=STALE_TASK_MINUTES)
    return db.scalar(select(AgentTask).where(
        AgentTask.user_id == user_id, AgentTask.kind == kind, AgentTask.created_at >= cutoff,
        AgentTask.status.in_([AgentTaskStatus.queued, AgentTaskStatus.running])).order_by(AgentTask.id.desc()))


def _launch(db: Session, task: AgentTask, worker: Callable[[int], None]) -> AgentTask:
    if _is_test():
        worker(task.id)
        db.expire(task)
        db.refresh(task)
    else:
        threading.Thread(target=worker, args=(task.id,), name=f"agent-task-{task.id}", daemon=True).start()
    return task


def _describe(filters: SearchFilters, query_text: str | None) -> str:
    if query_text:
        return f"Job search: {query_text}"
    what = ", ".join(filters.roles[:2]) or ", ".join(filters.keywords[:3]) or "jobs"
    where = ", ".join(filters.locations[:2] + [f"remote {r}" for r in filters.remote_regions[:1]])
    return f"Searching for {what}{f' in {where}' if where else ''}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def start_search_task(db: Session, user: User, filters: SearchFilters | dict[str, Any], sources: list[str], *,
                      trigger: str = "user", job_search_id: int | None = None, query_text: str | None = None,
                      origin: str = "search") -> AgentTask:
    """Create a search task and run it in the background. Returns the (queued) task.

    If a search is already running for this user, that task is returned instead of starting another.
    """
    if running := active_task(db, user.id):
        return running
    filters = filters if isinstance(filters, SearchFilters) else SearchFilters(**filters)
    sources = [s for s in dict.fromkeys(sources) if s in SOURCE_KEYS] or list(SOURCE_KEYS)
    task = _new_task(db, user, "search", _describe(filters, query_text), SEARCH_STEPS,
                     {"filters": filters.model_dump(), "sources": sources, "query_text": query_text, "origin": origin},
                     trigger, job_search_id)
    return _launch(db, task, run_search_task)


def start_preference_search(db: Session, user: User, trigger: str = "user") -> AgentTask:
    """Search using the user's saved job preferences and agent source settings."""
    bundle = load_bundle(db, user)
    settings = agent_settings_for(bundle.preferences)
    return start_search_task(db, user, preference_filters(bundle), settings.sources, trigger=trigger,
                             origin="preferences")


def start_analyze_task(db: Session, user: User, trigger: str = "user") -> AgentTask:
    """Re-apply filters and re-score every saved job (after profile or preference changes)."""
    if running := active_task(db, user.id, "analyze"):
        return running
    task = _new_task(db, user, "analyze", "Re-analyzing your jobs", ANALYZE_STEPS, {}, trigger)
    return _launch(db, task, run_analyze_task)


# ---------------------------------------------------------------------------
# Workers
# ---------------------------------------------------------------------------


def _search_sources(tracker: StepTracker, db: Session, user: User, filters: SearchFilters,
                    sources: list[str]) -> tuple[list[RawPosting], list[str], int]:
    postings: list[RawPosting] = []
    failed: list[str] = []
    attempted = 0
    for key in SOURCE_KEYS:
        step = SOURCE_STEP[key]
        if key not in sources:
            tracker.skip(step, "Not selected for this search")
            continue
        attempted += 1
        tracker.start(step)
        resolved = resolve(db, user, key)
        try:
            found = resolved.adapter.search(db, user, filters)
        except SourceError as exc:
            failed.append(SOURCE_LABELS[key])
            tracker.finish(step, "failed", exc.message)
            continue
        except Exception:
            log.exception("Source %s failed for user %s", key, user.id)
            failed.append(SOURCE_LABELS[key])
            tracker.finish(step, "failed", SOURCE_FAILED)
            continue
        postings.extend(found)
        suffix = " (sample data)" if resolved.status.status == "demo" else ""
        tracker.finish(step, "done", f"{_plural(len(found), 'job')} found{suffix}", len(found))
    return postings, failed, attempted


def _tier_counts(jobs: list[Job]) -> dict[str, int]:
    counts = {"strong": 0, "good": 0, "possible": 0, "weak": 0}
    for job in jobs:
        if job.match is not None and not job.is_hidden:
            counts[job.match.tier] = counts.get(job.match.tier, 0) + 1
    return counts


def _notify(db: Session, user: User, jobs: list[Job], new_ids: set[int], threshold: int, enabled: bool) -> None:
    if not enabled:
        return
    for job in jobs:
        if job.id in new_ids and not job.is_hidden and job.match and job.match.overall >= threshold:
            notifications.notify(db, user.id, "excellent_match", f"Excellent match: {job.title} at {job.company_name}",
                                 f"{job.match.overall}% match. {job.match.recommendation}", link=f"/jobs/{job.id}",
                                 priority="high")


def _update_saved_search(db: Session, task: AgentTask, unique: int) -> None:
    if not task.job_search_id:
        return
    search = db.get(JobSearch, task.job_search_id)
    if search is None:
        return
    now = utcnow()
    search.last_run_at = now
    search.last_result_count = unique
    hours = SCHEDULE_INTERVAL_HOURS.get(search.schedule)
    search.next_run_at = now + timedelta(hours=hours) if hours and search.is_active else None


def _execute_search(db: Session, task: AgentTask, user: User, tracker: StepTracker) -> dict[str, Any]:
    params = task.params or {}
    filters = SearchFilters(**(params.get("filters") or {}))
    sources = params.get("sources") or list(SOURCE_KEYS)
    bundle = load_bundle(db, user)
    settings = agent_settings_for(bundle.preferences)

    postings, failed, attempted = _search_sources(tracker, db, user, filters, sources)
    if attempted and len(failed) == attempted:
        raise SourceError("We couldn't retrieve jobs from any source right now. Please try again in a few minutes.")

    tracker.start("dedupe")
    result: IngestResult
    result, changed = merge_postings(db, user, postings, dedupe=settings.auto_dedupe)
    duplicates = result.found - result.unique
    detail = (f"{_plural(result.unique, 'unique job')} ({_plural(duplicates, 'duplicate')} merged)"
              if postings else "No jobs to process")
    if settings.auto_dedupe:
        tracker.finish("dedupe", "done", detail, result.unique)
    else:
        db.commit()
        tracker.skip("dedupe", "Automatic duplicate removal is off in agent settings — only identical postings "
                               "were combined")

    jobs = load_jobs(db, user, result.job_ids)
    if settings.auto_analyze:
        tracker.start("analyze")
        analyze_jobs(jobs, bundle, only_ids=set(result.new_job_ids) | changed)
        hidden = sum(1 for j in jobs if j.is_hidden)
        relevant = sum(1 for j in jobs if not j.is_hidden and is_relevant(j.title, j.description, filters))
        tracker.finish("analyze", "done", f"{relevant} relevant" + (f", {hidden} hidden by your filters" if hidden
                                                                   else ""), relevant)
    else:
        analyze_jobs(jobs, bundle, extract=False)
        hidden = sum(1 for j in jobs if j.is_hidden)
        relevant = sum(1 for j in jobs if not j.is_hidden)
        db.commit()
        tracker.skip("analyze", "Automatic analysis is off in agent settings")

    if settings.auto_score:
        tracker.start("score")
        score_jobs(db, jobs, bundle)
        tracker.finish("score", "done", f"{_plural(len(jobs), 'job')} scored", len(jobs))
    else:
        db.commit()
        tracker.skip("score", "Automatic scoring is off in agent settings")

    tracker.start("recommend")
    counts = _tier_counts(jobs)
    ranked = sorted((j for j in jobs if j.match and not j.is_hidden), key=lambda j: j.match.overall, reverse=True)
    new_ids = set(result.new_job_ids)
    _notify(db, user, jobs, new_ids, settings.strong_match_threshold, settings.notify_on_strong_match)
    detail = f"{_plural(counts['strong'], 'strong match', 'strong matches')} ready for review" if settings.auto_score \
        else "Scoring is off — review jobs in your list"
    tracker.finish("recommend", "done", detail, counts["strong"])

    summary = {
        "found": result.found, "unique": result.unique, "duplicates": duplicates, "new": result.new,
        "relevant": relevant, "strong": counts["strong"], "good": counts["good"], "possible": counts["possible"],
        "hidden": hidden, "top_job_ids": [j.id for j in ranked[:10]], "failed_sources": failed,
    }
    notifications.notify(
        db, user.id, "agent", "Job search finished",
        f"Found {_plural(result.unique, 'job')} ({result.new} new). {counts['strong']} strong and {counts['good']} "
        f"good matches are ready for your review." + (f" Couldn't reach: {', '.join(failed)}." if failed else ""),
        link="/jobs?view=recommended")
    audit.record(db, user.id, "agent.search_completed",
                 f"Agent searched {_plural(len(sources), 'source')}: {result.found} postings found, "
                 f"{result.unique} unique ({result.new} new), {counts['strong']} strong matches",
                 actor="agent", entity_type="agent_task", entity_id=task.id, details=summary)
    _update_saved_search(db, task, result.unique)
    return summary


def _run(task_id: int, body: Callable[[Session, AgentTask, User, StepTracker], dict[str, Any]]) -> None:
    with SessionLocal() as db:
        task = db.get(AgentTask, task_id)
        if task is None or task.status != AgentTaskStatus.queued:
            return
        user = db.get(User, task.user_id)
        if user is None:
            return
        tracker = StepTracker(db, task)
        task.status, task.started_at = AgentTaskStatus.running, utcnow()
        db.commit()
        try:
            task.result = body(db, task, user, tracker)
            task.status = AgentTaskStatus.completed
        except TaskCancelled:
            tracker.skip_remaining("Cancelled")
            audit.record(db, user.id, "agent.task_cancelled", f"Agent task cancelled: {task.title}", actor="agent",
                         entity_type="agent_task", entity_id=task.id)
        except SourceError as exc:
            db.rollback()
            task.status, task.error = AgentTaskStatus.failed, exc.message
            tracker.skip_remaining("Stopped because no job source could be reached")
        except Exception:
            log.exception("Agent task %s failed", task_id)
            db.rollback()
            task.status = AgentTaskStatus.failed
            task.error = "Something went wrong while the agent was working. Your data is safe — please try again."
            tracker.skip_remaining("Stopped because of an unexpected error")
        task.finished_at = utcnow()
        db.commit()


def run_search_task(task_id: int) -> None:
    _run(task_id, _execute_search)


def _execute_analyze(db: Session, task: AgentTask, user: User, tracker: StepTracker) -> dict[str, Any]:
    bundle = load_bundle(db, user)
    job_ids = list(db.scalars(select(Job.id).where(Job.user_id == user.id).order_by(Job.id)))
    jobs = load_jobs(db, user, job_ids)
    tracker.start("analyze")
    analyze_jobs(jobs, bundle, only_ids=set())  # extracts only jobs never analyzed; re-applies filters to all
    hidden = sum(1 for j in jobs if j.is_hidden)
    tracker.finish("analyze", "done", f"{_plural(len(jobs), 'job')} checked, {hidden} hidden by your filters",
                   len(jobs))
    tracker.start("score")
    score_jobs(db, jobs, bundle)
    tracker.finish("score", "done", f"{_plural(len(jobs), 'job')} re-scored", len(jobs))
    tracker.start("recommend")
    counts = _tier_counts(jobs)
    tracker.finish("recommend", "done", f"{_plural(counts['strong'], 'strong match', 'strong matches')} ready for "
                                        "review", counts["strong"])
    audit.record(db, user.id, "agent.jobs_rescored", f"Agent re-analyzed and re-scored {_plural(len(jobs), 'job')}",
                 actor="agent", entity_type="agent_task", entity_id=task.id)
    return {"updated": len(jobs), "strong": counts["strong"], "good": counts["good"], "possible": counts["possible"],
            "hidden": hidden}


def run_analyze_task(task_id: int) -> None:
    _run(task_id, _execute_analyze)
