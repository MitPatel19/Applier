"""Transparent job matching.

Each job is scored against the user's profile in nine categories. Every category returns a
0-100 score, the weight used, whether it applies (a category is excluded from the overall
score when the posting doesn't provide the information), a one-line summary and concrete
reasons with numbers ("You have 7 of 9 required skills (78%)"). The overall score is the
weighted average of the applicable categories.

Only facts from ``ProfileBundle`` are used — nothing is assumed about the user.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Application, Company, Job, JobMatch, User, UserPreference, utcnow
from app.services import taxonomy
from app.services.dedup import normalize_company, title_alignment
from app.services.jd_extract import EDUCATION_LEVELS, education_level_of
from app.services.location import location_matches
from app.services.profile_bundle import ProfileBundle, load_bundle
from app.services.quality import (
    apply_quality,
    authorization_country,
    authorization_problem,
    missing_certifications,
    suspicious_signals,
    user_authorized_for,
)
from app.services.search_prefs import agent_settings_for, quality_filters_for, target_regions, yearly

DEFAULT_WEIGHTS: dict[str, int] = {
    "skills": 30,
    "experience": 18,
    "education": 10,
    "location": 12,
    "salary": 8,
    "work_arrangement": 6,
    "employment_type": 4,
    "career": 7,
    "requirements": 5,
}

CATEGORY_LABELS: dict[str, str] = {
    "skills": "Technical skills",
    "experience": "Experience",
    "education": "Education",
    "location": "Location",
    "salary": "Salary",
    "work_arrangement": "Work arrangement",
    "employment_type": "Employment type",
    "career": "Career alignment",
    "requirements": "Required qualifications",
}

IMPLIED_CREDIT = 0.6
REQUIRED_SHARE = 0.75
GOOD_CUT = 65
POSSIBLE_CUT = 50
BLOCKER_CAP = 45  # overall score cap when a hard requirement can't be met

LEVEL_YEARS: dict[str, tuple[float, float | None]] = {
    "entry": (0, 1), "junior": (0, 2), "intermediate": (2, 5), "senior": (5, None), "lead": (7, None),
}
ARRANGEMENT_LABELS = {"onsite": "On-site", "hybrid": "Hybrid", "remote": "Remote"}
EMPLOYMENT_LABELS = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract",
                     "internship": "Internship", "co_op": "Co-op", "temporary": "Temporary"}
# Partial credit when the arrangement isn't what the user asked for: (job, wanted) -> score
_ARRANGEMENT_PARTIAL = {("hybrid", "remote"): 50, ("hybrid", "onsite"): 70, ("onsite", "hybrid"): 60,
                        ("remote", "hybrid"): 70, ("remote", "onsite"): 60, ("onsite", "remote"): 20}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _join(items: list[str], limit: int = 4) -> str:
    items = list(items)[:limit]
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def _money(amount: float, period: str | None = "yearly") -> str:
    return f"${amount:,.2f}/hour".replace(".00/", "/") if period == "hourly" else f"${amount:,.0f}"


def _years(value: float) -> str:
    return f"{value:g} year{'s' if value != 1 else ''}"


@dataclass
class CareerSignals:
    """Past behaviour used as light, transparent recommendation signals."""

    liked: list[tuple[int | None, str]] = field(default_factory=list)  # saved / applied / interested
    not_interested: list[tuple[int, str]] = field(default_factory=list)


def load_signals(db: Session, user_id: int) -> CareerSignals:
    signals = CareerSignals()
    rows = db.execute(select(Job.id, Job.title, Job.is_saved, Job.user_feedback).where(
        Job.user_id == user_id, (Job.is_saved.is_(True)) | (Job.user_feedback.is_not(None))))
    for job_id, title, saved, feedback in rows:
        if feedback == "not_interested":
            signals.not_interested.append((job_id, title))
        elif saved or feedback == "interested":
            signals.liked.append((job_id, title))
    for job_id, title in db.execute(select(Application.job_id, Application.job_title).where(
            Application.user_id == user_id)):
        signals.liked.append((job_id, title))
    return signals


@dataclass
class Category:
    key: str
    score: int = 0
    applicable: bool = True
    summary: str = ""
    reasons: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)

    def as_dict(self, weight: int) -> dict[str, Any]:
        return {"key": self.key, "label": CATEGORY_LABELS[self.key], "score": max(0, min(100, round(self.score))),
                "weight": weight, "applicable": self.applicable, "summary": self.summary, "reasons": self.reasons,
                "matched": self.matched, "missing": self.missing}


def _not_applicable(key: str, summary: str) -> Category:
    return Category(key=key, applicable=False, summary=summary)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


def _skill_credit(skills: list[str], have: set[str], implied: dict[str, str]) -> tuple[float, list[str], list[str],
                                                                                      list[str]]:
    """Return (credit 0-1, full matches, implied matches, missing)."""
    full = [s for s in skills if s in have]
    partial = [s for s in skills if s not in have and s in implied]
    missing = [s for s in skills if s not in have and s not in implied]
    credit = (len(full) + IMPLIED_CREDIT * len(partial)) / len(skills) if skills else 0.0
    return credit, full, partial, missing


def _implied_sources(have: set[str]) -> dict[str, str]:
    """Implied skill -> the skill of the user's that implies it."""
    out: dict[str, str] = {}
    for skill in sorted(have):
        for implied in taxonomy.IMPLIES.get(skill, []):
            if implied not in have:
                out.setdefault(implied, skill)
    return out


