"""Job quality filters: hide jobs the user can't or won't take, and flag questionable postings.

Every decision carries a human-readable reason. Jobs the user explicitly saved are never
hidden, and a job the user un-hid stays visible (marked with the ``user_unhidden`` flag).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.models import Job, utcnow
from app.schemas.profile import QualityFilters
from app.services import taxonomy
from app.services.dedup import normalize_company
from app.services.location import CANADA, USA, location_matches
from app.services.profile_bundle import ProfileBundle
from app.services.search_prefs import quality_filters_for, target_regions, yearly

USER_HIDDEN_PREFIX = "You hid this job"
USER_UNHIDDEN_FLAG = {"code": "user_unhidden", "label": "Shown at your request despite your filters",
                      "severity": "info"}

LEVEL_LABELS = {"entry": "Entry level", "junior": "Junior", "intermediate": "Intermediate", "senior": "Senior",
                "lead": "Lead"}

_GENERIC_COMPANIES = {"", "confidential", "unknown", "n a", "na", "private", "undisclosed", "company confidential",
                      "hiring company"}
_FREE_MAIL_RE = re.compile(r"[\w.+-]+@(?:gmail|yahoo|hotmail|outlook|aol|protonmail|icloud|live)\.[a-z.]+", re.I)
_SUSPICIOUS_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(training|registration|application|processing|starter|onboarding)\s+(fee|kit|cost)", re.I),
     "asks you to pay a fee"),
    (re.compile(r"\b(pay|send|deposit|purchase|buy)\b.{0,40}\b(fee|payment|equipment|kit|deposit)\b", re.I),
     "asks you to pay or buy something upfront"),
    (re.compile(r"\bbank (?:account|details|information|login)|\bsin number|social insurance number|"
                r"\bvoid cheque\b", re.I), "asks for banking or identity details up front"),
    (re.compile(r"\bgift ?cards?\b|\bwire transfer\b|\bcrypto(?:currency)? payment|\bbitcoin\b", re.I),
     "mentions gift cards, wire transfers or crypto"),
    (re.compile(r"\bearn\s+(?:up to\s+)?\$[\d,]+\s*(?:/|per|a|an|each)\s*(?:week|day)\b", re.I),
     "promises unusually high weekly or daily pay"),
    (re.compile(r"\b(telegram|whatsapp|signal app)\b", re.I), "asks you to contact a recruiter via chat apps"),
]
_NO_EXPERIENCE_RE = re.compile(r"\bno experience (?:needed|required|necessary)\b", re.I)
_NO_SPONSOR_RE = re.compile(r"\b(unable|not able|cannot|can't|will not|won't|do not|does not)\s+(?:to\s+)?"
                            r"(?:provide\s+|offer\s+)?sponsor", re.I)


@dataclass
class QualityResult:
    hidden_reasons: list[str] = field(default_factory=list)
    flags: list[dict] = field(default_factory=list)


def authorization_country(text: str | None) -> str | None:
    """Country a work-authorization requirement refers to, if any."""
    if not text:
        return None
    low = text.lower()
    if re.search(r"united states|\bu\.s\.(?:a\.)?|\busa\b|\bus citizen|\bus work", low):
        return USA
    if "canad" in low:
        return CANADA
    if re.search(r"united kingdom|\buk\b", low):
        return "United Kingdom"
    return None


def user_authorized_for(bundle: ProfileBundle, country: str) -> bool | None:
    """True/False when the profile says whether the user may work in ``country``; None when unknown."""
    countries = {c.strip().lower() for c in bundle.profile.authorized_countries or [] if c}
    if not countries:
        return None
    aliases = {CANADA: {"canada", "ca"}, USA: {"united states", "usa", "us", "united states of america"}}
    return bool(countries & aliases.get(country, {country.lower()}))


def missing_certifications(job: Job, bundle: ProfileBundle) -> list[str]:
    required = (job.requirements or {}).get("certifications") or []
    have = bundle.certifications | taxonomy.normalize_set(bundle.preferences.required_certifications_available or [])
    return [c for c in required if taxonomy.canonicalize(c) not in have]


def authorization_problem(job: Job, bundle: ProfileBundle) -> str | None:
    """Human-readable reason when the user can't meet the posting's work-authorization requirement."""
    text = (job.requirements or {}).get("work_authorization")
    country = authorization_country(text)
    if country and user_authorized_for(bundle, country) is False:
        return f"Requires authorization to work in {'the ' if country == USA else ''}{country}"
    if text and bundle.profile.requires_sponsorship and _NO_SPONSOR_RE.search(job.description or ""):
        return "The employer can't sponsor a work permit, and your profile says you need sponsorship"
    return None


def salary_shortfall(job: Job, bundle: ProfileBundle) -> tuple[float, float] | None:
    """(job_top_yearly, user_min_yearly) when the job's best pay is below the user's minimum."""
    prefs = bundle.preferences
    minimum = yearly(prefs.salary_min, prefs.salary_period) if prefs.salary_min else yearly(
        bundle.profile.desired_salary, bundle.profile.salary_period)
    top = yearly(job.salary_max or job.salary_min, job.salary_period)
    if not minimum or not top:
        return None
    return (top, minimum) if top < minimum else None


def _hide_reasons(job: Job, bundle: ProfileBundle, qf: QualityFilters) -> list[str]:
    prefs, rules = bundle.preferences, qf.hide
    reasons: list[str] = []
    if rules.get("missing_certifications") and (missing := missing_certifications(job, bundle)):
        reasons.append(f"Requires {', '.join(missing)} certification, which isn't in your profile")
    if rules.get("outside_locations") and (prefs.target_locations or []):
        targets, remote = target_regions(prefs, bundle.profile)
        ok, reason = location_matches(
            {"location": job.location, "city": job.city, "province": job.province, "country": job.country,
             "work_arrangement": job.work_arrangement}, targets, remote)
        if not ok:
            reasons.append(reason)
    if rules.get("work_authorization") and (problem := authorization_problem(job, bundle)):
        reasons.append(problem)
    if rules.get("below_min_salary") and (gap := salary_shortfall(job, bundle)):
        reasons.append(f"Pays up to about ${gap[0]:,.0f}/year, below your minimum of ${gap[1]:,.0f}")
    if rules.get("outside_experience_level") and prefs.experience_levels and job.experience_level \
            and job.experience_level not in prefs.experience_levels:
        wanted = ", ".join(LEVEL_LABELS.get(lvl, lvl).lower() for lvl in prefs.experience_levels)
        reasons.append(f"{LEVEL_LABELS.get(job.experience_level, job.experience_level)} role — "
                       f"you're looking for {wanted} roles")
    if rules.get("avoided_companies"):
        avoided = {normalize_company(c) for c in prefs.avoid_companies or []}
        if normalize_company(job.company_name) in avoided:
            reasons.append(f"You asked to avoid {job.company_name}")
    return reasons


def suspicious_signals(job: Job) -> list[str]:
    text = f"{job.title}\n{job.description or ''}"
    signals = [label for pattern, label in _SUSPICIOUS_PATTERNS if pattern.search(text)]
    if _FREE_MAIL_RE.search(text):
        signals.append("recruiter uses a free personal email address")
    if _NO_EXPERIENCE_RE.search(text) and (yearly(job.salary_max or job.salary_min, job.salary_period) or 0) > 90_000:
        signals.append("high pay with no experience required")
    if normalize_company(job.company_name) in _GENERIC_COMPANIES:
        signals.append("no company name")
    return list(dict.fromkeys(signals))


def _flags(job: Job, qf: QualityFilters) -> list[dict]:
    rules = qf.flag
    flags: list[dict] = []
    if rules.get("unclear_salary") and not (job.salary_min or job.salary_max):
        flags.append({"code": "unclear_salary", "label": "Salary not listed", "severity": "info"})
    if rules.get("unclear_employment_type") and not job.employment_type:
        flags.append({"code": "unclear_employment_type", "label": "Employment type not specified",
                      "severity": "info"})
    if rules.get("suspicious_posting") and (signals := suspicious_signals(job)):
        flags.append({"code": "suspicious_posting", "label": f"Possible scam: {'; '.join(signals)}",
                      "severity": "warning"})
    if rules.get("missing_company_info"):
        company = job.company
        generic = normalize_company(job.company_name) in _GENERIC_COMPANIES
        if generic or (company is not None and not company.website and not company.description):
            flags.append({"code": "missing_company_info", "label": "Limited company information",
                          "severity": "warning" if generic else "info"})
    if rules.get("deadline_approaching") and job.deadline:
        days = (job.deadline - date.today()).days
        if days < 0:
            flags.append({"code": "deadline_passed", "label": "Application deadline has passed", "severity": "warning"})
        elif days <= qf.deadline_warning_days:
            when = "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"
            flags.append({"code": "deadline_approaching", "label": f"Closes {when}", "severity": "warning"})
    if rules.get("old_posting") and job.posted_at:
        age = (utcnow() - job.posted_at).days
        if age > qf.max_age_days:
            flags.append({"code": "old_posting", "label": f"Posted {age} days ago — may already be filled",
                          "severity": "info"})
    return flags


def evaluate(job: Job, bundle: ProfileBundle, qf: QualityFilters | None = None) -> QualityResult:
    qf = qf or quality_filters_for(bundle.preferences)
    return QualityResult(hidden_reasons=_hide_reasons(job, bundle, qf), flags=_flags(job, qf))


def apply_quality(job: Job, bundle: ProfileBundle, qf: QualityFilters | None = None) -> QualityResult:
    """Recompute ``job.flags`` / ``is_hidden`` / ``hidden_reasons`` (respecting user choices)."""
    result = evaluate(job, bundle, qf)
    user_unhidden = any(f.get("code") == USER_UNHIDDEN_FLAG["code"] for f in job.flags or [])
    user_hidden = [r for r in job.hidden_reasons or [] if r.startswith(USER_HIDDEN_PREFIX)] if job.is_hidden else []
    job.flags = result.flags + ([USER_UNHIDDEN_FLAG] if user_unhidden else [])
    if user_hidden:
        job.is_hidden, job.hidden_reasons = True, user_hidden
    elif job.is_saved or user_unhidden or not result.hidden_reasons:
        job.is_hidden, job.hidden_reasons = False, []
    else:
        job.is_hidden, job.hidden_reasons = True, result.hidden_reasons
    return result


def deadline_window(qf: QualityFilters) -> tuple[date, date]:
    today = date.today()
    return today, today + timedelta(days=qf.deadline_warning_days)
