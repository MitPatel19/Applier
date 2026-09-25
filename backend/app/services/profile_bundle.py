"""Load everything the agent knows about the user into one immutable-ish structure.

``ProfileBundle`` is the single source of *facts* used by matching, resume tailoring,
cover letters and application answers. Nothing outside this bundle may be claimed about
the user — that is how the "never invent experience" rule is enforced.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Education, Experience, Project, Skill, User, UserPreference, UserProfile
from app.services import taxonomy


@dataclass
class ProfileBundle:
    user: User
    profile: UserProfile
    preferences: UserPreference
    educations: list[Education] = field(default_factory=list)
    experiences: list[Experience] = field(default_factory=list)
    skills: list[Skill] = field(default_factory=list)
    projects: list[Project] = field(default_factory=list)

    # ---- derived facts -------------------------------------------------
    @property
    def skill_names(self) -> set[str]:
        """Canonical skills the user explicitly has (skills list + technologies used in jobs/projects)."""
        names = {s.name for s in self.skills}
        for e in self.experiences:
            names.update(e.technologies or [])
        for p in self.projects:
            names.update(p.technologies or [])
        return taxonomy.normalize_set(names)

    @property
    def skill_names_with_implied(self) -> set[str]:
        return taxonomy.expand_with_implied(self.skill_names)

    @property
    def certifications(self) -> set[str]:
        return {taxonomy.canonicalize(s.name) for s in self.skills if s.category == "certifications"}

    def total_years_experience(self) -> float:
        if self.profile.years_experience is not None:
            return float(self.profile.years_experience)
        months = 0
        today = date.today()
        for e in self.experiences:
            if e.start_date:
                end = e.end_date or today
                months += max(0, (end.year - e.start_date.year) * 12 + end.month - e.start_date.month)
        return round(months / 12, 1)

    def years_with_skill(self, skill: str) -> float | None:
        """Best-effort years of experience with ``skill`` based on roles listing that technology."""
        canonical = taxonomy.canonicalize(skill)
        for s in self.skills:
            if taxonomy.canonicalize(s.name) == canonical and s.years is not None:
                return float(s.years)
        months = 0
        today = date.today()
        for e in self.experiences:
            if canonical in taxonomy.normalize_set(e.technologies or []) and e.start_date:
                end = e.end_date or today
                months += max(0, (end.year - e.start_date.year) * 12 + end.month - e.start_date.month)
        return round(months / 12, 1) if months else None

    def highest_education(self) -> Education | None:
        order = ["phd", "doctor", "master", "bachelor", "degree", "diploma", "associate", "certificate"]

        def rank(ed: Education) -> int:
            d = (ed.degree or "").lower()
            for i, k in enumerate(order):
                if k in d:
                    return i
            return len(order)

        return min(self.educations, key=rank) if self.educations else None

    def fingerprint(self) -> str:
        """Hash of the facts that influence matching, used to detect stale match scores."""
        data = {
            "skills": sorted(self.skill_names),
            "exp": [(e.position, e.company, str(e.start_date), str(e.end_date)) for e in self.experiences],
            "edu": [(e.degree, e.program) for e in self.educations],
            "loc": [self.profile.city, self.profile.province, self.profile.country],
            "prefs": [self.preferences.target_locations, self.preferences.target_roles, self.preferences.salary_min,
                      self.preferences.work_arrangements, self.preferences.job_types,
                      self.preferences.experience_levels, self.preferences.scoring_weights],
        }
        return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def ensure_profile_rows(db: Session, user: User) -> tuple[UserProfile, UserPreference]:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if profile is None:
        profile = UserProfile(user_id=user.id, desired_positions=[], preferred_arrangements=[], authorized_countries=[])
        db.add(profile)
    prefs = db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if prefs is None:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
    if profile.id is None or prefs.id is None:
        db.flush()
    return profile, prefs


def load_bundle(db: Session, user: User) -> ProfileBundle:
    profile, prefs = ensure_profile_rows(db, user)
    uid = user.id
    return ProfileBundle(
        user=user,
        profile=profile,
        preferences=prefs,
        educations=list(db.scalars(select(Education).where(Education.user_id == uid).order_by(Education.sort_order,
                                                                                                Education.end_date.desc()))),
        experiences=list(db.scalars(select(Experience).where(Experience.user_id == uid).order_by(
            Experience.sort_order, Experience.start_date.desc()))),
        skills=list(db.scalars(select(Skill).where(Skill.user_id == uid))),
        projects=list(db.scalars(select(Project).where(Project.user_id == uid).order_by(Project.sort_order))),
    )
