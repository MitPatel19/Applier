"""Application analytics.

Honesty rules: rates are computed per cohort (applications *sent* in the period), small samples
carry an explicit caution, and per-resume numbers are labelled as observed history — never as
evidence that a resume, title or source *causes* more responses.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Application, ApplicationStatus, ApplicationStatusChange, Job, Resume, User, utcnow
from app.schemas.applications import STATUS_LABELS
from app.schemas.tracking import (
    AnalyticsOut,
    BreakdownRow,
    FunnelStage,
    ResumePerformanceOut,
    ResumePerformanceRow,
    SeriesPoint,
    StatTile,
)

S = ApplicationStatus
INTERVIEW_STATUSES = frozenset({S.interview, S.technical_interview, S.final_interview})
# "Responded" = a human reacted: recruiter contact, any interview, an offer or a rejection.
STAGES: dict[str, frozenset[ApplicationStatus]] = {
    "responded": frozenset({S.recruiter_contacted, *INTERVIEW_STATUSES, S.offer, S.rejected}),
    "interview": frozenset({*INTERVIEW_STATUSES, S.offer}),
    "offer": frozenset({S.offer}),
    "rejected": frozenset({S.rejected}),
}
SMALL_SAMPLE = 20
SOURCE_LABELS = {
    "linkedin": "LinkedIn", "indeed": "Indeed", "company_site": "Company website", "greenhouse": "Company website",
    "lever": "Company website", "ashby": "Company website", "demo": "Demo source", "manual": "Added manually",
}
RESUME_NOTE = "Observed historical performance, not evidence that this resume causes more interviews."
RESUME_DISCLAIMER = (
    "Interview rates depend on many things besides the resume: the roles you chose, timing, the job market and luck. "
    "With small numbers, differences between resumes are usually noise. Use this to spot patterns worth testing, "
    "not as proof of what works."
)


@dataclass
class AppFacts:
    id: int
    status: ApplicationStatus
    source: str | None
    title: str
    resume_id: int | None
    applied_at: datetime | None
    rejection_reason: str | None
    reached: dict[str, datetime] = field(default_factory=dict)  # first time each stage was reached

    def has(self, stage: str) -> bool:
        return stage in self.reached


def _to_status(value: str | ApplicationStatus) -> ApplicationStatus | None:
    try:
        return ApplicationStatus(value)
    except ValueError:
        return None


def load_facts(db: Session, user_id: int) -> list[AppFacts]:
    """All of the user's applications with the time each funnel stage was first reached (2 queries)."""
    rows = db.execute(select(Application.id, Application.status, Application.source, Application.job_title,
                             Application.resume_id, Application.applied_at, Application.rejection_reason,
                             Application.updated_at).where(Application.user_id == user_id)).all()
    facts = {r.id: AppFacts(r.id, r.status, r.source, r.job_title, r.resume_id, r.applied_at, r.rejection_reason)
             for r in rows}
    tracked = sorted({s.value for stage in STAGES.values() for s in stage})
    history = db.execute(
        select(ApplicationStatusChange.application_id, ApplicationStatusChange.to_status,
               ApplicationStatusChange.changed_at)
        .join(Application, Application.id == ApplicationStatusChange.application_id)
        .where(Application.user_id == user_id, ApplicationStatusChange.to_status.in_(tracked))
    ).all()
    for app_id, to_status, changed_at in history:
        status = _to_status(to_status)
        for stage, statuses in STAGES.items():
            if status in statuses:
                current = facts[app_id].reached.get(stage)
                facts[app_id].reached[stage] = min(current, changed_at) if current else changed_at
    for r in rows:  # current status without recorded history still counts
        for stage, statuses in STAGES.items():
            if r.status in statuses:
                facts[r.id].reached.setdefault(stage, r.updated_at)
    return list(facts.values())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _in(value: datetime | None, start: datetime, end: datetime) -> bool:
    return value is not None and start <= value < end


