"""ORM factories shared by the tracking/analytics/privacy tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusChange,
    Experience,
    Job,
    JobMatch,
    JobSource,
    Project,
    Skill,
    User,
    utcnow,
)
from app.services import taxonomy


def make_job(db: Session, user: User, *, title: str = "Junior Python Developer", company: str = "Borealis Software",
             requirements: dict[str, Any] | None = None, match: int | None = 85, tier: str = "strong",
             **fields: Any) -> Job:
    job = Job(user_id=user.id, title=title, normalized_title=title.lower(), company_name=company,
              location="Thunder Bay, ON", description=fields.pop("description", "A role."),
              requirements=requirements if requirements is not None else {
                  "required_skills": ["Python", "Django", "PostgreSQL", "Kubernetes"],
                  "preferred_skills": ["Docker", "React"],
                  "responsibilities": ["Build REST APIs for customer-facing features",
                                       "Collaborate with the team in code reviews",
                                       "Troubleshoot production issues"],
                  "min_years_experience": 2,
              },
              dedup_key=f"{company}-{title}"[:64], flags=[], hidden_reasons=[], **fields)
    job.sources.append(JobSource(source="linkedin", source_label="LinkedIn", external_id=f"x-{title}-{company}",
                                 url="https://example.com/job", apply_url="https://example.com/apply"))
    db.add(job)
    db.flush()
    if match is not None:
        db.add(JobMatch(user_id=user.id, job_id=job.id, overall=match, tier=tier, breakdown=[], missing_required=[],
                        missing_preferred=[], recommendation="Recommended because your Python work fits.",
                        concerns=[], weights={}))
        db.flush()
    return job


def make_application(db: Session, user: User, job: Job | None = None, *,
                     status: ApplicationStatus = ApplicationStatus.applied, applied_days_ago: float | None = 10,
                     path: list[ApplicationStatus] | None = None, **fields: Any) -> Application:
    job = job or make_job(db, user)
    applied_at = utcnow() - timedelta(days=applied_days_ago) if applied_days_ago is not None else None
    fields.setdefault("source", "linkedin")
    app = Application(user_id=user.id, job_id=job.id, company_name=job.company_name, job_title=job.title,
                      status=status, applied_at=applied_at, readiness=[], **fields)
    db.add(app)
    db.flush()
    previous = None
    for i, step in enumerate(path or []):
        when = (applied_at or utcnow()) + timedelta(days=i)
        db.add(ApplicationStatusChange(application_id=app.id, from_status=previous, to_status=step.value,
                                       changed_at=min(when, utcnow())))
        previous = step.value
    db.flush()
    return app


def add_profile(db: Session, user: User) -> None:
    db.add(Experience(
        user_id=user.id, company="Northshore Digital", position="Junior Developer", start_date=date(2024, 5, 1),
        responsibilities=["Built REST APIs with Django REST Framework for a scheduling app",
                          "Reviewed pull requests with the team"],
        achievements=["Rewrote the slowest report query, cutting runtime from 4.2s to 600ms"],
        technologies=["Python", "Django", "PostgreSQL", "Docker"], metrics=["4.2s → 600ms report query"]))
    db.add(Project(user_id=user.id, name="ShiftSwap", description="Shift trading app for part-time staff",
                   technologies=["Django", "React", "PostgreSQL"],
                   responsibilities=["Designed the data model", "Built the React front end"], results=[],
                   github_url="https://example.com/github/shiftswap"))
    for name in ("Python", "Django", "PostgreSQL", "Docker", "React", "Git"):
        db.add(Skill(user_id=user.id, name=name, category=taxonomy.category_of(name)))
    db.flush()


def days_ago(n: float) -> datetime:
    return utcnow() - timedelta(days=n)
