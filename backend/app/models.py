"""Relational data model.

All user-owned records carry ``user_id`` with ``ON DELETE CASCADE`` so that deleting an
account removes every piece of personal data. JSON columns hold structured lists that are
always read/written as a whole (e.g. responsibilities, match breakdowns).
"""

from __future__ import annotations

import enum
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _fk(table: str, *, nullable: bool = False, ondelete: str = "CASCADE"):
    return mapped_column(ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable, index=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ApplicationStatus(str, enum.Enum):
    discovered = "discovered"
    saved = "saved"
    reviewing = "reviewing"
    ready = "ready"
    applied = "applied"
    confirmed = "confirmed"
    recruiter_contacted = "recruiter_contacted"
    interview = "interview"
    technical_interview = "technical_interview"
    final_interview = "final_interview"
    offer = "offer"
    rejected = "rejected"
    withdrawn = "withdrawn"
    closed = "closed"


class AgentTaskStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


# ---------------------------------------------------------------------------
# Users & profile
# ---------------------------------------------------------------------------


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Incrementing this revokes every issued session token ("sign out everywhere").
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    profile: Mapped[UserProfile] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    preferences: Mapped[UserPreference] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserProfile(TimestampMixin, Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    # Personal
    phone: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(120))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    portfolio_url: Mapped[str | None] = mapped_column(String(500))
    github_url: Mapped[str | None] = mapped_column(String(500))
    website_url: Mapped[str | None] = mapped_column(String(500))
    # Professional
    headline: Mapped[str | None] = mapped_column(String(300))
    summary: Mapped[str | None] = mapped_column(Text)
    years_experience: Mapped[float | None] = mapped_column(Float)
    desired_positions: Mapped[list[str]] = mapped_column(JSONType, default=list)
    desired_salary: Mapped[int | None] = mapped_column(Integer)
    salary_period: Mapped[str] = mapped_column(String(10), default="yearly")  # yearly | hourly
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    work_authorization: Mapped[str | None] = mapped_column(String(300))
    # e.g. ["Canada"] — countries where the user is legally authorized to work
    authorized_countries: Mapped[list[str]] = mapped_column(JSONType, default=list)
    requires_sponsorship: Mapped[bool | None] = mapped_column(Boolean)
    availability: Mapped[str | None] = mapped_column(String(200))
    preferred_arrangements: Mapped[list[str]] = mapped_column(JSONType, default=list)

    user: Mapped[User] = relationship(back_populates="profile")


class Education(TimestampMixin, Base):
    __tablename__ = "educations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    institution: Mapped[str] = mapped_column(String(200))
    degree: Mapped[str | None] = mapped_column(String(200))  # e.g. "Bachelor of Science", "Diploma"
    program: Mapped[str | None] = mapped_column(String(200))  # e.g. "Computer Science"
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    gpa: Mapped[str | None] = mapped_column(String(20))
    location: Mapped[str | None] = mapped_column(String(200))
    coursework: Mapped[list[str]] = mapped_column(JSONType, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Experience(TimestampMixin, Base):
    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    company: Mapped[str] = mapped_column(String(200))
    position: Mapped[str] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(200))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)  # None = current role
    responsibilities: Mapped[list[str]] = mapped_column(JSONType, default=list)
    achievements: Mapped[list[str]] = mapped_column(JSONType, default=list)
    technologies: Mapped[list[str]] = mapped_column(JSONType, default=list)
    metrics: Mapped[list[str]] = mapped_column(JSONType, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Skill(TimestampMixin, Base):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_skill_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    name: Mapped[str] = mapped_column(String(120))
    # programming | frameworks | databases | cloud | devops | tools | soft | certifications | other
    category: Mapped[str] = mapped_column(String(30), default="other")
    level: Mapped[str | None] = mapped_column(String(20))  # beginner | intermediate | advanced | expert
    years: Mapped[float | None] = mapped_column(Float)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    technologies: Mapped[list[str]] = mapped_column(JSONType, default=list)
    responsibilities: Mapped[list[str]] = mapped_column(JSONType, default=list)
    results: Mapped[list[str]] = mapped_column(JSONType, default=list)
    github_url: Mapped[str | None] = mapped_column(String(500))
    demo_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class UserPreference(TimestampMixin, Base):
    """Job search profile, scoring weights, quality filters, agent + notification settings."""

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    target_locations: Mapped[list[str]] = mapped_column(JSONType, default=list)
    job_types: Mapped[list[str]] = mapped_column(JSONType, default=list)  # full_time, part_time, contract, internship, co_op, temporary
    work_arrangements: Mapped[list[str]] = mapped_column(JSONType, default=list)  # onsite, hybrid, remote
    experience_levels: Mapped[list[str]] = mapped_column(JSONType, default=list)  # entry, junior, intermediate, senior, lead
    target_roles: Mapped[list[str]] = mapped_column(JSONType, default=list)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    salary_period: Mapped[str] = mapped_column(String(10), default="yearly")
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    industries: Mapped[list[str]] = mapped_column(JSONType, default=list)
    preferred_companies: Mapped[list[str]] = mapped_column(JSONType, default=list)
    avoid_companies: Mapped[list[str]] = mapped_column(JSONType, default=list)
    technologies: Mapped[list[str]] = mapped_column(JSONType, default=list)
    required_certifications_available: Mapped[list[str]] = mapped_column(JSONType, default=list)
    # {"skills": 30, "experience": 20, ...} — see services.matching.DEFAULT_WEIGHTS
    scoring_weights: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    # {"hide": {"missing_certifications": true, ...}, "flag": {"unclear_salary": true, ...}, "max_age_days": 45}
    quality_filters: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    # {"search_frequency": "daily", "auto_search": true, ..., "auto_submit": false}
    agent_settings: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    # {"in_app": true, "email": false, "browser": false, "types": {"excellent_match": true, ...}}
    notification_settings: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    # {"theme": "system", "reduced_motion": false, "high_contrast": false}
    ui_settings: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)

    user: Mapped[User] = relationship(back_populates="preferences")


