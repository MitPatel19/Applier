"""Build structured resume content (``schemas.resume.ResumeContent``) from the user's profile.

Only facts from the ``ProfileBundle`` are used. Item ids are stable (``exp-<id>``,
``exp-<id>-b<n>``, ``proj-<id>``, ``edu-<id>``) so tailoring changes can reference them.
"""

from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

from app.schemas.resume import (
    ResumeBullet,
    ResumeContact,
    ResumeContent,
    ResumeEducationItem,
    ResumeExperienceItem,
    ResumeLink,
    ResumeProjectItem,
    ResumeSkillGroup,
)
from app.services import taxonomy
from app.services.profile_bundle import ProfileBundle

# Default display priority of skill categories (lower first). Soft skills and "other" always trail.
CATEGORY_PRIORITY = ["programming", "frameworks", "databases", "cloud", "devops", "tools", "other", "soft"]
_SUPPORT_ROLE_WORDS = ("support", "help desk", "helpdesk", "technician", "service desk", "it specialist")


def display_date(value: date | None) -> str | None:
    return value.strftime("%b %Y") if value else None


def location_line(city: str | None, province: str | None, country: str | None = None) -> str | None:
    parts = [p for p in (city, province) if p] or [p for p in (country,) if p]
    return ", ".join(parts) or None


def build_contact(bundle: ProfileBundle) -> ResumeContact:
    p = bundle.profile
    links = [ResumeLink(label=label, url=url) for label, url in (
        ("LinkedIn", p.linkedin_url), ("GitHub", p.github_url), ("Portfolio", p.portfolio_url),
        ("Website", p.website_url)) if url]
    return ResumeContact(name=bundle.user.full_name, email=bundle.user.email, phone=p.phone,
                         location=location_line(p.city, p.province, p.country), links=links)


def _category_order(bundle: ProfileBundle, target_role: str | None) -> list[str]:
    """Categories ordered by how much the user actually uses them (tie-break: default priority)."""
    usage: Counter[str] = Counter()
    tech_lists = [e.technologies for e in bundle.experiences] + [p.technologies for p in bundle.projects]
    for tech in (t for techs in tech_lists for t in techs or []):
        usage[taxonomy.category_of(tech)] += 1
    priority = list(CATEGORY_PRIORITY)
    if target_role and any(w in target_role.lower() for w in _SUPPORT_ROLE_WORDS):
        priority.remove("tools")
        priority.insert(0, "tools")

    def key(cat: str) -> tuple[int, int, int]:
        trailing = cat in ("soft", "other")
        return (int(trailing), -usage[cat], priority.index(cat) if cat in priority else len(priority))

    return sorted(set(CATEGORY_PRIORITY), key=key)


def build_skill_groups(bundle: ProfileBundle, target_role: str | None = None) -> list[ResumeSkillGroup]:
    grouped: dict[str, list[str]] = {}
    seen: set[str] = set()
    for skill in sorted(bundle.skills, key=lambda s: (-(s.years or 0), s.name.lower())):
        name = taxonomy.canonicalize(skill.name)
        category = skill.category or taxonomy.category_of(name)
        if category == "certifications" or name.lower() in seen:
            continue
        seen.add(name.lower())
        grouped.setdefault(category if category in CATEGORY_PRIORITY else "other", []).append(name)
    return [ResumeSkillGroup(category=taxonomy.CATEGORY_LABELS.get(cat, cat.title()), items=grouped[cat])
            for cat in _category_order(bundle, target_role) if grouped.get(cat)]


def _bullets(prefix: str, *lists: list[str] | None) -> list[ResumeBullet]:
    texts = [t.strip() for items in lists for t in (items or []) if t and t.strip()]
    return [ResumeBullet(id=f"{prefix}-b{i}", text=t) for i, t in enumerate(texts, start=1)]


def build_experience(bundle: ProfileBundle) -> list[ResumeExperienceItem]:
    return [
        ResumeExperienceItem(
            id=f"exp-{e.id}", source_id=e.id, company=e.company, position=e.position, location=e.location,
            start=display_date(e.start_date), end=display_date(e.end_date) or "Present",
            bullets=_bullets(f"exp-{e.id}", e.responsibilities, e.achievements, e.metrics),
            technologies=list(e.technologies or []),
        )
        for e in bundle.experiences
    ]


def build_projects(bundle: ProfileBundle) -> list[ResumeProjectItem]:
    return [
        ResumeProjectItem(
            id=f"proj-{p.id}", source_id=p.id, name=p.name, description=p.description,
            technologies=list(p.technologies or []),
            bullets=_bullets(f"proj-{p.id}", p.responsibilities, p.results),
            url=p.github_url or p.demo_url,
        )
        for p in bundle.projects
    ]


def build_education(bundle: ProfileBundle) -> list[ResumeEducationItem]:
    return [
        ResumeEducationItem(
            id=f"edu-{ed.id}", institution=ed.institution, degree=ed.degree, program=ed.program,
            start=display_date(ed.start_date), end=display_date(ed.end_date), gpa=ed.gpa, location=ed.location,
            details=[f"Relevant coursework: {', '.join(ed.coursework)}"] if ed.coursework else [],
        )
        for ed in bundle.educations
    ]


def build_from_profile(bundle: ProfileBundle, target_role: str | None = None) -> dict[str, Any]:
    """Return a ResumeContent dict built purely from the user's profile facts."""
    p = bundle.profile
    headline = p.headline or target_role or next(iter(p.desired_positions or []), None)
    certifications = sorted({s.name for s in bundle.skills if s.category == "certifications"})
    content = ResumeContent(
        contact=build_contact(bundle),
        headline=headline,
        summary=p.summary,
        skills=build_skill_groups(bundle, target_role),
        experience=build_experience(bundle),
        projects=build_projects(bundle),
        education=build_education(bundle),
        certifications=certifications,
    )
    return content.model_dump()
