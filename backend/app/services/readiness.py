"""Application readiness checklist.

Each item tells the user what is ready, what needs attention, and where to fix it
(``field``). Items with ``blocking=True`` prevent approval until resolved.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models import Application, ApplicationAnswer, Job
from app.schemas.applications import ReadinessItem
from app.services.answers import salary_text
from app.services.profile_bundle import ProfileBundle

_DEV_ROLE_RE = re.compile(r"develop|engineer|programmer|software|web|designer|front[- ]?end|back[- ]?end|full[- ]?stack"
                          r"|data scien", re.I)
_DEADLINE_WARNING_DAYS = 3


def posting_requests_cover_letter(job: Job | None) -> bool:
    return bool(job and re.search(r"cover\s+letter", job.description or "", re.I))


def _is_work_auth(answer: ApplicationAnswer) -> bool:
    return "authorized to work" in answer.question.lower()


def _is_salary(answer: ApplicationAnswer) -> bool:
    return "salary" in answer.question.lower()


def _resume_item(app: Application) -> ReadinessItem:
    version = app.resume_version
    if version is not None:
        pending = sum(1 for c in version.changes or [] if c.get("accepted") is None)
        detail = (f"Tailored for this job — {pending} suggested change{'s' if pending != 1 else ''} to review"
                  if pending else "Tailored for this job")
        return ReadinessItem(key="resume", label="Resume ready", state="ok", detail=detail, field="resume")
    if app.resume_id:
        return ReadinessItem(key="resume", label="Resume ready", state="ok", detail="Using your selected resume",
                             field="resume")
    return ReadinessItem(key="resume", label="No resume selected", state="missing", blocking=True,
                         detail="Choose or create a resume for this application.", field="resume")


def _cover_letter_item(app: Application) -> ReadinessItem:
    if app.cover_letter is not None and app.cover_letter.content.strip():
        return ReadinessItem(key="cover_letter", label="Cover letter ready", state="ok", field="cover_letter")
    if posting_requests_cover_letter(app.job):
        return ReadinessItem(key="cover_letter", label="Cover letter required", state="missing", blocking=True,
                             detail="This posting asks for a cover letter.", field="cover_letter")
    return ReadinessItem(key="cover_letter", label="No cover letter", state="ok",
                         detail="This posting doesn't ask for one. You can still add one.", field="cover_letter")


def _contact_items(bundle: ProfileBundle) -> list[ReadinessItem]:
    items = [ReadinessItem(key="email", label="Email available", state="ok", detail=bundle.user.email,
                           field="profile.email")]
    if bundle.profile.phone:
        items.append(ReadinessItem(key="phone", label="Phone number available", state="ok", field="profile.phone"))
    else:
        items.append(ReadinessItem(key="phone", label="Phone number missing", state="missing",
                                   detail="Most application forms ask for a phone number.", field="profile.phone"))
    return items


def _portfolio_item(bundle: ProfileBundle, app: Application) -> ReadinessItem | None:
    if not _DEV_ROLE_RE.search(app.job_title or ""):
        return None
    p = bundle.profile
    if p.portfolio_url or p.github_url or p.website_url:
        return ReadinessItem(key="portfolio", label="Portfolio link available", state="ok",
                             field="profile.portfolio_url")
    return ReadinessItem(key="portfolio", label="Portfolio URL missing", state="missing",
                         detail="Optional, but a GitHub or portfolio link helps for developer roles.",
                         field="profile.portfolio_url")


def _answer_items(app: Application, bundle: ProfileBundle) -> list[ReadinessItem]:
    items: list[ReadinessItem] = []
    answers = app.answers
    unanswered = [a for a in answers if a.required and not a.answer.strip()]
    if unanswered:
        n = len(unanswered)
        items.append(ReadinessItem(key="answers", label=f"{n} required question{'s' if n != 1 else ''} unanswered",
                                   state="missing", blocking=True, field="answers",
                                   detail="; ".join(a.question for a in unanswered[:3])))
    elif answers:
        items.append(ReadinessItem(key="answers", label="All required questions answered", state="ok", field="answers"))
    auth = next((a for a in answers if _is_work_auth(a)), None)
    if auth and auth.answer.strip() and not auth.confirmed:
        items.append(ReadinessItem(key="work_authorization", label="Work authorization question needs confirmation",
                                   state="warning", field="answers", detail=f"Prepared answer: {auth.answer}"))
    salary = next((a for a in answers if _is_salary(a)), None)
    if salary is not None and not salary.answer.strip() and not salary_text(bundle, app):
        items.append(ReadinessItem(key="salary", label="Salary expectation required", state="warning",
                                   detail="Many forms ask for this. Add a figure you're comfortable sharing.",
                                   field="application.salary_expectation"))
    other = [a for a in answers
             if a.needs_confirmation and not a.confirmed and a.answer.strip() and not _is_work_auth(a)]
    if other:
        n = len(other)
        items.append(ReadinessItem(key="confirmations",
                                   label=f"{n} answer{'s' if n != 1 else ''} need{'s' if n == 1 else ''} your "
                                         "confirmation",
                                   state="warning", field="answers",
                                   detail="; ".join(a.question for a in other[:3])))
    return items


def _job_items(job: Job | None, bundle: ProfileBundle) -> list[ReadinessItem]:
    if job is None:
        return []
    items: list[ReadinessItem] = []
    today = date.today()
    if job.deadline and job.deadline < today:
        items.append(ReadinessItem(key="deadline", label="Application deadline has passed", state="missing",
                                   blocking=True, resolvable=False, detail=f"The deadline was {job.deadline:%B %-d}."))
    elif job.deadline and (job.deadline - today).days <= _DEADLINE_WARNING_DAYS:
        days = (job.deadline - today).days
        detail = "Closes today." if days == 0 else f"Closes in {days} day{'s' if days != 1 else ''}."
        items.append(ReadinessItem(key="deadline", label="Deadline is close", state="warning", resolvable=False,
                                   detail=detail))
    if not job.is_open:
        items.append(ReadinessItem(key="closed", label="This posting may be closed", state="warning",
                                   resolvable=False, detail="Check the employer's site before applying."))
    city = (bundle.profile.city or "").strip()
    if job.work_arrangement in ("onsite", "hybrid") and job.city and city and job.city.lower() != city.lower():
        items.append(ReadinessItem(key="relocation", label="Relocation or commute required", state="warning",
                                   detail=f"This role is {job.work_arrangement} in {job.city}; you're based in {city}.",
                                   field="answers"))
    return items


def compute_readiness(db: Session, bundle: ProfileBundle, application: Application) -> list[dict[str, Any]]:
    """Return ReadinessItem dicts for ``application`` (does not persist them)."""
    db.flush()
    items: list[ReadinessItem] = [_resume_item(application), _cover_letter_item(application),
                                  *_contact_items(bundle)]
    portfolio = _portfolio_item(bundle, application)
    if portfolio:
        items.append(portfolio)
    items += _answer_items(application, bundle)
    items += _job_items(application.job, bundle)
    return [i.model_dump() for i in items]


def has_blocking(items: list[dict[str, Any]]) -> bool:
    return any(i.get("blocking") for i in items)


def summarize(items: list[dict[str, Any]]) -> dict[str, int]:
    summary = {"ok": 0, "warning": 0, "missing": 0}
    for item in items:
        summary[item.get("state", "ok")] = summary.get(item.get("state", "ok"), 0) + 1
    return summary