# ---------------------------------------------------------------------------
# Resumes & documents
# ---------------------------------------------------------------------------


class Resume(TimestampMixin, Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    name: Mapped[str] = mapped_column(String(200))
    target_role: Mapped[str | None] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | draft | archived
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    file_key: Mapped[str | None] = mapped_column(String(500))
    file_name: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    file_size: Mapped[int | None] = mapped_column(Integer)
    parsed_text: Mapped[str | None] = mapped_column(Text)
    # Structured content (see schemas.resume.ResumeContent). Source of truth for tailoring.
    content: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    versions: Mapped[list[ResumeVersion]] = relationship(back_populates="resume", cascade="all, delete-orphan")


class ResumeVersion(TimestampMixin, Base):
    """A job-specific tailored copy of a base resume, with a reviewable change list."""

    __tablename__ = "resume_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    resume_id: Mapped[int] = _fk("resumes")
    job_id: Mapped[int | None] = _fk("jobs", nullable=True, ondelete="SET NULL")
    label: Mapped[str] = mapped_column(String(255))
    file_name: Mapped[str] = mapped_column(String(255))  # e.g. Mit_Patel_Junior_Software_Developer_XYZ.pdf
    content: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # tailored ResumeContent (accepted changes applied)
    # The base ResumeContent the changes were computed against, so decisions re-apply deterministically.
    base_content: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    # [{"id","type": emphasize|reorder|rewrite|remove|keyword,"section","item_ref","before","after","reason","accepted": bool|None}]
    changes: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    # {"keywords_matched": [...], "keywords_missing": [...], "integrity_notes": [...]}
    insights: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | approved
    ats_score: Mapped[int | None] = mapped_column(Integer)

    resume: Mapped[Resume] = relationship(back_populates="versions")


class CoverLetter(TimestampMixin, Base):
    __tablename__ = "cover_letters"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    job_id: Mapped[int | None] = _fk("jobs", nullable=True, ondelete="SET NULL")
    title: Mapped[str] = mapped_column(String(255))
    variant: Mapped[str] = mapped_column(String(20), default="professional")  # professional | short | personalized
    content: Mapped[str] = mapped_column(Text, default="")
    # All generated variants, so the user can switch between them: {"professional": "...", ...}
    variants: Mapped[dict[str, str]] = mapped_column(JSONType, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | approved
    generated_by: Mapped[str] = mapped_column(String(20), default="template")  # template | ai | user


class Template(TimestampMixin, Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    # cover_letter | question | follow_up | recruiter_message | thank_you
    kind: Mapped[str] = mapped_column(String(30), index=True)
    name: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    # For kind=question: the question pattern this answer applies to
    question: Mapped[str | None] = mapped_column(String(500))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------------------
# Companies & jobs
# ---------------------------------------------------------------------------


class Company(TimestampMixin, Base):
    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("user_id", "normalized_name", name="uq_company_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200), index=True)
    industry: Mapped[str | None] = mapped_column(String(200))
    website: Mapped[str | None] = mapped_column(String(500))
    headquarters: Mapped[str | None] = mapped_column(String(200))
    size: Mapped[str | None] = mapped_column(String(50))
    locations: Mapped[list[str]] = mapped_column(JSONType, default=list)
    careers_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    products: Mapped[list[str]] = mapped_column(JSONType, default=list)
    tech_stack: Mapped[list[str]] = mapped_column(JSONType, default=list)
    benefits: Mapped[list[str]] = mapped_column(JSONType, default=list)
    # [{"text","kind": "verified"|"opinion"|"inferred","source","source_url","as_of"}]
    facts: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    researched_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Job(TimestampMixin, Base):
    """One unified job record. Postings of the same job from different sources are JobSource rows."""

    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_user_dedup", "user_id", "dedup_key"),
        Index("ix_jobs_user_hidden_seen", "user_id", "is_hidden", "first_seen_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    company_id: Mapped[int | None] = _fk("companies", nullable=True, ondelete="SET NULL")
    title: Mapped[str] = mapped_column(String(300))
    normalized_title: Mapped[str] = mapped_column(String(300), index=True)
    company_name: Mapped[str] = mapped_column(String(200))
    department: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(120))
    work_arrangement: Mapped[str | None] = mapped_column(String(20))  # onsite | hybrid | remote
    employment_type: Mapped[str | None] = mapped_column(String(20))  # full_time | part_time | contract | internship | co_op | temporary
    experience_level: Mapped[str | None] = mapped_column(String(20))  # entry | junior | intermediate | senior | lead
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    salary_period: Mapped[str | None] = mapped_column(String(10))  # yearly | hourly
    currency: Mapped[str | None] = mapped_column(String(3))
    description: Mapped[str] = mapped_column(Text, default="")
    # Structured extraction of the description (see services.jd_extract.JobRequirements)
    requirements: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime)
    deadline: Mapped[date | None] = mapped_column(Date)
    dedup_key: Mapped[str] = mapped_column(String(64))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False)
    saved_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    hidden_reasons: Mapped[list[str]] = mapped_column(JSONType, default=list)
    # [{"code": "unclear_salary", "label": "Salary not listed", "severity": "info"|"warning"}]
    flags: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    is_seen: Mapped[bool] = mapped_column(Boolean, default=False)
    user_feedback: Mapped[str | None] = mapped_column(String(20))  # interested | not_interested
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    company: Mapped[Company | None] = relationship()
    sources: Mapped[list[JobSource]] = relationship(back_populates="job", cascade="all, delete-orphan")
    match: Mapped[JobMatch | None] = relationship(back_populates="job", uselist=False, cascade="all, delete-orphan")


class JobSource(TimestampMixin, Base):
    """A single posting of a job on one source (LinkedIn, Indeed, a company career page, ...)."""

    __tablename__ = "job_sources"
    __table_args__ = (UniqueConstraint("job_id", "source", "external_id", name="uq_job_source_ext"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = _fk("jobs")
    # linkedin | indeed | company_site | greenhouse | lever | ashby | demo
    source: Mapped[str] = mapped_column(String(30), index=True)
    source_label: Mapped[str] = mapped_column(String(100))  # human label: "LinkedIn", "Company Website"
    external_id: Mapped[str] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(String(1000))
    apply_url: Mapped[str | None] = mapped_column(String(1000))
    # external_link | easy_apply | ats_form — how the application can be submitted
    apply_method: Mapped[str] = mapped_column(String(20), default="external_link")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)

    job: Mapped[Job] = relationship(back_populates="sources")


class JobSearch(TimestampMixin, Base):
    """A saved (optionally scheduled) search."""

    __tablename__ = "job_searches"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    name: Mapped[str] = mapped_column(String(200))
    query_text: Mapped[str | None] = mapped_column(Text)  # original natural-language query
    # SearchFilters (see schemas.jobs.SearchFilters)
    filters: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    sources: Mapped[list[str]] = mapped_column(JSONType, default=list)
    schedule: Mapped[str] = mapped_column(String(20), default="manual")  # manual | daily | several_daily
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_result_count: Mapped[int | None] = mapped_column(Integer)


class JobMatch(TimestampMixin, Base):
    """Transparent match score for one job against the user's profile."""

    __tablename__ = "job_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    overall: Mapped[int] = mapped_column(Integer, index=True)  # 0-100
    tier: Mapped[str] = mapped_column(String(20))  # strong | good | possible | weak
    # [{"key","label","score","weight","applicable","summary","reasons":[...],"matched":[...],"missing":[...]}]
    breakdown: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    missing_required: Mapped[list[str]] = mapped_column(JSONType, default=list)
    missing_preferred: Mapped[list[str]] = mapped_column(JSONType, default=list)
    recommendation: Mapped[str] = mapped_column(Text, default="")  # "Recommended because ..."
    should_apply: Mapped[str] = mapped_column(String(20), default="consider")  # apply | consider | skip
    concerns: Mapped[list[str]] = mapped_column(JSONType, default=list)
    weights: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    profile_hash: Mapped[str | None] = mapped_column(String(64))

    job: Mapped[Job] = relationship(back_populates="match")


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------


class Recruiter(TimestampMixin, Base):
    """A networking contact: recruiter, hiring manager or other company contact."""

    __tablename__ = "recruiters"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    name: Mapped[str] = mapped_column(String(200))
    title: Mapped[str | None] = mapped_column(String(200))
    company: Mapped[str | None] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30), default="recruiter")  # recruiter | hiring_manager | contact
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    last_contact_at: Mapped[datetime | None] = mapped_column(DateTime)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Application(TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_application_user_job"),
        Index("ix_applications_user_status", "user_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    job_id: Mapped[int | None] = _fk("jobs", nullable=True, ondelete="SET NULL")
    # Snapshot of job info so history survives job deletion
    company_name: Mapped[str] = mapped_column(String(200))
    job_title: Mapped[str] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(300))
    source: Mapped[str | None] = mapped_column(String(30))
    url: Mapped[str | None] = mapped_column(String(1000))
    apply_url: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, native_enum=False, length=30), default=ApplicationStatus.saved)
    board_position: Mapped[float] = mapped_column(Float, default=0)
    match_score: Mapped[int | None] = mapped_column(Integer)
    resume_id: Mapped[int | None] = _fk("resumes", nullable=True, ondelete="SET NULL")
    resume_version_id: Mapped[int | None] = _fk("resume_versions", nullable=True, ondelete="SET NULL")
    cover_letter_id: Mapped[int | None] = _fk("cover_letters", nullable=True, ondelete="SET NULL")
    recruiter_id: Mapped[int | None] = _fk("recruiters", nullable=True, ondelete="SET NULL")
    date_discovered: Mapped[datetime | None] = mapped_column(DateTime)
    prepared_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Explicit per-application user approval (required before any submission)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime)
    # external_link | automation | manual — how it was submitted
    submission_method: Mapped[str | None] = mapped_column(String(20))
    # pending_user (link opened, waiting for the user to confirm they submitted) | submitted | failed
    submission_state: Mapped[str | None] = mapped_column(String(20))
    # [{"key","label","state": "ok"|"warning"|"missing","detail","resolvable": bool,"field"}]
    readiness: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str | None] = mapped_column(String(300))
    salary_expectation: Mapped[str | None] = mapped_column(String(100))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    job: Mapped[Job | None] = relationship()
    resume: Mapped[Resume | None] = relationship()
    resume_version: Mapped[ResumeVersion | None] = relationship()
    cover_letter: Mapped[CoverLetter | None] = relationship()
    recruiter: Mapped[Recruiter | None] = relationship()
    answers: Mapped[list[ApplicationAnswer]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="ApplicationAnswer.sort_order")
    documents: Mapped[list[ApplicationDocument]] = relationship(back_populates="application", cascade="all, delete-orphan")
    status_history: Mapped[list[ApplicationStatusChange]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="ApplicationStatusChange.changed_at")
    interviews: Mapped[list[Interview]] = relationship(back_populates="application", cascade="all, delete-orphan")


