"""Dashboard: what the agent is doing, what needs the user's attention, and the best opportunities."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session, contains_eager, joinedload, selectinload

from app.models import (
    AgentTask,
    AgentTaskStatus,
    Application,
    ApplicationStatus,
    FollowUp,
    Interview,
    Job,
    JobMatch,
    Resume,
    User,
    utcnow,
)
from app.schemas.applications import STATUS_LABELS
from app.schemas.tracking import DashboardAction, DashboardJob, DashboardOut
from app.services.analytics import INTERVIEW_STATUSES
from app.services.profile_bundle import ProfileBundle, load_bundle

LIST_LIMIT = 5
NEW_JOB_HOURS = 72
DEFAULT_DEADLINE_WARNING_DAYS = 5
S = ApplicationStatus
PAST_SAVED = [s for s in ApplicationStatus if s not in (S.discovered, S.saved)]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _ago(when: datetime, now: datetime) -> str:
    minutes = int((now - when).total_seconds() // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{_plural(minutes, 'minute')} ago"
    if minutes < 60 * 24:
        return f"{_plural(minutes // 60, 'hour')} ago"
    return f"{_plural(minutes // (60 * 24), 'day')} ago"


# ---------------------------------------------------------------------------
# Agent + counts
# ---------------------------------------------------------------------------


def agent_status(db: Session, user: User, counts: dict[str, int], now: datetime) -> tuple[str, str]:
    task = db.scalar(select(AgentTask).where(AgentTask.user_id == user.id, AgentTask.kind == "search")
                     .order_by(AgentTask.created_at.desc(), AgentTask.id.desc()).limit(1))
    if task is None:
        return "idle", "Run your first search and the agent will find and score matching jobs for you."
    if task.status in (AgentTaskStatus.queued, AgentTaskStatus.running):
        step = next((s for s in task.steps or [] if s.get("status") == "running"), None)
        return "searching", f"{step['label']}…" if step else f"{task.title}…"
    if task.status == AgentTaskStatus.completed:
        finished = task.finished_at or task.updated_at
        return "ready", (f"Last search finished {_ago(finished, now)}: {_plural(counts['relevant'], 'relevant job')}, "
                         f"{counts['strong']} strong {'match' if counts['strong'] == 1 else 'matches'}.")
    return "idle", "The last search didn't finish. You can run it again from the Agent page."


def job_counts(db: Session, user: User, now: datetime) -> dict[str, int]:
    new_since = now - timedelta(hours=NEW_JOB_HOURS)
    row = db.execute(
        select(func.count(Job.id),
               func.sum(case((JobMatch.tier.in_(("strong", "good")), 1), else_=0)),
               func.sum(case((JobMatch.tier == "strong", 1), else_=0)),
               func.sum(case(((Job.first_seen_at >= new_since) & Job.is_seen.is_(False), 1), else_=0)))
        .outerjoin(JobMatch, JobMatch.job_id == Job.id)
        .where(Job.user_id == user.id, Job.is_hidden.is_(False))
    ).one()
    return {"found": row[0] or 0, "relevant": int(row[1] or 0), "strong": int(row[2] or 0), "new": int(row[3] or 0)}


def status_counts(db: Session, user: User) -> dict[ApplicationStatus, int]:
    rows = db.execute(select(Application.status, func.count(Application.id))
                      .where(Application.user_id == user.id).group_by(Application.status))
    return {status: count for status, count in rows}


def application_counts(db: Session, user: User, by_status: dict[ApplicationStatus, int]) -> dict[str, int]:
    applied = db.scalar(select(func.count(Application.id)).where(Application.user_id == user.id,
                                                                  Application.applied_at.is_not(None))) or 0
    return {
        "applied": applied,
        "interviews": sum(by_status.get(s, 0) for s in INTERVIEW_STATUSES),
        "awaiting_response": by_status.get(S.applied, 0) + by_status.get(S.confirmed, 0),
        "offers": by_status.get(S.offer, 0),
    }


# ---------------------------------------------------------------------------
# Job lists
# ---------------------------------------------------------------------------


def _jobs_query(user: User) -> Select:
    return (select(Job).outerjoin(JobMatch, JobMatch.job_id == Job.id)
            .options(contains_eager(Job.match), selectinload(Job.sources))
            .where(Job.user_id == user.id, Job.is_hidden.is_(False)))


def _dashboard_job(job: Job) -> DashboardJob:
    match = job.match
    return DashboardJob(
        id=job.id, title=job.title, company_name=job.company_name, location=job.location,
        match=match.overall if match else None, tier=match.tier if match else None,
        recommendation=match.recommendation if match else None,
        deadline=job.deadline.isoformat() if job.deadline else None,
        sources=list(dict.fromkeys(s.source_label for s in job.sources)), is_saved=job.is_saved,
    )


def _jobs(db: Session, stmt: Select) -> list[DashboardJob]:
    return [_dashboard_job(j) for j in db.scalars(stmt.limit(LIST_LIMIT)).unique()]


def job_lists(db: Session, user: User, now: datetime, warning_days: int) -> dict[str, list[DashboardJob]]:
    in_progress = select(Application.job_id).where(Application.user_id == user.id, Application.job_id.is_not(None),
                                                   Application.status.in_(PAST_SAVED))
    today = now.date()
    return {
        "top_opportunities": _jobs(db, _jobs_query(user).where(
            Job.is_open.is_(True), JobMatch.tier.in_(("strong", "good")), Job.id.not_in(in_progress))
            .order_by(JobMatch.overall.desc(), Job.first_seen_at.desc())),
        "new_jobs": _jobs(db, _jobs_query(user).where(
            Job.first_seen_at >= now - timedelta(hours=NEW_JOB_HOURS), Job.is_seen.is_(False))
            .order_by(Job.first_seen_at.desc())),
        "closing_soon": _jobs(db, _jobs_query(user).where(
            Job.is_open.is_(True), Job.deadline >= today, Job.deadline <= today + timedelta(days=warning_days))
            .order_by(Job.deadline.asc())),
        "saved_jobs": _jobs(db, _jobs_query(user).where(Job.is_saved.is_(True)).order_by(Job.saved_at.desc())),
    }


# ---------------------------------------------------------------------------
# Attention items
# ---------------------------------------------------------------------------


def ready_to_apply(db: Session, user: User) -> list[dict]:
    apps = db.scalars(select(Application).where(Application.user_id == user.id, Application.status == S.ready)
                      .order_by(Application.match_score.desc().nulls_last(), Application.prepared_at.desc())
                      .limit(LIST_LIMIT))
    return [{"application_id": a.id, "company": a.company_name, "title": a.job_title, "match": a.match_score}
            for a in apps]


def upcoming_interviews(db: Session, user: User, now: datetime) -> list[Interview]:
    return list(db.scalars(select(Interview).options(joinedload(Interview.application))
                           .where(Interview.user_id == user.id, Interview.scheduled_at >= now)
                           .order_by(Interview.scheduled_at).limit(LIST_LIMIT)))


def follow_ups_due(db: Session, user: User, until: datetime) -> list[dict]:
    rows = db.execute(select(FollowUp, Application)
                      .outerjoin(Application, Application.id == FollowUp.application_id)
                      .where(FollowUp.user_id == user.id, FollowUp.status == "pending", FollowUp.due_at <= until)
                      .order_by(FollowUp.due_at).limit(LIST_LIMIT)).all()
    return [{"follow_up_id": f.id, "application_id": f.application_id, "company": a.company_name if a else None,
             "title": a.job_title if a else None, "due_at": f.due_at} for f, a in rows]


def _day_word(day: date, today: date) -> str:
    return "Today" if day == today else "Tomorrow" if day == today + timedelta(days=1) else "Coming Up"


def _missing_info_count(db: Session, user: User) -> int:
    readiness = db.scalars(select(Application.readiness).where(
        Application.user_id == user.id, Application.status.in_((S.reviewing, S.ready))))
    return sum(any(item.get("state") == "missing" for item in r or []) for r in readiness)


def actions(db: Session, user: User, by_status: dict[ApplicationStatus, int], interviews: list[Interview],
            follow_ups_count: int, now: datetime) -> list[DashboardAction]:
    out: list[DashboardAction] = []
    ready = by_status.get(S.ready, 0)
    if ready:
        out.append(DashboardAction(key="ready_to_apply", label=f"{ready} Application{'' if ready == 1 else 's'} Ready",
                                   count=ready, link="/applications?status=ready", priority="high"))
    if follow_ups_count:
        out.append(DashboardAction(key="follow_ups_due", label=f"{_plural(follow_ups_count, 'Follow-up')} Due",
                                   count=follow_ups_count, link="/follow-ups"))
    soon = [i for i in interviews if i.scheduled_at and i.scheduled_at <= now + timedelta(hours=48)]
    if soon:
        when = _day_word(soon[0].scheduled_at.date(), now.date())  # type: ignore[union-attr]
        out.append(DashboardAction(key="interview_soon", label=f"{_plural(len(soon), 'Interview')} {when}",
                                   count=len(soon), link=f"/interviews/{soon[0].id}", priority="high"))
    missing = _missing_info_count(db, user)
    if missing:
        out.append(DashboardAction(key="missing_info", label="Missing application information", count=missing,
                                   link="/applications?status=reviewing", priority="high"))
    has_default = db.scalar(select(func.count(Resume.id)).where(Resume.user_id == user.id, Resume.is_default.is_(True)))
    if not has_default:
        out.append(DashboardAction(key="resume_issue", label="Resume issue", count=1, link="/resumes",
                                   priority="high"))
    return out


def profile_completeness(db: Session, bundle: ProfileBundle) -> int:
    from app.api.routers.profile import completeness

    return completeness(db, bundle).percent


def follow_ups_due_count(db: Session, user: User, until: datetime) -> int:
    return db.scalar(select(func.count(FollowUp.id)).where(
        FollowUp.user_id == user.id, FollowUp.status == "pending", FollowUp.due_at <= until)) or 0


def build_dashboard(db: Session, user: User) -> DashboardOut:
    now = utcnow()
    bundle = load_bundle(db, user)
    warning_days = int((bundle.preferences.quality_filters or {}).get("deadline_warning_days",
                                                                        DEFAULT_DEADLINE_WARNING_DAYS))
    counts = job_counts(db, user, now)
    by_status = status_counts(db, user)
    interviews = upcoming_interviews(db, user, now)
    end_of_today = datetime.combine(now.date(), time.max)
    status, message = agent_status(db, user, counts, now)
    return DashboardOut(
        greeting_name=user.full_name.split()[0] if user.full_name.strip() else "there",
        agent_status=status,
        agent_message=message,
        job_search=counts,
        applications=application_counts(db, user, by_status),
        actions=actions(db, user, by_status, interviews, follow_ups_due_count(db, user, end_of_today), now),
        **job_lists(db, user, now, warning_days),
        ready_to_apply=ready_to_apply(db, user),
        upcoming_interviews=[{"interview_id": i.id, "application_id": i.application_id,
                              "company": i.application.company_name, "title": i.application.job_title,
                              "kind": i.kind, "scheduled_at": i.scheduled_at} for i in interviews],
        follow_ups_due=follow_ups_due(db, user, end_of_today),
        pipeline=[{"status": s.value, "label": STATUS_LABELS[s.value], "count": by_status.get(s, 0)}
                  for s in ApplicationStatus],
        profile_completeness=profile_completeness(db, bundle),
        onboarding_completed=user.onboarding_completed,
    )