def _rate(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


_LEVEL_WORDS = re.compile(r"\b(junior|jr|senior|sr|intermediate|entry[- ]level|associate|principal|staff|"
                          r"iii|ii|iv|i|level \d|l\d)\b\.?", re.IGNORECASE)


def normalize_title(title: str) -> str:
    """Group variants of the same role: drop seniority words, parentheticals and suffixes after dashes."""
    base = re.split(r"\s[-–—|/]\s|,", re.sub(r"\(.*?\)", "", title))[0]
    base = re.sub(r"\s+", " ", _LEVEL_WORDS.sub("", base)).strip(" -")
    return base or title.strip()


def breakdown(apps: Iterable[AppFacts], key: Callable[[AppFacts], str]) -> list[BreakdownRow]:
    groups: dict[str, list[AppFacts]] = defaultdict(list)
    labels: dict[str, str] = {}
    for a in apps:
        label = key(a)
        labels.setdefault(label.lower(), label)
        groups[label.lower()].append(a)
    rows = []
    for k, items in groups.items():
        n = len(items)
        responses, interviews = sum(a.has("responded") for a in items), sum(a.has("interview") for a in items)
        rows.append(BreakdownRow(label=labels[k], applications=n, responses=responses, interviews=interviews,
                                 offers=sum(a.has("offer") for a in items), response_rate=_rate(responses, n),
                                 interview_rate=_rate(interviews, n)))
    return sorted(rows, key=lambda r: (-r.applications, r.label))


@dataclass
class _Window:
    applied: list[AppFacts]
    interviews: int
    offers: int
    rejections: int
    discovered: int
    saved: int

    @property
    def response_rate(self) -> float:
        return _rate(sum(a.has("responded") for a in self.applied), len(self.applied))

    @property
    def interview_rate(self) -> float:
        return _rate(sum(a.has("interview") for a in self.applied), len(self.applied))


def _job_counts(db: Session, user_id: int, windows: list[tuple[datetime, datetime]]) -> list[tuple[int, int]]:
    """(discovered, saved) jobs per window in one aggregate query."""
    cols = []
    for start, end in windows:
        cols.append(func.coalesce(func.sum(case(((Job.first_seen_at >= start) & (Job.first_seen_at < end), 1),
                                                else_=0)), 0))
        cols.append(func.coalesce(func.sum(case(((Job.saved_at >= start) & (Job.saved_at < end), 1), else_=0)), 0))
    row = db.execute(select(*cols).where(Job.user_id == user_id)).one()
    return [(int(row[i]), int(row[i + 1])) for i in range(0, len(cols), 2)]


def _window(facts: list[AppFacts], start: datetime, end: datetime, jobs: tuple[int, int]) -> _Window:
    return _Window(
        applied=[a for a in facts if _in(a.applied_at, start, end)],
        interviews=sum(_in(a.reached.get("interview"), start, end) for a in facts),
        offers=sum(_in(a.reached.get("offer"), start, end) for a in facts),
        rejections=sum(_in(a.reached.get("rejected"), start, end) for a in facts),
        discovered=jobs[0], saved=jobs[1],
    )


def _tiles(cur: _Window, prev: _Window, range_days: int) -> list[StatTile]:
    period = f"the last {range_days} days"

    def tile(key: str, label: str, value: float, previous: float, hint: str, unit: str | None = None) -> StatTile:
        return StatTile(key=key, label=label, value=value, unit=unit, delta=round(value - previous, 1), hint=hint)

    return [
        tile("applications", "Applications", len(cur.applied), len(prev.applied), f"Applications sent in {period}."),
        tile("interviews", "Interviews", cur.interviews, prev.interviews,
             f"Applications that reached an interview stage in {period}."),
        tile("response_rate", "Response rate", cur.response_rate, prev.response_rate,
             "Share of applications sent in this period that got a human response (recruiter contact, interview, "
             "offer or rejection).", "%"),
        tile("interview_rate", "Interview rate", cur.interview_rate, prev.interview_rate,
             "Share of applications sent in this period that led to an interview.", "%"),
        tile("offers", "Offers", cur.offers, prev.offers, f"Offers received in {period}."),
        tile("jobs_discovered", "Jobs discovered", cur.discovered, prev.discovered, f"New jobs found in {period}."),
        tile("jobs_saved", "Jobs saved", cur.saved, prev.saved, f"Jobs you saved in {period}."),
        tile("rejections", "Rejections", cur.rejections, prev.rejections, f"Rejections received in {period}."),
    ]


def _bucket(d: date, weekly: bool) -> date:
    return d - timedelta(days=d.weekday()) if weekly else d


def _timeseries(db: Session, user_id: int, facts: list[AppFacts], start: datetime, end: datetime,
                range_days: int) -> list[SeriesPoint]:
    weekly = range_days > 31
    points: dict[date, SeriesPoint] = {}
    day = start.date()
    while day <= end.date():
        b = _bucket(day, weekly)
        points.setdefault(b, SeriesPoint(date=b.isoformat()))
        day += timedelta(days=1)
    discovered = db.execute(select(func.date(Job.first_seen_at), func.count(Job.id))
                            .where(Job.user_id == user_id, Job.first_seen_at >= start, Job.first_seen_at < end)
                            .group_by(func.date(Job.first_seen_at))).all()
    for day_value, count in discovered:
        b = _bucket(date.fromisoformat(str(day_value)[:10]), weekly)
        if b in points:
            points[b].discovered += count
    for a in facts:
        for when, attr in ((a.applied_at, "applied"), (a.reached.get("interview"), "interviews")):
            if _in(when, start, end):
                b = _bucket(when.date(), weekly)  # type: ignore[union-attr]
                if b in points:
                    setattr(points[b], attr, getattr(points[b], attr) + 1)
    return [points[k] for k in sorted(points)]


def _resume_names(db: Session, user_id: int) -> dict[int, str]:
    return dict(db.execute(select(Resume.id, Resume.name).where(Resume.user_id == user_id)).tuples().all())


def sample_size_note(n: int) -> str | None:
    if n >= SMALL_SAMPLE:
        return None
    noun = "application" if n == 1 else "applications"
    return f"Based on {n} {noun} — treat these as observed patterns, not proof of what works."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def summary(db: Session, user: User, range_days: int = 30) -> AnalyticsOut:
    end = utcnow()
    start = end - timedelta(days=range_days)
    prev_start = start - timedelta(days=range_days)
    facts = load_facts(db, user.id)
    job_cur, job_prev = _job_counts(db, user.id, [(start, end), (prev_start, start)])
    cur, prev = _window(facts, start, end, job_cur), _window(facts, prev_start, start, job_prev)
    cohort = cur.applied
    resume_names = _resume_names(db, user.id)
    rejected = [a for a in facts if _in(a.reached.get("rejected"), start, end)]
    statuses = Counter(a.status for a in facts)
    return AnalyticsOut(
        range_days=range_days,
        tiles=_tiles(cur, prev, range_days),
        timeseries=_timeseries(db, user.id, facts, start, end, range_days),
        funnel=[
            FunnelStage(key="discovered", label="Discovered", count=cur.discovered),
            FunnelStage(key="applied", label="Applied", count=len(cohort)),
            FunnelStage(key="responded", label="Responded", count=sum(a.has("responded") for a in cohort)),
            FunnelStage(key="interview", label="Interview", count=sum(a.has("interview") for a in cohort)),
            FunnelStage(key="offer", label="Offer", count=sum(a.has("offer") for a in cohort)),
        ],
        by_source=breakdown(cohort, lambda a: SOURCE_LABELS.get(a.source or "", a.source or "Unknown")),
        by_title=breakdown(cohort, lambda a: normalize_title(a.title)),
        by_resume=breakdown(cohort, lambda a: resume_names.get(a.resume_id or 0, "No resume recorded")),
        rejection_reasons=[{"reason": reason, "count": count} for reason, count in
                           Counter(a.rejection_reason or "No reason given" for a in rejected).most_common()],
        status_distribution=[{"status": s.value, "label": STATUS_LABELS[s.value], "count": statuses[s]}
                             for s in ApplicationStatus if statuses[s]],
        sample_size_note=sample_size_note(len(cohort)),
    )


def _confidence(n: int) -> str:
    return "low" if n < 10 else "medium" if n < 30 else "high"


def resume_performance(db: Session, user: User) -> ResumePerformanceOut:
    applied = [a for a in load_facts(db, user.id) if a.applied_at is not None]
    names = _resume_names(db, user.id)
    groups: dict[int | None, list[AppFacts]] = defaultdict(list)
    for a in applied:
        groups[a.resume_id if a.resume_id in names else None].append(a)
    rows = []
    for resume_id, items in groups.items():
        n, interviews = len(items), sum(a.has("interview") for a in items)
        rows.append(ResumePerformanceRow(
            resume_id=resume_id, resume_name=names.get(resume_id or 0, "No resume recorded"), applications=n,
            interviews=interviews, offers=sum(a.has("offer") for a in items), interview_rate=_rate(interviews, n),
            confidence=_confidence(n), note=RESUME_NOTE))  # type: ignore[arg-type]
    rows.sort(key=lambda r: (-r.applications, r.resume_name))
    return ResumePerformanceOut(rows=rows, disclaimer=RESUME_DISCLAIMER)
