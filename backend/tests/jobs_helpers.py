"""Test helpers for job discovery, matching and agent tests."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import Education, Experience, Job, Skill, User, utcnow
from app.services.dedup import dedup_key, normalize_title
from app.services.jd_extract import extract_requirements
from app.services.profile_bundle import ProfileBundle, ensure_profile_rows, load_bundle

JUNIOR_PYTHON_JD = """About us
Borealis Software builds route-planning software for regional carriers.

What you'll do
- Build REST APIs with Python and Django REST Framework
- Write unit tests with pytest
- Work with the team on code reviews

Requirements
- 1-2 years of experience in software development
- Diploma or degree in Computer Science or a related field
- Strong Python and SQL skills
- Experience with PostgreSQL and Git
- Experience with REST APIs
- Legally eligible to work in Canada

Nice to have
- Docker
- AWS

Benefits
- Health and dental benefits
- RRSP matching

How to apply
- Are you legally eligible to work in Canada?
"""


def make_user(db: Session, email: str = "tester@example.com") -> User:
    user = User(email=email, password_hash="x", full_name="Mit Patel", onboarding_completed=True)
    db.add(user)
    db.flush()
    return user


def make_profile(db: Session, user: User, **pref_overrides: Any) -> ProfileBundle:
    """A junior Python developer in Thunder Bay, authorized to work in Canada (updates existing profile rows)."""
    profile, preferences = ensure_profile_rows(db, user)
    for key, value in dict(city="Thunder Bay", province="ON", country="Canada", years_experience=2.5,
                           desired_positions=["Python Developer"], salary_period="yearly", currency="CAD",
                           authorized_countries=["Canada"], requires_sponsorship=False,
                           preferred_arrangements=[]).items():
        setattr(profile, key, value)
    prefs = dict(target_locations=["Thunder Bay, ON"], job_types=["full_time"],
                 work_arrangements=["onsite", "hybrid", "remote"],
                 experience_levels=["entry", "junior", "intermediate"],
                 target_roles=["Junior Software Developer", "Python Developer"], salary_min=55000,
                 salary_period="yearly", currency="CAD", industries=[], preferred_companies=[], avoid_companies=[],
                 technologies=["Python", "Django"], required_certifications_available=[], scoring_weights={},
                 quality_filters={}, agent_settings={}, notification_settings={}, ui_settings={})
    prefs.update(pref_overrides)
    for key, value in prefs.items():
        setattr(preferences, key, value)
    for name, category in [("Python", "programming"), ("Django REST Framework", "frameworks"),
                           ("PostgreSQL", "databases"), ("SQL", "programming"), ("Git", "tools"),
                           ("JavaScript", "programming"), ("React", "frameworks"), ("Docker", "devops"),
                           ("Communication", "soft")]:
        db.add(Skill(user_id=user.id, name=name, category=category))
    db.add(Education(user_id=user.id, institution="Northern Shield College", degree="Diploma",
                     program="Computer Programming", coursework=[]))
    db.add(Experience(user_id=user.id, company="Pine Ridge Web Co.", position="Junior Python Developer",
                      start_date=date(2023, 1, 1), end_date=date(2025, 6, 30), responsibilities=[], achievements=[],
                      technologies=["Python", "Django", "PostgreSQL"], metrics=[]))
    db.flush()
    return load_bundle(db, user)


def make_job(db: Session, user: User, *, title: str = "Junior Python Developer", company: str = "Borealis Software",
             description: str = JUNIOR_PYTHON_JD, location: str = "Thunder Bay, ON", **fields: Any) -> Job:
    values: dict[str, Any] = dict(
        city="Thunder Bay", province="ON", country="Canada", work_arrangement="hybrid", employment_type="full_time",
        experience_level="junior", salary_min=60000, salary_max=70000, salary_period="yearly", currency="CAD",
        posted_at=utcnow() - timedelta(days=2), flags=[], hidden_reasons=[])
    values.update(fields)
    job = Job(user_id=user.id, title=title, normalized_title=normalize_title(title), company_name=company,
              location=location, description=description, requirements=extract_requirements(description, title),
              dedup_key=dedup_key(company, title, location), **values)
    db.add(job)
    db.flush()
    return job
