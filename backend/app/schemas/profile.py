from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.auth import UserOut
from app.schemas.common import ORMModel

WorkArrangement = Literal["onsite", "hybrid", "remote"]
JobType = Literal["full_time", "part_time", "contract", "internship", "co_op", "temporary"]
ExperienceLevel = Literal["entry", "junior", "intermediate", "senior", "lead"]
SkillCategory = Literal["programming", "frameworks", "databases", "cloud", "devops", "tools", "soft",
                        "certifications", "other"]


class ProfileIn(BaseModel):
    phone: str | None = None
    city: str | None = None
    province: str | None = None
    country: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None
    headline: str | None = Field(default=None, max_length=300)
    summary: str | None = None
    years_experience: float | None = Field(default=None, ge=0, le=60)
    desired_positions: list[str] | None = None
    desired_salary: int | None = Field(default=None, ge=0)
    salary_period: Literal["yearly", "hourly"] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    work_authorization: str | None = None
    authorized_countries: list[str] | None = None
    requires_sponsorship: bool | None = None
    availability: str | None = None
    preferred_arrangements: list[WorkArrangement] | None = None


class ProfileOut(ORMModel):
    phone: str | None
    city: str | None
    province: str | None
    country: str | None
    linkedin_url: str | None
    portfolio_url: str | None
    github_url: str | None
    website_url: str | None
    headline: str | None
    summary: str | None
    years_experience: float | None
    desired_positions: list[str]
    desired_salary: int | None
    salary_period: str
    currency: str
    work_authorization: str | None
    authorized_countries: list[str]
    requires_sponsorship: bool | None
    availability: str | None
    preferred_arrangements: list[str]


class EducationIn(BaseModel):
    institution: str = Field(min_length=1, max_length=200)
    degree: str | None = None
    program: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    gpa: str | None = None
    location: str | None = None
    coursework: list[str] = []
    sort_order: int = 0


class EducationOut(EducationIn, ORMModel):
    id: int


class ExperienceIn(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    position: str = Field(min_length=1, max_length=200)
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    responsibilities: list[str] = []
    achievements: list[str] = []
    technologies: list[str] = []
    metrics: list[str] = []
    sort_order: int = 0


class ExperienceOut(ExperienceIn, ORMModel):
    id: int


class SkillIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: SkillCategory | None = None  # auto-detected from the taxonomy when omitted
    level: Literal["beginner", "intermediate", "advanced", "expert"] | None = None
    years: float | None = Field(default=None, ge=0, le=60)


class SkillOut(ORMModel):
    id: int
    name: str
    category: str
    level: str | None
    years: float | None


class SkillBulkIn(BaseModel):
    skills: list[SkillIn]


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    technologies: list[str] = []
    responsibilities: list[str] = []
    results: list[str] = []
    github_url: str | None = None
    demo_url: str | None = None
    sort_order: int = 0


class ProjectOut(ProjectIn, ORMModel):
    id: int


class CompletenessItem(BaseModel):
    key: str
    label: str
    done: bool
    weight: int


class ProfileCompleteness(BaseModel):
    percent: int
    items: list[CompletenessItem]


class FullProfileOut(BaseModel):
    user: UserOut
    profile: ProfileOut
    educations: list[EducationOut]
    experiences: list[ExperienceOut]
    skills: list[SkillOut]
    projects: list[ProjectOut]
    completeness: ProfileCompleteness


# --------------------------- preferences -----------------------------------


class QualityFilters(BaseModel):
    hide: dict[str, bool] = Field(default_factory=lambda: {
        "missing_certifications": False,
        "outside_locations": True,
        "work_authorization": True,
        "below_min_salary": False,
        "outside_experience_level": False,
        "avoided_companies": True,
        "duplicates": True,
    })
    flag: dict[str, bool] = Field(default_factory=lambda: {
        "unclear_salary": True,
        "unclear_employment_type": True,
        "suspicious_posting": True,
        "missing_company_info": True,
        "deadline_approaching": True,
        "old_posting": True,
    })
    max_age_days: int = Field(default=45, ge=1, le=365)
    deadline_warning_days: int = Field(default=5, ge=1, le=60)


class AgentSettings(BaseModel):
    search_frequency: Literal["manual", "daily", "several_daily"] = "daily"
    auto_search: bool = True
    auto_dedupe: bool = True
    auto_analyze: bool = True
    auto_score: bool = True
    auto_customize_resume: bool = True
    auto_cover_letter: bool = True
    auto_company_research: bool = True
    # Kept for transparency; submission ALWAYS requires per-application approval regardless.
    auto_submit: Literal[False] = False
    sources: list[str] = ["linkedin", "indeed", "company_sites"]
    strong_match_threshold: int = Field(default=80, ge=50, le=100)
    notify_on_strong_match: bool = True


class NotificationSettings(BaseModel):
    in_app: bool = True
    email: bool = False
    browser: bool = False
    types: dict[str, bool] = {}


class UISettings(BaseModel):
    theme: Literal["system", "light", "dark"] = "system"
    reduced_motion: bool = False
    high_contrast: bool = False


class PreferencesIn(BaseModel):
    target_locations: list[str] | None = None
    job_types: list[JobType] | None = None
    work_arrangements: list[WorkArrangement] | None = None
    experience_levels: list[ExperienceLevel] | None = None
    target_roles: list[str] | None = None
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    salary_period: Literal["yearly", "hourly"] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    industries: list[str] | None = None
    preferred_companies: list[str] | None = None
    avoid_companies: list[str] | None = None
    technologies: list[str] | None = None
    required_certifications_available: list[str] | None = None
    quality_filters: QualityFilters | None = None
    notification_settings: NotificationSettings | None = None
    ui_settings: UISettings | None = None


class PreferencesOut(BaseModel):
    target_locations: list[str]
    job_types: list[str]
    work_arrangements: list[str]
    experience_levels: list[str]
    target_roles: list[str]
    salary_min: int | None
    salary_max: int | None
    salary_period: str
    currency: str
    industries: list[str]
    preferred_companies: list[str]
    avoid_companies: list[str]
    technologies: list[str]
    required_certifications_available: list[str]
    scoring_weights: dict[str, int]
    quality_filters: QualityFilters
    agent_settings: AgentSettings
    notification_settings: NotificationSettings
    ui_settings: UISettings


# --------------------------- resume import -----------------------------------


class ParsedResume(BaseModel):
    """What the resume parser extracted — shown to the user for review before import."""

    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    city: str | None = None
    province: str | None = None
    country: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    headline: str | None = None
    summary: str | None = None
    skills: list[SkillIn] = []
    experiences: list[ExperienceIn] = []
    educations: list[EducationIn] = []
    projects: list[ProjectIn] = []
    warnings: list[str] = []


class ProfileImportIn(BaseModel):
    parsed: ParsedResume
    overwrite_personal: bool = False  # overwrite non-empty personal fields