def score_skills(req: dict, bundle: ProfileBundle) -> Category:
    required = list(req.get("required_skills") or [])
    preferred = list(req.get("preferred_skills") or [])
    if not required and not preferred:
        required = list(req.get("technologies") or [])
    if not required and not preferred:
        return _not_applicable("skills", "The posting doesn't list specific technical skills")
    have = bundle.skill_names
    implied = _implied_sources(have)
    cat = Category(key="skills")
    r_credit, r_full, r_partial, r_missing = _skill_credit(required, have, implied)
    p_credit, p_full, p_partial, p_missing = _skill_credit(preferred, have, implied)
    if required and preferred:
        cat.score = 100 * (REQUIRED_SHARE * r_credit + (1 - REQUIRED_SHARE) * p_credit)
    else:
        cat.score = 100 * (r_credit if required else p_credit)

    if required:
        pct = round(100 * len(r_full) / len(required))
        cat.reasons.append(f"You have {len(r_full)} of {len(required)} required skills ({pct}%)"
                           + (f": {_join(r_full, 6)}" if r_full else ""))
    if preferred:
        cat.reasons.append(f"You have {len(p_full)} of {len(preferred)} nice-to-have skills"
                           + (f" ({_join(p_full, 5)})" if p_full else ""))
    for skill in r_partial + p_partial:
        cat.reasons.append(f"{skill} counted as partial credit ({int(IMPLIED_CREDIT * 100)}%) — implied by your "
                           f"{implied[skill]} experience")
    if r_missing:
        cat.reasons.append(f"Missing required: {_join(r_missing, 6)}")
    if p_missing:
        cat.reasons.append(f"Missing nice-to-have: {_join(p_missing, 6)}")
    for skill in r_full[:3]:
        years = bundle.years_with_skill(skill)
        if years:
            cat.reasons.append(f"About {_years(years)} of hands-on {skill} experience")
    cat.matched = r_full + r_partial + p_full + p_partial
    cat.missing = r_missing + p_missing
    total = len(required) or len(preferred)
    got = len(r_full) if required else len(p_full)
    cat.summary = f"{got} of {total} {'required' if required else 'listed'} skills" + (
        f", plus {len(r_partial + p_partial)} implied" if r_partial or p_partial else "")
    return cat


