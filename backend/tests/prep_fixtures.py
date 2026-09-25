"""Factories shared by the profile / resume / cover letter / application tests (ORM only, no HTTP)."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import Education, Experience, Job, JobSource, Project, Skill, User
from app.services.profile_bundle import ensure_profile_rows

PROFILE_SKILLS: list[tuple[str, str, float | None]] = [
    ("Python", "programming", 2.0), ("JavaScript", "programming", None), ("SQL", "programming", None),
    ("Django", "frameworks", None), ("React", "frameworks", None), ("PostgreSQL", "databases", None),
    ("Git", "tools", None), ("Docker", "devops", None), ("Communication", "soft", None),
]


def seed_profile(db: Session, user: User) -> None:
    profile, prefs = ensure_profile_rows(db, user)
    profile.phone = "(807) 555-0142"
    profile.city, profile.province, profile.country = "Thunder Bay", "ON", "Canada"
    profile.linkedin_url = "https://linkedin.com/in/mitpatel"
    profile.github_url = "https://github.com/mitpatel"
    profile.headline = "Junior Software Developer"
    profile.summary = "Developer building web applications."
    profile.authorized_countries = ["Canada"]
    profile.requires_sponsorship = False
    profile.availability = "Immediately"
    profile.desired_salary = 65000
    prefs.target_roles = ["Software Developer"]
    prefs.target_locations = ["Thunder Bay, ON"]
    db.add(Experience(
        user_id=user.id, company="Northern Tech Solutions", position="Software Developer Intern",
        start_date=date.today() - timedelta(days=800), end_date=None,
        responsibilities=["Responsible for maintaining the internal ticketing API in Django",
                          "Built REST APIs with Django and Postgres for 3 internal tools",
                          "Wrote onboarding documentation for new hires"],
        achievements=["Cut API response time by 40% by adding Redis caching"],
        technologies=["Python", "Django", "PostgreSQL", "Redis", "Git"], metrics=[],
    ))
    db.add(Education(user_id=user.id, institution="Lakehead University", degree="Bachelor of Science",
                     program="Computer Science", start_date=date(2019, 9, 1), end_date=date(2023, 4, 30),
                     coursework=["Databases", "Operating Systems"]))
    for name, category, years in PROFILE_SKILLS:
        db.add(Skill(user_id=user.id, name=name, category=category, years=years))
    projects = [
        ("Budget Tracker", "Personal finance web app", ["Flask", "SQLite"], ["Built a Flask app to track spending"]),
        ("Portfolio Site", "Personal website", ["React"], ["Designed and built a React portfolio"]),
        ("Ticket API", "REST API for support tickets", ["Python", "Django", "PostgreSQL"],
         ["Built a Django REST API with PostgreSQL"]),
        ("Photo Gallery", "Photo collection", ["Figma"], ["Designed a photo layout"]),
    ]
    for i, (name, description, tech, bullets) in enumerate(projects):
        db.add(Project(user_id=user.id, name=name, description=description, technologies=tech,
                       responsibilities=bullets, sort_order=i))
    db.commit()


def make_job(db: Session, user: User, *, title: str = "Junior Software Developer", company: str = "XYZ",
             deadline: date | None = None, questions: list[str] | None = None,
             description: str = "Build and maintain REST APIs with Python and Django.") -> Job:
    job = Job(
        user_id=user.id, title=title, normalized_title=title.lower(), company_name=company,
        location="Thunder Bay, ON", city="Thunder Bay", province="ON", country="Canada",
        work_arrangement="hybrid", employment_type="full_time", description=description,
        requirements={
            "required_skills": ["Python", "Django", "PostgreSQL", "REST APIs", "Kubernetes"],
            "preferred_skills": ["Terraform", "React", "Docker"],
            "technologies": ["Python", "Django", "PostgreSQL", "Kubernetes"],
            "responsibilities": ["Build and maintain REST APIs", "Write automated tests"],
            "questions": questions or [],
        },
        deadline=deadline, dedup_key=f"{company}-{title}".lower(),
    )
    job.sources = [JobSource(source="linkedin", source_label="LinkedIn", external_id=f"ext-{title}-{company}",
                             url="https://www.linkedin.com/jobs/view/123",
                             apply_url="https://careers.xyz.example/apply/123", apply_method="external_link")]
    db.add(job)
    db.commit()
    return job
