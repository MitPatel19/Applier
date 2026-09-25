"""Demo data: a realistic sample job search for the signed-in user (demo mode only).

Everything is fictional except the user's own name and email. Rows are flagged ``is_demo``
where the model supports it; rows without the flag (notifications, audit entries, emails, the
sample profile) are recorded in a manifest on the demo agent task so they can be removed
precisely. Seeding is idempotent: previous demo data is cleared first.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    AgentTask,
    AgentTaskStatus,
    Application,
    ApplicationStatus,
    ApplicationStatusChange,
    AuditLog,
    Company,
    Education,
    EmailMessage,
    Experience,
    FollowUp,
    Interview,
    Job,
    Notification,
    Project,
    Recruiter,
    Resume,
    Skill,
    User,
    utcnow,
)
from app.schemas.jobs import SearchFilters
from app.services import audit, taxonomy
from app.services.interview_prep import generate_prep
from app.services.notifications import notify
from app.services.profile_bundle import ensure_profile_rows, load_bundle

log = logging.getLogger("applier.demo")
S = ApplicationStatus

# ---------------------------------------------------------------------------
# Sample profile (fictional employers, institution and projects)
# ---------------------------------------------------------------------------

PROFILE_FIELDS: dict[str, Any] = {
    "phone": "(807) 555-0142",
    "city": "Thunder Bay",
    "province": "ON",
    "country": "Canada",
    "headline": "Junior Software Developer · Python, Django REST, PostgreSQL",
    "summary": (
        "Junior software developer in Thunder Bay with a year of professional Python and Django REST Framework work, "
        "plus an IT support co-op. I like building reliable APIs, tidy databases and tools that save people time, "
        "and I'm comfortable on both the development and the support side."
    ),
    "desired_positions": ["Junior Software Developer", "Full Stack Developer", "Backend Developer", "Python Developer",
                          "IT Support Technician"],
    "desired_salary": 62000,
    "salary_period": "yearly",
    "currency": "CAD",
    "work_authorization": "Authorized to work in Canada (Canadian citizen)",
    "authorized_countries": ["Canada"],
    "requires_sponsorship": False,
    "availability": "Available with two weeks' notice",
    "preferred_arrangements": ["onsite", "hybrid", "remote"],
}

EXPERIENCES: list[dict[str, Any]] = [
    {
        "company": "Northshore Digital Co-op", "position": "Junior Software Developer", "location": "Thunder Bay, ON",
        "start_date": date(2025, 5, 5), "end_date": None,
        "responsibilities": [
            "Build and maintain REST APIs with Django REST Framework for a scheduling platform used by 40+ local "
            "businesses",
            "Write PostgreSQL queries and migrations, and review pull requests from two co-op students",
            "Containerize services with Docker and keep the GitHub Actions CI pipeline green",
        ],
        "achievements": [
            "Added indexes and rewrote the slowest reporting query, cutting its runtime from 4.2s to 600ms",
            "Raised API test coverage from 48% to 81% with pytest, reducing production API errors by 35%",
        ],
        "technologies": ["Python", "Django REST Framework", "PostgreSQL", "Docker", "Git", "pytest",
                         "GitHub Actions", "React"],
        "metrics": ["Report query 4.2s → 600ms", "Test coverage 48% → 81%", "35% fewer production API errors"],
    },
    {
        "company": "Superior Shores Health Network", "position": "IT Support Technician (Co-op)",
        "location": "Thunder Bay, ON", "start_date": date(2024, 1, 8), "end_date": date(2024, 8, 30),
        "responsibilities": [
            "Resolved 25–30 help-desk tickets a week across Windows 11, Microsoft 365, printers and VPN access",
            "Managed user accounts, groups and password resets in Active Directory for 300+ staff",
            "Documented 20+ troubleshooting guides in the team's Confluence knowledge base",
        ],
        "achievements": [
            "Wrote a PowerShell script that automated new-hire laptop setup, saving about 45 minutes per device",
        ],
        "technologies": ["Windows", "Microsoft 365", "Active Directory", "PowerShell", "Help Desk", "Troubleshooting",
                         "TCP/IP", "Confluence"],
        "metrics": ["25–30 tickets resolved per week", "45 minutes saved per laptop setup"],
    },
    {
        "company": "Sleeping Giant Analytics", "position": "Software Development Intern", "location": "Remote (Canada)",
        "start_date": date(2023, 5, 1), "end_date": date(2023, 8, 25),
        "responsibilities": [
            "Built an internal dashboard in React and Flask for monitoring nightly data pipeline jobs",
            "Wrote Python ETL scripts with Pandas that processed about 2 million rows each night",
        ],
        "achievements": [
            "Containerized the dashboard with Docker so the team could run it on the shared staging server",
        ],
        "technologies": ["Python", "Flask", "React", "JavaScript", "Pandas", "Docker", "SQL"],
        "metrics": ["~2 million rows processed nightly"],
    },
]

EDUCATION: dict[str, Any] = {
    "institution": "Kakabeka Institute of Technology", "degree": "Advanced Diploma",
    "program": "Computer Programming and Analysis", "start_date": date(2021, 9, 7), "end_date": date(2024, 4, 26),
    "gpa": "3.7/4.0", "location": "Thunder Bay, ON",
    "coursework": ["Data Structures and Algorithms", "Database Design", "Web Development", "Networking Fundamentals",
                   "Software Testing"],
}

SKILLS: list[tuple[str, str, float]] = [
    ("Python", "advanced", 3), ("JavaScript", "intermediate", 2), ("TypeScript", "beginner", 1),
    ("SQL", "advanced", 3), ("HTML", "intermediate", 3), ("CSS", "intermediate", 3), ("Bash", "intermediate", 2),
    ("PowerShell", "intermediate", 1), ("Django", "advanced", 2), ("Django REST Framework", "advanced", 1.5),
    ("Flask", "intermediate", 1), ("FastAPI", "intermediate", 1), ("React", "intermediate", 2),
    ("PostgreSQL", "advanced", 2), ("MySQL", "intermediate", 1), ("SQLite", "intermediate", 2),
    ("Docker", "intermediate", 1.5), ("Git", "advanced", 3), ("GitHub Actions", "intermediate", 1),
    ("Linux", "intermediate", 2), ("pytest", "intermediate", 1.5), ("REST APIs", "advanced", 2),
    ("Active Directory", "intermediate", 1), ("Microsoft 365", "intermediate", 1), ("Troubleshooting", "advanced", 2),
    ("Communication", "advanced", 3), ("Teamwork", "advanced", 3),
]

PROJECTS: list[dict[str, Any]] = [
    {
        "name": "ShiftSwap", "description": "A web app that lets part-time staff post and trade shifts, with manager "
                                            "approval and email notifications",
        "technologies": ["Django REST Framework", "React", "PostgreSQL", "Docker"],
        "responsibilities": ["Designed the data model and REST API for shifts, trades and approvals",
                             "Built the React front end with role-based views for staff and managers",
                             "Wrote pytest tests for the approval rules and ran them in GitHub Actions"],
        "results": ["Piloted by 60 students during a campus job fair; managers approved 90+ trades in two weeks"],
        "github_url": "https://example.com/github/shiftswap",
    },
    {
        "name": "HelpDesk Lite", "description": "A lightweight ticket-triage tool for small IT teams",
        "technologies": ["FastAPI", "Python", "SQLite", "pytest"],
        "responsibilities": ["Built a FastAPI service that tags tickets by keywords and routes them to queues",
                             "Added an SLA timer and a daily summary email"],
        "results": ["Cut average triage time in a mock support exercise from 6 minutes to under 2"],
        "github_url": "https://example.com/github/helpdesk-lite",
    },
    {
        "name": "TrailCondition Map", "description": "A community map of trail conditions around Thunder Bay",
        "technologies": ["React", "JavaScript", "Flask", "PostgreSQL"],
        "responsibilities": ["Built the map UI in React with user-submitted condition reports",
                             "Wrote a Flask API with PostgreSQL storage and simple moderation"],
        "results": [],
        "github_url": "https://example.com/github/trailcondition-map",
    },
]

PREFERENCES: dict[str, Any] = {
    "target_locations": ["Thunder Bay, ON", "Remote (Canada)"],
    "job_types": ["full_time", "contract"],
    "work_arrangements": ["onsite", "hybrid", "remote"],
    "experience_levels": ["entry", "junior"],
    "target_roles": ["Junior Software Developer", "Full Stack Developer", "Backend Developer", "Python Developer",
                     "IT Support"],
    "salary_min": 55000,
    "salary_period": "yearly",
    "currency": "CAD",
    "technologies": ["Python", "Django", "PostgreSQL", "React", "Docker"],
}

RESUMES: list[tuple[str, str, bool]] = [
    ("Software Developer Resume", "Junior Software Developer", True),
    ("Full Stack Resume", "Full Stack Developer", False),
    ("IT Support Resume", "IT Support Technician", False),
]

SEARCH_STEPS: list[tuple[str, str, str, int | None]] = [
    ("search_linkedin", "Searching LinkedIn", "42 jobs found", 42),
    ("search_indeed", "Searching Indeed", "37 jobs found", 37),
    ("search_company_sites", "Searching employer career sites", "61 jobs found", 61),
    ("dedupe", "Removing duplicates", "82 unique jobs", 82),
    ("analyze", "Analyzing job descriptions", "31 relevant jobs", 31),
    ("score", "Scoring matches", "31 jobs scored against your profile", 31),
    ("recommend", "Preparing recommendations", "8 ready to review", 8),
]


@dataclass(frozen=True)
class PlannedApp:
    status: ApplicationStatus
    applied_days_ago: int | None  # None = not applied yet
    rejection_reason: str | None = None
    via_interview: bool = False  # rejected after an interview


APPLICATION_PLAN: list[PlannedApp] = [
    PlannedApp(S.ready, None), PlannedApp(S.ready, None), PlannedApp(S.ready, None),
    PlannedApp(S.offer, 45), PlannedApp(S.technical_interview, 30), PlannedApp(S.interview, 18),
    PlannedApp(S.recruiter_contacted, 25), PlannedApp(S.confirmed, 12), PlannedApp(S.confirmed, 16),
    PlannedApp(S.applied, 3), PlannedApp(S.applied, 9), PlannedApp(S.reviewing, None),
    PlannedApp(S.rejected, 35, "The team chose a candidate with more years of experience", via_interview=True),
    PlannedApp(S.rejected, 52, "Position filled internally"),
]
RESERVED_TOP_JOBS = 2  # keep the best matches free as "top opportunities"

# Days after applying at which each later status was reached.
_AFTER_APPLIED = {S.confirmed: 0.1, S.recruiter_contacted: 5, S.interview: 8, S.technical_interview: 15,
                  S.final_interview: 22, S.offer: 30, S.rejected: 12}
_ACTORS = {S.saved: "user", S.reviewing: "agent", S.ready: "agent", S.applied: "user", S.confirmed: "email"}


# ---------------------------------------------------------------------------
# Clearing
# ---------------------------------------------------------------------------


def _demo_tasks(db: Session, user: User) -> list[AgentTask]:
    tasks = db.scalars(select(AgentTask).where(AgentTask.user_id == user.id, AgentTask.kind == "search"))
    return [t for t in tasks if (t.params or {}).get("demo")]


def _clear_profile(db: Session, user: User) -> None:
    for model in (Education, Experience, Skill, Project):
        db.execute(delete(model).where(model.user_id == user.id))
    profile, _ = ensure_profile_rows(db, user)
    for field, value in PROFILE_FIELDS.items():
        setattr(profile, field, [] if isinstance(value, list) else None)
    profile.salary_period, profile.currency = "yearly", "CAD"


def clear_demo(db: Session, user: User) -> int:
    """Remove all demo rows for ``user`` (caller commits). Returns the number of demo applications removed."""
    for task in _demo_tasks(db, user):
        manifest = task.params or {}
        for model, key in ((Notification, "notification_ids"), (AuditLog, "audit_log_ids"),
                           (EmailMessage, "email_message_ids")):
            ids = manifest.get(key) or []
            if ids:
                db.execute(delete(model).where(model.user_id == user.id, model.id.in_(ids)))
        if manifest.get("profile_seeded"):
            _clear_profile(db, user)
        db.delete(task)
    removed = db.execute(delete(Application).where(Application.user_id == user.id, Application.is_demo.is_(True)))
    for model in (Job, Company, Resume, Recruiter):
        db.execute(delete(model).where(model.user_id == user.id, model.is_demo.is_(True)))
    db.flush()
    db.expire_all()
    return removed.rowcount or 0  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Seeding helpers
# ---------------------------------------------------------------------------


def _profile_is_empty(db: Session, user: User) -> bool:
    return not any(db.scalar(select(func.count()).select_from(m).where(m.user_id == user.id))
                   for m in (Education, Experience, Skill, Project))


def _seed_profile(db: Session, user: User) -> None:
    profile, prefs = ensure_profile_rows(db, user)
    for field, value in PROFILE_FIELDS.items():
        setattr(profile, field, value)
    slug = re.sub(r"[^a-z0-9]+", "-", user.full_name.lower()).strip("-") or "me"
    profile.linkedin_url = f"https://example.com/in/{slug}"
    profile.github_url = f"https://example.com/github/{slug}"
    for field, value in PREFERENCES.items():
        setattr(prefs, field, value)
    for i, exp in enumerate(EXPERIENCES):
        db.add(Experience(user_id=user.id, sort_order=i, **exp))
    db.add(Education(user_id=user.id, sort_order=0, **EDUCATION))
    for name, level, years in SKILLS:
        db.add(Skill(user_id=user.id, name=name, category=taxonomy.category_of(name), level=level, years=years))
    for i, project in enumerate(PROJECTS):
        db.add(Project(user_id=user.id, sort_order=i, **project))
    db.flush()


def _resume_content(db: Session, user: User, target_role: str) -> dict[str, Any]:
    bundle = load_bundle(db, user)
    try:
        from app.services.resume_builder import build_from_profile
    except ImportError:
        return {"contact": {"name": user.full_name, "email": user.email}, "headline": bundle.profile.headline,
                "summary": bundle.profile.summary}
    return build_from_profile(bundle, target_role=target_role)


def _seed_resumes(db: Session, user: User) -> list[Resume]:
    has_default = db.scalar(select(func.count(Resume.id)).where(Resume.user_id == user.id, Resume.is_default.is_(True)))
    resumes = []
    for name, role, default in RESUMES:
        resume = Resume(user_id=user.id, name=name, target_role=role, status="active", is_demo=True,
                        is_default=default and not has_default, content=_resume_content(db, user, role))
        db.add(resume)
        resumes.append(resume)
    db.flush()
    return resumes


def _seed_jobs(db: Session, user: User) -> list[Job]:
    from app.services.jobs_ingest import ingest_postings
    from app.services.sources.demo import DemoSource

    filters = SearchFilters(roles=PREFERENCES["target_roles"], locations=["Thunder Bay, ON"], remote_regions=["Canada"])
    postings = DemoSource().search(db, user, filters)
    result = ingest_postings(db, user, postings, actor="agent")
    jobs = list(db.scalars(select(Job).where(Job.id.in_(result.job_ids))))
    visible = [j for j in jobs if not j.is_hidden]
    return sorted(visible, key=lambda j: (j.match.overall if j.match else 0), reverse=True)


def _resume_for(title: str, resumes: list[Resume]) -> Resume:
    lowered = title.lower()
    if re.search(r"\b(it|support|help ?desk|technician)\b", lowered):
        return resumes[2]
    if re.search(r"full.?stack|front.?end|web", lowered):
        return resumes[1]
    return resumes[0]


def _readiness(missing_salary: bool) -> list[dict[str, Any]]:
    items = [
        {"key": "resume", "label": "Resume tailored", "state": "ok", "detail": None, "resolvable": True,
         "field": "resume", "blocking": False},
        {"key": "cover_letter", "label": "Cover letter ready", "state": "ok", "detail": None, "resolvable": True,
         "field": "cover_letter", "blocking": False},
        {"key": "contact", "label": "Contact details", "state": "ok", "detail": None, "resolvable": True,
         "field": "profile.phone", "blocking": False},
        {"key": "work_authorization", "label": "Work authorization answered", "state": "ok", "detail": None,
         "resolvable": True, "field": "answers", "blocking": False},
    ]
    if missing_salary:
        items.append({"key": "salary", "label": "Salary expectation", "state": "missing",
                      "detail": "This employer asks for your expected salary. Add it before approving.",
                      "resolvable": True, "field": "salary_expectation", "blocking": True})
    return items


def _path(plan: PlannedApp) -> list[ApplicationStatus]:
    before = [S.saved, S.reviewing, S.ready]
    if plan.applied_days_ago is None:
        return before[: before.index(plan.status) + 1]
    after = {
        S.applied: [], S.confirmed: [S.confirmed], S.recruiter_contacted: [S.confirmed, S.recruiter_contacted],
        S.interview: [S.confirmed, S.interview],
        S.technical_interview: [S.confirmed, S.interview, S.technical_interview],
        S.offer: [S.confirmed, S.interview, S.technical_interview, S.final_interview, S.offer],
        S.rejected: [S.confirmed, *([S.interview] if plan.via_interview else []), S.rejected],
    }[plan.status]
    return [*before, S.applied, *after]


def _history(app: Application, plan: PlannedApp, now: datetime) -> None:
    applied = now - timedelta(days=plan.applied_days_ago) if plan.applied_days_ago is not None else None
    anchor = applied or now - timedelta(hours=20)
    pre_offsets = {S.saved: -3.0, S.reviewing: -2.0, S.ready: -1.0}
    previous: ApplicationStatus | None = None
    for status in _path(plan):
        if status in pre_offsets:
            when = anchor + timedelta(days=pre_offsets[status] if applied else pre_offsets[status] / 3)
        elif status == S.applied:
            when = anchor
        else:
            when = anchor + timedelta(days=_AFTER_APPLIED[status])
        app.status_history.append(ApplicationStatusChange(
            from_status=previous.value if previous else None, to_status=status.value,
            actor=_ACTORS.get(status, "user"), changed_at=when,
            note="Prepared by the agent" if status == S.ready else None))
        previous = status


def _new_application(job: Job, plan: PlannedApp, resume: Resume, position: int, now: datetime) -> Application:
    applied_at = now - timedelta(days=plan.applied_days_ago) if plan.applied_days_ago is not None else None
    source = job.sources[0] if job.sources else None
    prepared = (applied_at or now - timedelta(hours=20)) - timedelta(days=1)
    app = Application(
        user_id=job.user_id, job_id=job.id, company_name=job.company_name, job_title=job.title, location=job.location,
        source=source.source if source else None, url=source.url if source else None,
        apply_url=source.apply_url if source else None, status=plan.status, board_position=float(position),
        match_score=job.match.overall if job.match else None, resume_id=resume.id,
        date_discovered=prepared - timedelta(days=2), prepared_at=prepared if plan.status != S.reviewing else None,
        approved_at=applied_at - timedelta(minutes=10) if applied_at else None, applied_at=applied_at,
        submission_method="external_link" if applied_at else None, submission_state="submitted" if applied_at else None,
        readiness=_readiness(missing_salary=plan.status == S.reviewing), rejection_reason=plan.rejection_reason,
        is_demo=True,
    )
    _history(app, plan, now)
    return app


def _seed_applications(db: Session, jobs: list[Job], resumes: list[Resume], now: datetime) -> list[Application]:
    candidates = jobs[RESERVED_TOP_JOBS:] if len(jobs) > len(APPLICATION_PLAN) + RESERVED_TOP_JOBS else jobs
    apps = []
    for i, (job, plan) in enumerate(zip(candidates, APPLICATION_PLAN, strict=False)):
        app = _new_application(job, plan, _resume_for(job.title, resumes), i, now)
        db.add(app)
        apps.append(app)
    used = {a.job_id for a in apps}
    for job in [j for j in jobs[RESERVED_TOP_JOBS:] if j.id not in used][:2]:
        job.is_saved, job.saved_at = True, now - timedelta(days=1)
    db.flush()
    return apps


def _by_status(apps: list[Application]) -> dict[ApplicationStatus, Application]:
    out: dict[ApplicationStatus, Application] = {}
    for app in apps:
        out.setdefault(app.status, app)
    return out


def _email_domain(company: str) -> str:
    return re.sub(r"[^a-z0-9]", "", company.lower()) + ".example.com"


def _seed_recruiters(db: Session, user: User, apps: dict[ApplicationStatus, Application],
                     now: datetime) -> list[Recruiter]:
    specs = [
        (S.interview, "Priya Nair", "Talent Acquisition Partner", "recruiter", 2),
        (S.technical_interview, "Daniel Okafor", "Engineering Manager", "hiring_manager", 6),
        (S.recruiter_contacted, "Sarah Lindqvist", "Technical Recruiter", "recruiter", 4),
    ]
    recruiters = []
    for status, name, title, kind, days in specs:
        app = apps.get(status)
        if app is None:
            continue
        first, last = name.lower().split()
        rec = Recruiter(user_id=user.id, name=name, title=title, kind=kind, company=app.company_name,
                        email=f"{first}.{last}@{_email_domain(app.company_name)}",
                        linkedin_url=f"https://example.com/in/{first}-{last}", is_demo=True,
                        notes=f"Point of contact for the {app.job_title} application.",
                        last_contact_at=now - timedelta(days=days))
        db.add(rec)
        db.flush()
        app.recruiter_id = rec.id
        recruiters.append(rec)
    return recruiters


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def _seed_interviews(db: Session, apps: dict[ApplicationStatus, Application], now: datetime) -> list[Interview]:
    specs = [
        (S.interview, "phone_screen", _at(now.date() + timedelta(days=1), 15), 30, None,
         "https://meet.example.com/demo-phone-screen", ["Priya Nair (Talent Acquisition Partner)"], "pending"),
        (S.technical_interview, "technical", _at(now.date() + timedelta(days=7), 18, 30), 60, "Video call",
         "https://meet.example.com/demo-technical", ["Daniel Okafor (Engineering Manager)", "A senior developer"],
         "pending"),
        (S.offer, "final", now - timedelta(days=45 - 22), 45, "On site", None, ["Hiring manager"], "passed"),
    ]
    interviews = []
    for status, kind, when, minutes, location, url, people, outcome in specs:
        app = apps.get(status)
        if app is None:
            continue
        interview = Interview(user_id=app.user_id, application=app, kind=kind, scheduled_at=when,
                              duration_minutes=minutes, location=location, meeting_url=url, interviewers=people,
                              outcome=outcome, practice_log=[], prep={})
        db.add(interview)
        db.flush()
        interview.prep = generate_prep(db, app)
        interviews.append(interview)
    return interviews


def _seed_follow_ups(db: Session, apps: list[Application], now: datetime) -> None:
    confirmed = next((a for a in apps if a.status == S.confirmed), None)
    week_ago = now - timedelta(days=7)
    applied = next((a for a in apps if a.status == S.applied and a.applied_at and a.applied_at <= week_ago), None)
    for app, due in ((confirmed, now - timedelta(days=1)), (applied, now - timedelta(hours=1))):
        if app is not None:
            db.add(FollowUp(user_id=app.user_id, application_id=app.id, recruiter_id=app.recruiter_id, due_at=due,
                            channel="email", status="pending",
                            note=f"Check in on the {app.job_title} application."))


def _seed_notifications(db: Session, user: User, jobs: list[Job], apps: dict[ApplicationStatus, Application],
                        interviews: list[Interview], now: datetime) -> None:
    specs: list[tuple[str, str, str, str, str, float, bool]] = [
        ("agent", "Daily search complete",
         "Found 82 unique jobs across LinkedIn, Indeed and employer sites: 31 relevant, 8 ready to review.",
         "/jobs?view=recommended", "normal", 2, False)]
    if jobs:
        top = jobs[0]
        match = f"{top.match.overall}% match. " if top.match else ""
        specs.append(("excellent_match", f"Excellent match: {top.title} at {top.company_name}",
                      match + (top.match.recommendation if top.match else ""), f"/jobs/{top.id}", "high", 2, False))
    if interviews:
        first = interviews[0]
        specs.append(("interview", f"Interview scheduled with {first.application.company_name}",
                      "Your phone screen is tomorrow. Preparation notes are ready.", f"/interviews/{first.id}", "high",
                      20, False))
    if app := apps.get(S.recruiter_contacted):
        specs.append(("recruiter_response", f"Sarah Lindqvist from {app.company_name} replied",
                      f"She'd like a quick chat about the {app.job_title} role.", f"/applications/{app.id}", "normal",
                      30, True))
    if app := apps.get(S.confirmed):
        specs.append(("status_change", f"{app.company_name} confirmed your application",
                      f"{app.job_title} moved to Application Confirmed.", f"/applications/{app.id}", "low", 50, True))
        specs.append(("follow_up", f"Time to follow up with {app.company_name}",
                      f"It's been over a week since you applied for the {app.job_title} role.", "/follow-ups", "normal",
                      24, False))
    for kind, title, body, link, priority, hours_ago, read in specs:
        n = notify(db, user.id, kind, title, body, link=link, priority=priority)
        if n is not None:
            n.created_at = now - timedelta(hours=hours_ago)
            n.read_at = n.created_at + timedelta(hours=1) if read else None


def _seed_audit_story(db: Session, user: User, app: Application | None, resume_name: str) -> None:
    """The step-by-step trail for one application, as the agent and user would have produced it."""
    if app is None or app.applied_at is None:
        return
    t = app.applied_at
    source = {"linkedin": "LinkedIn", "indeed": "Indeed"}.get(app.source or "", "an employer website")
    where = f"{app.job_title} at {app.company_name}"
    match = f" ({app.match_score}% match)" if app.match_score else ""
    steps = [
        (t - timedelta(days=3), "agent", "job.discovered", f"Discovered {where} on {source}{match}"),
        (t - timedelta(days=1, hours=2), "agent", "resume.customized",
         f"Customized your {resume_name} for {app.company_name}: moved the most relevant experience to the top"),
        (t - timedelta(days=1, hours=1), "agent", "cover_letter.generated", f"Generated a cover letter for {where}"),
        (t - timedelta(days=1), "agent", "application.prepared",
         "Prepared the application: resume, cover letter and answers ready, all readiness checks passed"),
        (t - timedelta(minutes=10), "user", "application.approved",
         f"You reviewed and approved the application to {where}"),
        (t, "user", "application.submitted",
         f"Submitted the application to {app.company_name} on the employer's website"),
    ]
    for when, actor, action, summary in steps:
        entry = audit.record(db, user.id, action, summary, actor=actor, entity_type="application", entity_id=app.id)
        entry.created_at = when


def _seed_emails(db: Session, apps: list[Application]) -> None:
    for app in apps:
        if app.applied_at is None:
            continue
        domain = _email_domain(app.company_name)
        messages = [("confirmation", f"no-reply@{domain}", f"Thank you for applying to {app.company_name}",
                     f"We have received your application for {app.job_title}.", app.applied_at + timedelta(hours=2))]
        if app.status == S.interview:
            messages.append(("interview_invite", f"talent@{domain}", f"{app.job_title}: phone screen",
                             "We'd like to schedule a 30-minute phone screen with you.",
                             app.applied_at + timedelta(days=8)))
        if app.status == S.rejected:
            messages.append(("rejection", f"careers@{domain}", f"Your application to {app.company_name}",
                             "Unfortunately, we have decided to move forward with other candidates.",
                             app.applied_at + timedelta(days=12)))
        for category, sender, subject, snippet, received in messages:
            db.add(EmailMessage(user_id=app.user_id, application_id=app.id,
                                provider_message_id=f"demo-seed:{app.id}:{category}", from_address=sender,
                                subject=subject, snippet=snippet, category=category, confidence=0.9,
                                received_at=received, processed=True))


# Seeded rows without an ``is_demo`` flag; their ids are recorded in the demo manifest.
Tracked = type[Notification] | type[AuditLog] | type[EmailMessage]


def _new_ids(db: Session, model: Tracked, user_id: int, after: int) -> list[int]:
    return list(db.scalars(select(model.id).where(model.user_id == user_id, model.id > after)))


def _max_id(db: Session, model: Tracked, user_id: int) -> int:
    return db.scalar(select(func.max(model.id)).where(model.user_id == user_id)) or 0


def _search_task(user: User, now: datetime) -> AgentTask:
    started = now - timedelta(hours=2)
    steps = [{"key": key, "label": label, "status": "done", "detail": detail, "count": count,
              "started_at": (started + timedelta(seconds=20 * i)).isoformat(),
              "finished_at": (started + timedelta(seconds=20 * (i + 1))).isoformat()}
             for i, (key, label, detail, count) in enumerate(SEARCH_STEPS)]
    return AgentTask(user_id=user.id, kind="search", title="Daily job search", status=AgentTaskStatus.completed,
                     trigger="schedule", steps=steps, params={"demo": True},
                     result={"found": 140, "unique": 82, "relevant": 31, "ready": 8},
                     started_at=started, finished_at=started + timedelta(seconds=20 * len(SEARCH_STEPS)),
                     created_at=started)


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------


def seed_demo(db: Session, user: User) -> str:
    """Fill the account with realistic sample data. Idempotent. Commits and returns a summary message."""
    clear_demo(db, user)
    now = utcnow()
    watermarks = {m: _max_id(db, m, user.id) for m in (Notification, AuditLog, EmailMessage)}
    profile_seeded = _profile_is_empty(db, user)
    if profile_seeded:
        _seed_profile(db, user)
    resumes = _seed_resumes(db, user)
    task = _search_task(user, now)
    db.add(task)
    jobs = _seed_jobs(db, user)
    apps = _seed_applications(db, jobs, resumes, now)
    first_by_status = _by_status(apps)
    _seed_recruiters(db, user, first_by_status, now)
    interviews = _seed_interviews(db, first_by_status, now)
    _seed_follow_ups(db, apps, now)
    _seed_notifications(db, user, jobs, first_by_status, interviews, now)
    story_app = max((a for a in apps if a.applied_at), key=lambda a: a.applied_at, default=None)
    story_resume = next((r.name for r in resumes if story_app and r.id == story_app.resume_id), "resume")
    _seed_audit_story(db, user, story_app, story_resume)
    _seed_emails(db, apps)
    db.flush()
    task.params = {
        "demo": True,
        "profile_seeded": profile_seeded,
        "notification_ids": _new_ids(db, Notification, user.id, watermarks[Notification]),
        "audit_log_ids": _new_ids(db, AuditLog, user.id, watermarks[AuditLog]),
        "email_message_ids": _new_ids(db, EmailMessage, user.id, watermarks[EmailMessage]),
    }
    audit.record(db, user.id, "demo.seeded", "Loaded demo data (sample profile, jobs and applications)",
                 actor="system", entity_type="user", entity_id=user.id)
    db.commit()
    log.info("Seeded demo data for user %s", user.id)
    return (f"Loaded sample data: {len(resumes)} resumes, {len(jobs)} jobs, {len(apps)} applications and "
            f"{len(interviews)} interviews. Everything is marked as demo data and can be removed at any time.")


def remove_demo(db: Session, user: User) -> None:
    clear_demo(db, user)
    audit.record(db, user.id, "demo.cleared", "Removed demo data", actor="user", entity_type="user", entity_id=user.id)
    db.commit()