def score_experience(job: Job, req: dict, bundle: ProfileBundle) -> Category:
    min_years = req.get("min_years_experience")
    max_years = req.get("max_years_experience")
    level = job.experience_level
    if min_years is None and level is None:
        return _not_applicable("experience", "The posting doesn't state an experience requirement")
    have = bundle.total_years_experience()
    cat = Category(key="experience")
    if min_years is None:
        min_years, max_years = LEVEL_YEARS.get(level, (0, None))
        basis = f"{level.capitalize()}-level roles usually expect {_years(min_years)}" + (
            f"–{_years(max_years)}" if max_years else "+")
    else:
        basis = f"Posting asks for {min_years:g}" + (f"–{max_years:g}" if max_years else "+") + " years"
    cat.reasons.append(f"{basis}; you have about {have:g}")

    if have >= min_years:
        cat.score = 100
        cat.summary = "Meets the experience requirement"
        if max_years is not None and have > max_years + 3:
            cat.score = 80
            cat.summary = "You may be more experienced than this role needs"
            cat.reasons.append(f"You have well over the {max_years:g}-year upper range — it may be a step back")
    else:
        gap = min_years - have
        cat.score = 100 * (have / min_years) ** 1.5 if min_years else 100
        cat.summary = f"About {gap:g} year{'s' if gap != 1 else ''} short of the requirement"
        if min_years <= 1 and (bundle.projects or bundle.educations):
            cat.score = max(cat.score, 60)
            cat.reasons.append("Your projects and education can offset limited paid experience for this entry role")
    wanted_levels = bundle.preferences.experience_levels or []
    if level and wanted_levels:
        if level in wanted_levels:
            cat.reasons.append(f"Matches the {level} level you're targeting")
        else:
            cat.reasons.append(f"{level.capitalize()} level isn't one you're targeting ({', '.join(wanted_levels)})")
    related = [e for e in bundle.experiences if title_alignment(job.title, e.position) >= 0.75]
    if related:
        e = related[0]
        cat.reasons.append(f"Your role as {e.position} at {e.company} is closely related")
        cat.matched.append(e.position)
    return cat


def score_education(req: dict, bundle: ProfileBundle) -> Category:
    wanted = req.get("education_level")
    if not wanted or wanted == "none":
        return _not_applicable("education", "No education requirement listed")
    cat = Category(key="education")
    lines = req.get("education") or []
    equivalent = any("equivalent" in line.lower() for line in lines)
    best = bundle.highest_education()
    if best is None:
        cat.score = 20
        cat.summary = "Add your education to compare"
        cat.reasons.append(f"Posting asks for a {wanted} or higher; your profile has no education yet")
        return cat
    have_level = education_level_of(f"{best.degree or ''} {best.program or ''}") or "diploma"
    have_rank, want_rank = EDUCATION_LEVELS.index(have_level), EDUCATION_LEVELS.index(wanted)
    described = " in ".join(p for p in (best.degree, best.program) if p) or best.institution
    if have_rank >= want_rank:
        cat.score = 100
        cat.summary = "Meets the education requirement"
        cat.reasons.append(f"Posting asks for a {wanted}; you have {described} ({best.institution})")
        cat.matched.append(described)
    else:
        cat.score = 75 if equivalent and want_rank - have_rank == 1 else 55 if want_rank - have_rank == 1 else 25
        cat.summary = f"Posting asks for a {wanted}"
        cat.reasons.append(f"Posting asks for a {wanted}; your highest is {described}")
        if equivalent:
            cat.reasons.append("The posting accepts equivalent experience")
        cat.missing.append(f"{wanted.capitalize()} degree")
    program_words = {w for w in re.findall(r"[a-z]+", (best.program or "").lower()) if len(w) > 3}
    if program_words and any(program_words & set(re.findall(r"[a-z]+", line.lower())) for line in lines):
        cat.reasons.append(f"Your {best.program} program matches the field the posting asks for")
    return cat


def score_location(job: Job, bundle: ProfileBundle) -> Category:
    if not (job.location or job.city or job.province or job.country or job.work_arrangement == "remote"):
        return _not_applicable("location", "Location not specified in the posting")
    targets, remote = target_regions(bundle.preferences, bundle.profile)
    if not targets and not remote:
        return _not_applicable("location", "Set target locations to compare")
    ok, reason = location_matches({"location": job.location, "city": job.city, "province": job.province,
                                   "country": job.country, "work_arrangement": job.work_arrangement}, targets, remote)
    cat = Category(key="location", score=100 if ok else 15, reasons=[reason])
    cat.summary = "In one of your target locations" if ok else "Outside your target locations"
    (cat.matched if ok else cat.missing).append(job.location or "Location")
    return cat


