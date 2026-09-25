"""Typed access to the JSON settings stored on ``UserPreference`` plus shared search helpers.

``UserPreference`` stores quality filters, agent settings and scoring weights as JSON blobs;
these helpers merge them with defaults and validate them so every caller sees the same view.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import UserPreference, UserProfile
from app.schemas.jobs import SearchFilters
from app.schemas.profile import AgentSettings, QualityFilters
from app.services.location import parse_location

if TYPE_CHECKING:
    from app.services.profile_bundle import ProfileBundle

HOURS_PER_YEAR = 2080
SCHEDULE_INTERVAL_HOURS = {"daily": 24, "several_daily": 6}


def quality_filters_for(prefs: UserPreference | None) -> QualityFilters:
    stored = dict((prefs.quality_filters if prefs else None) or {})
    defaults = QualityFilters()
    stored["hide"] = {**defaults.hide, **(stored.get("hide") or {})}
    stored["flag"] = {**defaults.flag, **(stored.get("flag") or {})}
    try:
        return QualityFilters(**stored)
    except ValueError:
        return defaults


def agent_settings_for(prefs: UserPreference | None) -> AgentSettings:
    stored = {k: v for k, v in ((prefs.agent_settings if prefs else None) or {}).items() if k != "auto_submit"}
    try:
        return AgentSettings(**stored)
    except ValueError:
        return AgentSettings()


def yearly(amount: int | float | None, period: str | None) -> float | None:
    """Convert a salary amount to a yearly figure (hourly x 2080)."""
    if amount is None:
        return None
    return float(amount) * HOURS_PER_YEAR if period == "hourly" else float(amount)


def target_regions(prefs: UserPreference, profile: UserProfile | None) -> tuple[list[str], list[str]]:
    """Split the user's location preferences into (physical targets, remote regions).

    "Remote Canada"-style entries become remote regions. When the user is open to remote work
    (or has no arrangement preference), remote roles in the country of their targets count too.
    """
    targets: list[str] = []
    remote: list[str] = []
    for loc in prefs.target_locations or []:
        parsed = parse_location(loc)
        if parsed.is_remote:
            remote.append(parsed.region or "Anywhere")
        elif loc.strip():
            targets.append(loc)
    if not targets and profile is not None and (profile.city or profile.province):
        targets.append(", ".join(p for p in (profile.city, profile.province) if p))
    arrangements = prefs.work_arrangements or (profile.preferred_arrangements if profile else None) or []
    if not remote and (not arrangements or "remote" in arrangements):
        countries = {parse_location(t).country for t in targets} - {None}
        if not countries and profile is not None and profile.country:
            countries = {parse_location(profile.country).country or profile.country}
        remote.extend(sorted(countries))  # type: ignore[arg-type]
    return targets, remote


def preference_filters(bundle: ProfileBundle) -> SearchFilters:
    """Search filters built from the user's saved job preferences (used by scheduled agent runs)."""
    prefs, profile = bundle.preferences, bundle.profile
    targets, remote = target_regions(prefs, profile)
    quality = quality_filters_for(prefs)
    roles = list(dict.fromkeys((prefs.target_roles or []) + (profile.desired_positions or [])))
    return SearchFilters(
        roles=roles[:10],
        keywords=(prefs.technologies or [])[:15],
        locations=targets,
        remote_regions=remote,
        work_arrangements=[a for a in prefs.work_arrangements or [] if a in ("onsite", "hybrid", "remote")],
        job_types=[t for t in prefs.job_types or []
                   if t in ("full_time", "part_time", "contract", "internship", "co_op", "temporary")],
        experience_levels=[e for e in prefs.experience_levels or []
                           if e in ("entry", "junior", "intermediate", "senior", "lead")],
        salary_min=prefs.salary_min,
        salary_period="hourly" if prefs.salary_period == "hourly" else "yearly",
        posted_within_days=quality.max_age_days,
        exclude_companies=prefs.avoid_companies or [],
        industries=prefs.industries or [],
    )