class ApplicationAnswer(TimestampMixin, Base):
    __tablename__ = "application_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = _fk("applications")
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    field_type: Mapped[str] = mapped_column(String(20), default="text")  # text | textarea | yes_no | number | select
    options: Mapped[list[str]] = mapped_column(JSONType, default=list)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    # profile (filled from profile facts) | generated | template | user
    source: Mapped[str] = mapped_column(String(20), default="profile")
    # True when the answer has legal/factual weight and the user must explicitly confirm it
    needs_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    application: Mapped[Application] = relationship(back_populates="answers")


class ApplicationDocument(TimestampMixin, Base):
    __tablename__ = "application_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = _fk("applications")
    kind: Mapped[str] = mapped_column(String(20))  # resume | cover_letter | other
    file_name: Mapped[str] = mapped_column(String(255))
    file_key: Mapped[str | None] = mapped_column(String(500))
    mime_type: Mapped[str | None] = mapped_column(String(120))

    application: Mapped[Application] = relationship(back_populates="documents")


class ApplicationStatusChange(Base):
    __tablename__ = "application_status_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = _fk("applications")
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30))
    actor: Mapped[str] = mapped_column(String(20), default="user")  # user | agent | email
    note: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    application: Mapped[Application] = relationship(back_populates="status_history")