def _user_minimum(bundle: ProfileBundle) -> tuple[float | None, str | None]:
    prefs, profile = bundle.preferences, bundle.profile
    if prefs.salary_min:
        return yearly(prefs.salary_min, prefs.salary_period), prefs.currency
    if profile.desired_salary:
        return yearly(profile.desired_salary, profile.salary_period), profile.currency
    return None, None


def _salary_text(job: Job) -> str:
    lo, hi, period = job.salary_min, job.salary_max, job.salary_period
    if lo and hi and hi != lo:
        return f"{_money(lo, period)}–{_money(hi, period)}"
    return _money(lo or hi or 0, period)


def score_salary(job: Job, bundle: ProfileBundle) -> Category:
    if not (job.salary_min or job.salary_max):
        return _not_applicable("salary", "Salary not listed in the posting")
    minimum, currency = _user_minimum(bundle)
    if not minimum:
        return _not_applicable("salary", "Set a minimum salary in your preferences to compare")
    low = yearly(job.salary_min or job.salary_max, job.salary_period) or 0
    top = yearly(job.salary_max or job.salary_min, job.salary_period) or 0
    cat = Category(key="salary")
    offered = _salary_text(job)
    if job.salary_period == "hourly":
        offered += f" (about {_money(low)}/year)"
    cat.reasons.append(f"Pays {offered}; your minimum is {_money(minimum)}/year")
    if low >= minimum:
        cat.score, cat.summary = 100, "Meets your salary expectations"
    elif top >= minimum:
        cat.score, cat.summary = 75, "The top of the range meets your minimum"
    else:
        ratio = top / minimum
        cat.score = max(0.0, 100 * (ratio - 0.7) / 0.3)
        cat.summary = f"About {100 * (1 - ratio):.0f}% below your minimum"
    if job.currency and currency and job.currency != currency:
        cat.reasons.append(f"Salary is listed in {job.currency}; your preference is in {currency} (not converted)")
    return cat


def score_work_arrangement(job: Job, bundle: ProfileBundle) -> Category:
    if not job.work_arrangement:
        return _not_applicable("work_arrangement", "Work arrangement not specified")
    wanted = bundle.preferences.work_arrangements or bundle.profile.preferred_arrangements or []
    if not wanted:
        return _not_applicable("work_arrangement", "No work arrangement preference set")
    label = ARRANGEMENT_LABELS.get(job.work_arrangement, job.work_arrangement)
    wanted_text = ", ".join(ARRANGEMENT_LABELS.get(w, w).lower() for w in wanted)
    if job.work_arrangement in wanted:
        return Category(key="work_arrangement", score=100, summary=f"{label} — as you prefer",
                        reasons=[f"{label} matches your preference ({wanted_text})"], matched=[label])
    score = max(_ARRANGEMENT_PARTIAL.get((job.work_arrangement, w), 30) for w in wanted)
    return Category(key="work_arrangement", score=score, summary=f"{label} — you prefer {wanted_text}",
                    reasons=[f"This role is {label.lower()}; you prefer {wanted_text}"], missing=[label])


def score_employment_type(job: Job, bundle: ProfileBundle) -> Category:
    if not job.employment_type:
        return _not_applicable("employment_type", "Employment type not specified")
    wanted = bundle.preferences.job_types or []
    if not wanted:
        return _not_applicable("employment_type", "No job type preference set")
    label = EMPLOYMENT_LABELS.get(job.employment_type, job.employment_type)
    wanted_text = ", ".join(EMPLOYMENT_LABELS.get(w, w).lower() for w in wanted)
    if job.employment_type in wanted:
        return Category(key="employment_type", score=100, summary=f"{label}, as you prefer",
                        reasons=[f"{label} matches your preference ({wanted_text})"], matched=[label])
    return Category(key="employment_type", score=30, summary=f"{label} — you prefer {wanted_text}",
                    reasons=[f"This is a {label.lower()} role; you prefer {wanted_text}"], missing=[label])


