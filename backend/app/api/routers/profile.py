"""Profile: personal & professional details, education, experience, skills, projects, preferences, import."""

from __future__ import annotations

import logging
from typing import Any, TypeVar

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.core.errors import Conflict
from app.db import Base
from app.models import Education, Experience, Project, Resume, Skill, User, UserPreference
from app.schemas.auth import UserOut
from app.schemas.profile import (
    AgentSettings,
    CompletenessItem,
    EducationIn,
    EducationOut,
    ExperienceIn,
    ExperienceOut,
    FullProfileOut,
    NotificationSettings,
    ParsedResume,
    PreferencesIn,
    PreferencesOut,
    ProfileCompleteness,
    ProfileImportIn,
    ProfileIn,
    ProfileOut,
    ProjectIn,
    ProjectOut,
    QualityFilters,
    SkillBulkIn,
    SkillIn,
    SkillOut,
    UISettings,
)
from app.services import audit, taxonomy
from app.services.profile_bundle import ProfileBundle, ensure_profile_rows, load_bundle

router = APIRouter(prefix="/profile", tags=["profile"])
log = logging.getLogger("applier.profile")

M = TypeVar("M", bound=BaseModel)
Row = TypeVar("Row", bound=Base)

FALLBACK_WEIGHTS: dict[str, int] = {"skills": 30, "experience": 15, "education": 10, "location": 10, "salary": 10,
                                    "work_arrangement": 8, "employment_type": 5, "career": 7, "requirements": 5}
SEARCH_FIELDS = {"target_locations", "job_types", "work_arrangements", "experience_levels", "target_roles",
                 "salary_min", "salary_max", "salary_period", "currency", "industries", "preferred_companies",
                 "avoid_companies", "technologies", "required_certifications_available", "quality_filters"}
PERSONAL_FIELDS = ("phone", "city", "province", "country", "linkedin_url", "github_url", "portfolio_url", "headline",
                   "summary")
MIN_SKILLS = 8


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _recompute_matches(db: Session, user: User) -> None:
    try:
        from app.services import matching

        matching.recompute_all(db, user)
    except (ImportError, AttributeError):
        return


def default_weights() -> dict[str, int]:
    try:
        from app.services import matching

        return dict(matching.DEFAULT_WEIGHTS)
    except (ImportError, AttributeError):
        return dict(FALLBACK_WEIGHTS)


def _model_or_default(model: type[M], data: dict[str, Any] | None) -> M:
    try:
        return model.model_validate(data or {})
    except ValidationError:
        return model()


def completeness(db: Session, bundle: ProfileBundle) -> ProfileCompleteness:
    p, prefs = bundle.profile, bundle.preferences
    has_default_resume = db.scalar(select(Resume.id).where(Resume.user_id == bundle.user.id,
                                                          Resume.is_default.is_(True))) is not None
    checks = [
        ("contact", "Contact info (phone and city)", bool(p.phone and p.city), 10),
        ("headline", "Professional headline", bool(p.headline), 5),
        ("summary", "Summary", bool(p.summary), 10),
        ("experience", "At least one work experience", bool(bundle.experiences), 20),
        ("education", "Education", bool(bundle.educations), 10),
        ("skills", f"At least {MIN_SKILLS} skills", len(bundle.skills) >= MIN_SKILLS, 15),
        ("projects", "Projects", bool(bundle.projects), 10),
        ("links", "LinkedIn, GitHub or portfolio link", bool(p.linkedin_url or p.github_url or p.portfolio_url), 5),
        ("work_authorization", "Work authorization", bool(p.work_authorization or p.authorized_countries), 5),
        ("job_preferences", "Job preferences", bool((prefs.target_roles or p.desired_positions)
                                                    and (prefs.target_locations or prefs.work_arrangements)), 5),
        ("resume", "A default resume", has_default_resume, 5),
    ]
    items = [CompletenessItem(key=k, label=label, done=done, weight=w) for k, label, done, w in checks]
    total = sum(i.weight for i in items)
    return ProfileCompleteness(percent=round(100 * sum(i.weight for i in items if i.done) / total), items=items)