class Interview(TimestampMixin, Base):
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    application_id: Mapped[int] = _fk("applications")
    # phone_screen | recruiter | technical | behavioral | onsite | final | other
    kind: Mapped[str] = mapped_column(String(30), default="phone_screen")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(String(300))
    meeting_url: Mapped[str | None] = mapped_column(String(1000))
    interviewers: Mapped[list[str]] = mapped_column(JSONType, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(String(20))  # pending | passed | failed | cancelled
    # Generated interview preparation (see schemas.interviews.InterviewPrep)
    prep: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    # [{"question","answer","feedback","created_at"}]
    practice_log: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)

    application: Mapped[Application] = relationship(back_populates="interviews")


class FollowUp(TimestampMixin, Base):
    __tablename__ = "follow_ups"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    application_id: Mapped[int | None] = _fk("applications", nullable=True)
    recruiter_id: Mapped[int | None] = _fk("recruiters", nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    channel: Mapped[str] = mapped_column(String(20), default="dashboard")  # email | dashboard | manual
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | done | dismissed | snoozed
    subject: Mapped[str | None] = mapped_column(String(300))
    message: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime)


# ---------------------------------------------------------------------------
# Agent, notifications, integrations, audit
# ---------------------------------------------------------------------------


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    # excellent_match | deadline | interview | recruiter_response | follow_up | status_change
    # | resume_issue | missing_info | agent | system
    type: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(500))
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # low | normal | high
    read_at: Mapped[datetime | None] = mapped_column(DateTime)
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Integration(TimestampMixin, Base):
    __tablename__ = "integrations"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_integration_user_provider"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    provider: Mapped[str] = mapped_column(String(30))  # linkedin | indeed | gmail | google_calendar | outlook | microsoft_calendar
    status: Mapped[str] = mapped_column(String(20), default="disconnected")  # connected | disconnected | error | pending
    account_label: Mapped[str | None] = mapped_column(String(320))
    scopes: Mapped[list[str]] = mapped_column(JSONType, default=list)
    # Tokens are encrypted with Fernet (app.core.crypto) — never stored in plaintext.
    access_token_enc: Mapped[str | None] = mapped_column(Text)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    oauth_state: Mapped[str | None] = mapped_column(String(128))
    connected_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_error: Mapped[str | None] = mapped_column(String(500))