def score_career(job: Job, bundle: ProfileBundle, signals: CareerSignals | None,
                 company: Company | None) -> Category:
    prefs, profile = bundle.preferences, bundle.profile
    roles = list(dict.fromkeys((prefs.target_roles or []) + (profile.desired_positions or [])))
    cat = Category(key="career")
    has_signal = False
    if roles:
        best_role, best = max(((r, title_alignment(job.title, r)) for r in roles), key=lambda x: x[1])
        has_signal = True
        if best >= 0.85:
            cat.score = 100
            cat.reasons.append(f"Title aligns with your target role \"{best_role}\"")
            cat.matched.append(best_role)
        elif best >= 0.55:
            cat.score = 60 + 40 * (best - 0.55) / 0.3
            cat.reasons.append(f"Title is related to your target role \"{best_role}\"")
        else:
            cat.score = 25
            cat.reasons.append(f"Title differs from your target roles ({_join(roles, 3)})")
    else:
        cat.score = 60
    preferred = {normalize_company(c) for c in prefs.preferred_companies or []}
    if preferred and normalize_company(job.company_name) in preferred:
        has_signal = True
        cat.score += 20
        cat.reasons.append(f"{job.company_name} is on your preferred companies list")
        cat.matched.append(job.company_name)
    if company and company.industry and prefs.industries and any(
            i.lower() in company.industry.lower() for i in prefs.industries):
        has_signal = True
        cat.score += 10
        cat.reasons.append(f"{company.industry} is one of your preferred industries")
    if signals:
        liked = [t for jid, t in signals.liked if jid != job.id and title_alignment(job.title, t) >= 0.85]
        disliked = [t for jid, t in signals.not_interested if jid != job.id and title_alignment(job.title, t) >= 0.85]
        if liked:
            has_signal = True
            cat.score += 10
            cat.reasons.append(f"Similar to {len(liked)} job{'s' if len(liked) != 1 else ''} you saved or applied to")
        if disliked:
            has_signal = True
            cat.score -= 25
            cat.reasons.append(f"You marked a similar role (\"{disliked[0]}\") as not interested")
    if not has_signal:
        return _not_applicable("career", "Add target roles to see how this fits your career goals")
    cat.score = max(0, min(100, cat.score))
    cat.summary = "Fits your career goals" if cat.score >= 75 else "Partly aligned with your goals" \
        if cat.score >= 50 else "Not closely aligned with your goals"
    return cat


def score_requirements(job: Job, req: dict, bundle: ProfileBundle) -> Category:
    cat = Category(key="requirements")
    checks = 0
    passed = 0
    certs = req.get("certifications") or []
    missing = set(missing_certifications(job, bundle))
    for cert in certs:
        checks += 1
        if cert in missing:
            cat.reasons.append(f"Requires {cert} — not in your profile")
            cat.missing.append(cert)
        else:
            passed += 1
            cat.reasons.append(f"You have {cert}")
            cat.matched.append(cert)
    auth_text = req.get("work_authorization")
    country = authorization_country(auth_text)
    if country:
        allowed = user_authorized_for(bundle, country)
        if allowed is not None:
            checks += 1
            if allowed and not authorization_problem(job, bundle):
                passed += 1
                cat.reasons.append(f"You're authorized to work in {country}")
                cat.matched.append(f"Work authorization ({country})")
            else:
                cat.reasons.append(authorization_problem(job, bundle) or f"Requires authorization to work in {country}")
                cat.missing.append(f"Work authorization ({country})")
        else:
            cat.reasons.append(f"Posting requires authorization to work in {country} — add your work authorization "
                               "to your profile")
    if not checks:
        if cat.reasons:
            cat.applicable = False
            cat.summary = "Confirm your work authorization"
            return cat
        return _not_applicable("requirements", "No certifications or work-authorization requirements listed")
    cat.score = 100 * passed / checks
    cat.summary = "Meets all hard requirements" if passed == checks else f"{checks - passed} hard requirement" \
        f"{'s' if checks - passed != 1 else ''} not met"
    return cat