def full_profile(db: Session, user: User) -> FullProfileOut:
    bundle = load_bundle(db, user)
    return FullProfileOut(
        user=UserOut.model_validate(user),
        profile=ProfileOut.model_validate(bundle.profile),
        educations=[EducationOut.model_validate(e) for e in bundle.educations],
        experiences=[ExperienceOut.model_validate(e) for e in bundle.experiences],
        skills=[SkillOut.model_validate(s) for s in sorted(bundle.skills, key=lambda s: (s.category, s.name.lower()))],
        projects=[ProjectOut.model_validate(p) for p in bundle.projects],
        completeness=completeness(db, bundle),
    )


def _create(db: Session, user: User, model: type[Row], data: BaseModel, what: str) -> Row:
    row = model(user_id=user.id, **data.model_dump())
    db.add(row)
    db.flush()
    audit.record(db, user.id, f"profile.{what}_added", f"Added {what} to your profile", entity_type=what,
                 entity_id=row.id)
    db.commit()
    return row


def _update(db: Session, user: User, row: Row, data: BaseModel, what: str) -> Row:
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    audit.record(db, user.id, f"profile.{what}_updated", f"Updated {what} in your profile", entity_type=what,
                 entity_id=row.id)
    db.commit()
    return row


def _delete(db: Session, user: User, row: Row, what: str) -> Response:
    audit.record(db, user.id, f"profile.{what}_removed", f"Removed {what} from your profile", entity_type=what,
                 entity_id=row.id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@router.get("", response_model=FullProfileOut)
def get_profile(user: CurrentUser, db: DB) -> FullProfileOut:
    result = full_profile(db, user)
    db.commit()  # persists profile/preference rows created on first access
    return result


@router.patch("", response_model=ProfileOut)
def update_profile(payload: ProfileIn, user: CurrentUser, db: DB) -> ProfileOut:
    profile, _ = ensure_profile_rows(db, user)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(profile, key, value)
    audit.record(db, user.id, "profile.updated", "Updated your profile details", entity_type="profile",
                 entity_id=profile.id, details={"fields": sorted(changes)})
    db.commit()
    return ProfileOut.model_validate(profile)


# ---------------------------------------------------------------------------
# Education / experience / projects
# ---------------------------------------------------------------------------


@router.post("/educations", response_model=EducationOut, status_code=201)
def add_education(payload: EducationIn, user: CurrentUser, db: DB) -> Education:
    return _create(db, user, Education, payload, "education")


@router.patch("/educations/{item_id}", response_model=EducationOut)
def update_education(item_id: int, payload: EducationIn, user: CurrentUser, db: DB) -> Education:
    return _update(db, user, get_owned(db, Education, item_id, user, "education"), payload, "education")


@router.delete("/educations/{item_id}", status_code=204)
def delete_education(item_id: int, user: CurrentUser, db: DB) -> Response:
    return _delete(db, user, get_owned(db, Education, item_id, user, "education"), "education")


@router.post("/experiences", response_model=ExperienceOut, status_code=201)
def add_experience(payload: ExperienceIn, user: CurrentUser, db: DB) -> Experience:
    return _create(db, user, Experience, payload, "experience")


@router.patch("/experiences/{item_id}", response_model=ExperienceOut)
def update_experience(item_id: int, payload: ExperienceIn, user: CurrentUser, db: DB) -> Experience:
    return _update(db, user, get_owned(db, Experience, item_id, user, "experience"), payload, "experience")


@router.delete("/experiences/{item_id}", status_code=204)
def delete_experience(item_id: int, user: CurrentUser, db: DB) -> Response:
    return _delete(db, user, get_owned(db, Experience, item_id, user, "experience"), "experience")


@router.post("/projects", response_model=ProjectOut, status_code=201)
def add_project(payload: ProjectIn, user: CurrentUser, db: DB) -> Project:
    return _create(db, user, Project, payload, "project")


@router.patch("/projects/{item_id}", response_model=ProjectOut)
def update_project(item_id: int, payload: ProjectIn, user: CurrentUser, db: DB) -> Project:
    return _update(db, user, get_owned(db, Project, item_id, user, "project"), payload, "project")


@router.delete("/projects/{item_id}", status_code=204)
def delete_project(item_id: int, user: CurrentUser, db: DB) -> Response:
    return _delete(db, user, get_owned(db, Project, item_id, user, "project"), "project")


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------


def _skill_values(payload: SkillIn) -> dict[str, Any]:
    category = payload.category or taxonomy.category_of(payload.name)
    # Credentials keep their exact name ("AWS Cloud Practitioner"); other skills use the canonical spelling.
    name = payload.name.strip() if category == "certifications" else taxonomy.canonicalize(payload.name)
    return {"name": name, "category": category, "level": payload.level, "years": payload.years}


def _skill_key(name: str, category: str | None) -> str:
    return (name.strip() if category == "certifications" else taxonomy.canonicalize(name)).lower()


def _existing_skill_keys(db: Session, user: User, exclude_id: int | None = None) -> set[str]:
    query = select(Skill.name, Skill.category).where(Skill.user_id == user.id)
    if exclude_id is not None:
        query = query.where(Skill.id != exclude_id)
    return {_skill_key(name, category) for name, category in db.execute(query)}


@router.post("/skills", response_model=SkillOut, status_code=201)
def add_skill(payload: SkillIn, user: CurrentUser, db: DB) -> Skill:
    values = _skill_values(payload)
    if _skill_key(values["name"], values["category"]) in _existing_skill_keys(db, user):
        raise Conflict(f"{values['name']} is already in your skills.")
    skill = Skill(user_id=user.id, **values)
    db.add(skill)
    db.flush()
    audit.record(db, user.id, "profile.skill_added", f"Added {skill.name} to your skills", entity_type="skill",
                 entity_id=skill.id)
    db.commit()
    return skill


@router.post("/skills/bulk", response_model=list[SkillOut], status_code=201)
def add_skills_bulk(payload: SkillBulkIn, user: CurrentUser, db: DB) -> list[Skill]:
    existing = _existing_skill_keys(db, user)
    added: list[Skill] = []
    for item in payload.skills:
        values = _skill_values(item)
        key = _skill_key(values["name"], values["category"])
        if key in existing:
            continue
        existing.add(key)
        skill = Skill(user_id=user.id, **values)
        db.add(skill)
        added.append(skill)
    if added:
        audit.record(db, user.id, "profile.skills_added", f"Added {len(added)} skills to your profile",
                     entity_type="skill", details={"skills": [s.name for s in added]})
    db.commit()
    return added


@router.patch("/skills/{item_id}", response_model=SkillOut)
def update_skill(item_id: int, payload: SkillIn, user: CurrentUser, db: DB) -> Skill:
    skill = get_owned(db, Skill, item_id, user, "skill")
    values = _skill_values(payload)
    if _skill_key(values["name"], values["category"]) in _existing_skill_keys(db, user, exclude_id=skill.id):
        raise Conflict(f"{values['name']} is already in your skills.")
    for key, value in values.items():
        setattr(skill, key, value)
    audit.record(db, user.id, "profile.skill_updated", f"Updated {skill.name} in your skills", entity_type="skill",
                 entity_id=skill.id)
    db.commit()
    return skill


@router.delete("/skills/{item_id}", status_code=204)
def delete_skill(item_id: int, user: CurrentUser, db: DB) -> Response:
    return _delete(db, user, get_owned(db, Skill, item_id, user, "skill"), "skill")


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------


def preferences_out(prefs: UserPreference) -> PreferencesOut:
    agent = {k: v for k, v in (prefs.agent_settings or {}).items() if k != "auto_submit"}
    return PreferencesOut(
        target_locations=prefs.target_locations or [], job_types=prefs.job_types or [],
        work_arrangements=prefs.work_arrangements or [], experience_levels=prefs.experience_levels or [],
        target_roles=prefs.target_roles or [], salary_min=prefs.salary_min, salary_max=prefs.salary_max,
        salary_period=prefs.salary_period or "yearly", currency=prefs.currency or "CAD",
        industries=prefs.industries or [], preferred_companies=prefs.preferred_companies or [],
        avoid_companies=prefs.avoid_companies or [], technologies=prefs.technologies or [],
        required_certifications_available=prefs.required_certifications_available or [],
        scoring_weights={**default_weights(), **(prefs.scoring_weights or {})},
        quality_filters=_model_or_default(QualityFilters, prefs.quality_filters),
        agent_settings=_model_or_default(AgentSettings, agent),
        notification_settings=_model_or_default(NotificationSettings, prefs.notification_settings),
        ui_settings=_model_or_default(UISettings, prefs.ui_settings),
    )


@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(user: CurrentUser, db: DB) -> PreferencesOut:
    _, prefs = ensure_profile_rows(db, user)
    db.commit()
    return preferences_out(prefs)


@router.patch("/preferences", response_model=PreferencesOut)
def update_preferences(payload: PreferencesIn, user: CurrentUser, db: DB) -> PreferencesOut:
    _, prefs = ensure_profile_rows(db, user)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key in ("quality_filters", "notification_settings", "ui_settings"):
            value = {**(getattr(prefs, key) or {}), **(value or {})}
        setattr(prefs, key, value)
    audit.record(db, user.id, "preferences.updated", "Updated your job search preferences",
                 entity_type="preferences", entity_id=prefs.id, details={"fields": sorted(changes)})
    db.flush()
    if SEARCH_FIELDS & changes.keys():
        _recompute_matches(db, user)
    db.commit()
    return preferences_out(prefs)


# ---------------------------------------------------------------------------
# Import a reviewed parsed resume
# ---------------------------------------------------------------------------


def _norm(text: str | None) -> str:
    return "".join(ch for ch in (text or "").lower() if ch.isalnum())


def _import_personal(user: User, bundle: ProfileBundle, parsed: ParsedResume, overwrite: bool) -> list[str]:
    updated: list[str] = []
    for field in PERSONAL_FIELDS:
        value = getattr(parsed, field)
        if value and (overwrite or not getattr(bundle.profile, field)):
            setattr(bundle.profile, field, value)
            updated.append(field)
    if parsed.full_name and (overwrite or not user.full_name.strip()):
        user.full_name = parsed.full_name
        updated.append("full_name")
    return updated


def _import_rows(db: Session, user: User, bundle: ProfileBundle, parsed: ParsedResume) -> dict[str, int]:
    exp_keys = {(_norm(e.company), _norm(e.position)) for e in bundle.experiences}
    edu_keys = {(_norm(e.institution), _norm(e.degree)) for e in bundle.educations}
    project_keys = {_norm(p.name) for p in bundle.projects}
    skill_keys = {_skill_key(s.name, s.category) for s in bundle.skills}
    counts = {"experiences": 0, "educations": 0, "projects": 0, "skills": 0}
    for exp in parsed.experiences:
        key = (_norm(exp.company), _norm(exp.position))
        if key not in exp_keys:
            exp_keys.add(key)
            db.add(Experience(user_id=user.id, **exp.model_dump()))
            counts["experiences"] += 1
    for edu in parsed.educations:
        key = (_norm(edu.institution), _norm(edu.degree))
        if key not in edu_keys:
            edu_keys.add(key)
            db.add(Education(user_id=user.id, **edu.model_dump()))
            counts["educations"] += 1
    for project in parsed.projects:
        if _norm(project.name) not in project_keys:
            project_keys.add(_norm(project.name))
            db.add(Project(user_id=user.id, **project.model_dump()))
            counts["projects"] += 1
    for skill in parsed.skills:
        values = _skill_values(skill)
        skill_key = _skill_key(values["name"], values["category"])
        if skill_key not in skill_keys:
            skill_keys.add(skill_key)
            db.add(Skill(user_id=user.id, **values))
            counts["skills"] += 1
    return counts


@router.post("/import", response_model=FullProfileOut)
def import_resume(payload: ProfileImportIn, user: CurrentUser, db: DB) -> FullProfileOut:
    bundle = load_bundle(db, user)
    personal = _import_personal(user, bundle, payload.parsed, payload.overwrite_personal)
    counts = _import_rows(db, user, bundle, payload.parsed)
    added = ", ".join(f"{n} {k}" for k, n in counts.items() if n) or "no new entries"
    audit.record(db, user.id, "profile.imported", f"Imported your resume into your profile ({added})",
                 entity_type="profile", entity_id=bundle.profile.id,
                 details={"personal_fields": personal, **counts})
    db.flush()
    _recompute_matches(db, user)
    db.commit()
    return full_profile(db, user)