class AgentTask(TimestampMixin, Base):
    """One run of the career agent, with human-readable step-by-step progress."""

    __tablename__ = "agent_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    kind: Mapped[str] = mapped_column(String(30))  # search | analyze | prepare_application | research_company | email_sync
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[AgentTaskStatus] = mapped_column(
        Enum(AgentTaskStatus, native_enum=False, length=20), default=AgentTaskStatus.queued, index=True)
    trigger: Mapped[str] = mapped_column(String(20), default="user")  # user | schedule | system
    job_search_id: Mapped[int | None] = _fk("job_searches", nullable=True, ondelete="SET NULL")
    # [{"key","label","status": pending|running|done|failed|skipped,"detail","count","started_at","finished_at"}]
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    params: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    actor: Mapped[str] = mapped_column(String(20))  # user | agent | system
    action: Mapped[str] = mapped_column(String(60))  # e.g. job.discovered, resume.customized, application.approved
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(String(500))
    details: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class EmailMessage(Base):
    """A job-related email detected via the email integration (only job-related messages are stored)."""

    __tablename__ = "email_messages"
    __table_args__ = (UniqueConstraint("user_id", "provider_message_id", name="uq_email_user_msg"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    application_id: Mapped[int | None] = _fk("applications", nullable=True, ondelete="SET NULL")
    provider_message_id: Mapped[str] = mapped_column(String(300))
    from_address: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(500))
    snippet: Mapped[str | None] = mapped_column(Text)
    # confirmation | interview_invite | recruiter | rejection | offer | other
    category: Mapped[str] = mapped_column(String(30))
    confidence: Mapped[float] = mapped_column(Float, default=0)
    received_at: Mapped[datetime] = mapped_column(DateTime)
    processed: Mapped[bool] = mapped_column(Boolean, default=False)


class StoredFile(Base):
    """An encrypted document (uploaded resume, generated PDF/DOCX) kept in the database.

    Used by ``core.storage.DatabaseEncryptedStorage`` so deployments need no persistent disk.
    """

    __tablename__ = "stored_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = _fk("users")
    key: Mapped[str] = mapped_column(String(500), unique=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