# ---------------------------------------------------------------------------
# Overall score, tier and recommendation
# ---------------------------------------------------------------------------


def weights_for(prefs: UserPreference | None) -> dict[str, int]:
    """The user's scoring weights merged over the defaults (unknown keys ignored)."""
    stored = (prefs.scoring_weights if prefs else None) or {}
    out = dict(DEFAULT_WEIGHTS)
    for key, value in stored.items():
        if key in out and isinstance(value, int | float) and not isinstance(value, bool):
            out[key] = max(0, int(value))
    return out


def tier_for(overall: int, strong_threshold: int = 80) -> str:
    good_cut = min(GOOD_CUT, strong_threshold - 1)
    possible_cut = min(POSSIBLE_CUT, good_cut - 1)
    if overall >= strong_threshold:
        return "strong"
    if overall >= good_cut:
        return "good"
    if overall >= possible_cut:
        return "possible"
    return "weak"


def _concerns(job: Job, bundle: ProfileBundle, cats: dict[str, Category]) -> tuple[list[str], bool]:
    """Human-readable concerns and whether any of them is a blocker."""
    concerns: list[str] = []
    blocker = False
    if missing := missing_certifications(job, bundle):
        concerns.append(f"Requires {_join(missing)} certification, which isn't in your profile")
        blocker = True
    if problem := authorization_problem(job, bundle):
        concerns.append(problem)
        blocker = True
    exp = cats["experience"]
    req = job.requirements or {}
    if exp.applicable and exp.score < 60 and req.get("min_years_experience") is not None:
        concerns.append(f"Experience gap: {exp.summary.lower()}")
    sal = cats["salary"]
    if sal.applicable and sal.score < 75:
        concerns.append(f"Salary: {sal.summary.lower()}")
    loc = cats["location"]
    if loc.applicable and loc.score < 50:
        concerns.append(loc.reasons[0])
    if job.posted_at:
        age = (utcnow() - job.posted_at).days
        if age > quality_filters_for(bundle.preferences).max_age_days:
            concerns.append(f"Posted {age} days ago — it may already be filled")
    if signals := suspicious_signals(job):
        concerns.append(f"Possible scam: {'; '.join(signals)}")
        blocker = True
    return concerns, blocker


def _highlights(job: Job, cats: dict[str, Category]) -> str:
    """The strongest specific matches, e.g. "your Python, Django and PostgreSQL experience"."""
    skills = cats["skills"]
    parts: list[str] = []
    if skills.applicable and skills.matched:
        names = ["API" if s == "REST APIs" else s for s in skills.matched]
        parts.append(f"your {_join(list(dict.fromkeys(names)), 4)} experience")
    loc = cats["location"]
    if loc.applicable and loc.score == 100 and job.location:
        parts.append(f"it's {'remote' if job.work_arrangement == 'remote' else 'in ' + job.location}")
    edu = cats["education"]
    if edu.applicable and edu.score == 100 and not parts:
        parts.append("your education")
    return " and ".join(parts[:2])


def _recommendation(job: Job, overall: int, tier: str, should_apply: str, cats: dict[str, Category],
                    concerns: list[str]) -> str:
    highlights = _highlights(job, cats)
    skills = cats["skills"]
    required = set((job.requirements or {}).get("required_skills") or [])
    missing_required = [s for s in skills.missing if s in required][:2] if skills.applicable else []
    missing_nice = [s for s in skills.missing if s not in required][:2] if skills.applicable else []
    if missing_required:
        gap_text = f" Main gap{'s' if len(missing_required) > 1 else ''}: {_join(missing_required)}."
    elif missing_nice:
        gap_text = f" Could be stronger with {_join(missing_nice)}."
    else:
        gap_text = ""
    if should_apply == "apply":
        if highlights:
            return f"Recommended because it's a {tier} match for {highlights}.{gap_text}"
        return f"Recommended because of a {overall}% overall match.{gap_text}"
    if should_apply == "consider":
        reason = concerns[0] if concerns else (f"it fits {highlights}" if highlights else f"{overall}% overall match")
        why = f"{reason[0].lower()}{reason[1:]}" if concerns else reason
        return f"Worth considering: {why.rstrip('.')}.{gap_text}"
    reason = concerns[0] if concerns else skills.summary if skills.applicable else "low overall match"
    return f"Probably not a fit: {reason[0].lower()}{reason[1:].rstrip('.')}."


def score_job(job: Job, bundle: ProfileBundle, signals: CareerSignals | None = None) -> dict[str, Any]:
    """Score ``job`` against the user's profile. Returns JobMatch field values."""
    req = job.requirements or {}
    cats = {
        "skills": score_skills(req, bundle),
        "experience": score_experience(job, req, bundle),
        "education": score_education(req, bundle),
        "location": score_location(job, bundle),
        "salary": score_salary(job, bundle),
        "work_arrangement": score_work_arrangement(job, bundle),
        "employment_type": score_employment_type(job, bundle),
        "career": score_career(job, bundle, signals, job.company),
        "requirements": score_requirements(job, req, bundle),
    }
    weights = weights_for(bundle.preferences)
    applicable = [(c, weights[k]) for k, c in cats.items() if c.applicable and weights[k] > 0]
    total_weight = sum(w for _, w in applicable)
    overall = round(sum(c.score * w for c, w in applicable) / total_weight) if total_weight else 0
    overall = max(0, min(100, overall))

    concerns, blocker = _concerns(job, bundle, cats)
    if blocker and overall > BLOCKER_CAP:
        concerns.append(f"Overall score capped at {BLOCKER_CAP} because a hard requirement isn't met")
        overall = BLOCKER_CAP
    threshold = agent_settings_for(bundle.preferences).strong_match_threshold
    tier = tier_for(overall, threshold)
    if blocker or tier == "weak":
        should_apply = "skip"
    elif tier in ("strong", "good") and not any(c.startswith(("Experience gap", "Salary")) for c in concerns):
        should_apply = "apply"
    else:
        should_apply = "consider"

    skills = cats["skills"]
    required = list(req.get("required_skills") or []) or list(req.get("technologies") or [])
    missing_required = [s for s in skills.missing if s in required] + cats["requirements"].missing
    missing_preferred = [s for s in skills.missing if s not in required]
    return {
        "overall": overall,
        "tier": tier,
        "breakdown": [cats[k].as_dict(weights[k]) for k in DEFAULT_WEIGHTS],
        "missing_required": missing_required,
        "missing_preferred": missing_preferred,
        "recommendation": _recommendation(job, overall, tier, should_apply, cats, concerns),
        "should_apply": should_apply,
        "concerns": concerns,
        "weights": weights,
    }


def upsert_match(db: Session, job: Job, bundle: ProfileBundle, signals: CareerSignals | None = None) -> JobMatch:
    """Create or refresh the stored match for ``job``. Caller commits."""
    data = score_job(job, bundle, signals)
    match = job.match or db.scalar(select(JobMatch).where(JobMatch.job_id == job.id))
    if match is None:
        match = JobMatch(user_id=job.user_id, job_id=job.id)
        db.add(match)
        job.match = match
    for key, value in data.items():
        setattr(match, key, value)
    match.profile_hash = bundle.fingerprint()
    match.updated_at = utcnow()
    return match


def recompute_all(db: Session, user: User) -> int:
    """Re-apply quality filters and re-score every job of ``user``. Returns the number of jobs updated.

    Call after profile, preference or weight changes. Caller commits.
    """
    bundle = load_bundle(db, user)
    signals = load_signals(db, user.id)
    qf = quality_filters_for(bundle.preferences)
    jobs = db.scalars(select(Job).where(Job.user_id == user.id).options(
        selectinload(Job.match), selectinload(Job.company))).all()
    for job in jobs:
        apply_quality(job, bundle, qf)
        upsert_match(db, job, bundle, signals)
    db.flush()
    return len(jobs)
