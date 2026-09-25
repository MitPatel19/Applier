from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

SourceKey = Literal["linkedin", "indeed", "company_sites"]


class SearchFilters(BaseModel):
    """Structured search filters. Produced by the natural-language query builder or the UI."""

    roles: list[str] = []  # target job titles
    keywords: list[str] = []  # skills / technologies / free keywords
    locations: list[str] = []  # e.g. ["Thunder Bay, ON"]
    remote_regions: list[str] = []  # e.g. ["Canada"] — remote positions open to these regions
    work_arrangements: list[Literal["onsite", "hybrid", "remote"]] = []
    job_types: list[Literal["full_time", "part_time", "contract", "internship", "co_op", "temporary"]] = []
    experience_levels: list[Literal["entry", "junior", "intermediate", "senior", "lead"]] = []
    salary_min: int | None = None
    salary_period: Literal["yearly", "hourly"] = "yearly"
    posted_within_days: int | None = Field(default=None, ge=1, le=365)
    companies: list[str] = []
    exclude_companies: list[str] = []
    industries: list[str] = []
    easy_apply_only: bool = False


class Interpretation(BaseModel):
    field: str  # which filter this chip maps to
    label: str  # "Location"
    value: str  # "Thunder Bay, ON"


class ParsedQuery(BaseModel):
    text: str
    filters: SearchFilters
    interpretation: list[Interpretation]
    warnings: list[str] = []
    suggested_name: str


class ParseQueryIn(BaseModel):
    text: str = Field(min_length=3, max_length=1000)


class RunSearchIn(BaseModel):
    filters: SearchFilters
    sources: list[SourceKey] = ["linkedin", "indeed", "company_sites"]
    query_text: str | None = None
    job_search_id: int | None = None


class JobSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    query_text: str | None = None
    filters: SearchFilters
    sources: list[SourceKey] = ["linkedin", "indeed", "company_sites"]
    schedule: Literal["manual", "daily", "several_daily"] = "manual"
    is_active: bool = True


class JobSearchUpdate(BaseModel):
    name: str | None = None
    query_text: str | None = None
    filters: SearchFilters | None = None
    sources: list[SourceKey] | None = None
    schedule: Literal["manual", "daily", "several_daily"] | None = None
    is_active: bool | None = None


class JobSearchOut(ORMModel):
    id: int
    name: str
    query_text: str | None
    filters: SearchFilters
    sources: list[str]
    schedule: str
    is_active: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    last_result_count: int | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


class MatchCategory(BaseModel):
    key: str  # skills | experience | education | location | salary | work_arrangement | employment_type | career | requirements
    label: str
    score: int  # 0-100
    weight: int  # relative weight used
    applicable: bool = True  # False when the posting lacks the info (excluded from the overall)
    summary: str  # one-line explanation
    reasons: list[str] = []  # detailed reasoning lines
    matched: list[str] = []
    missing: list[str] = []


class JobMatchOut(ORMModel):
    job_id: int
    overall: int
    tier: Literal["strong", "good", "possible", "weak"]
    breakdown: list[MatchCategory]
    missing_required: list[str]
    missing_preferred: list[str]
    recommendation: str
    should_apply: Literal["apply", "consider", "skip"]
    concerns: list[str]
    weights: dict[str, int]
    updated_at: datetime


class ScoringWeightsOut(BaseModel):
    weights: dict[str, int]
    defaults: dict[str, int]
    labels: dict[str, str]


class ScoringWeightsIn(BaseModel):
    weights: dict[str, int]


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


class JobRequirements(BaseModel):
    """Structured extraction of a job description."""

    required_skills: list[str] = []
    preferred_skills: list[str] = []
    education: list[str] = []  # e.g. ["Bachelor's degree in Computer Science or related field"]
    education_level: str | None = None  # none | diploma | bachelor | master | phd
    min_years_experience: float | None = None
    max_years_experience: float | None = None
    responsibilities: list[str] = []
    technologies: list[str] = []
    certifications: list[str] = []
    keywords: list[str] = []
    soft_skills: list[str] = []
    work_authorization: str | None = None
    benefits: list[str] = []
    questions: list[str] = []  # screening questions detected in the posting


class JobFlag(BaseModel):
    code: str
    label: str
    severity: Literal["info", "warning"] = "info"


class JobSourceOut(ORMModel):
    id: int
    source: str
    source_label: str
    url: str | None
    apply_url: str | None
    apply_method: str
    fetched_at: datetime


class JobMatchSummary(BaseModel):
    overall: int
    tier: str
    recommendation: str
    top_matched: list[str] = []
    top_missing: list[str] = []


class JobOut(ORMModel):
    id: int
    title: str
    company_name: str
    company_id: int | None
    location: str | None
    work_arrangement: str | None
    employment_type: str | None
    experience_level: str | None
    salary_min: int | None
    salary_max: int | None
    salary_period: str | None
    currency: str | None
    posted_at: datetime | None
    deadline: date | None
    first_seen_at: datetime
    is_saved: bool
    is_hidden: bool
    is_seen: bool
    is_demo: bool
    flags: list[JobFlag]
    hidden_reasons: list[str]
    sources: list[JobSourceOut]
    match: JobMatchSummary | None = None
    application_id: int | None = None
    application_status: str | None = None


class CompanyFact(BaseModel):
    text: str
    kind: Literal["verified", "opinion", "inferred"]
    source: str
    source_url: str | None = None
    as_of: str | None = None


class CompanyOut(ORMModel):
    id: int
    name: str
    industry: str | None
    website: str | None
    headquarters: str | None
    size: str | None
    locations: list[str]
    careers_url: str | None
    description: str | None
    products: list[str]
    tech_stack: list[str]
    benefits: list[str]
    facts: list[CompanyFact]
    notes: str | None
    researched_at: datetime | None
    is_demo: bool
    open_jobs: int = 0


class CompanyUpdate(BaseModel):
    industry: str | None = None
    website: str | None = None
    headquarters: str | None = None
    size: str | None = None
    careers_url: str | None = None
    description: str | None = None
    notes: str | None = None


class JobDetailOut(JobOut):
    description: str
    department: str | None
    requirements: JobRequirements
    full_match: JobMatchOut | None = None
    company: CompanyOut | None = None
    duplicates_merged: int = 0  # number of source postings merged into this record


class JobCounts(BaseModel):
    all: int
    recommended: int
    new: int
    saved: int
    closing_soon: int
    hidden: int
    strong: int
    good: int
    possible: int


class JobListOut(BaseModel):
    items: list[JobOut]
    total: int
    page: int
    page_size: int
    counts: JobCounts


class ManualJobIn(BaseModel):
    """Add a job the user found elsewhere by pasting its details."""

    title: str = Field(min_length=1, max_length=300)
    company_name: str = Field(min_length=1, max_length=200)
    location: str | None = None
    url: str | None = None
    description: str = Field(min_length=20)
    work_arrangement: Literal["onsite", "hybrid", "remote"] | None = None
    employment_type: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_period: Literal["yearly", "hourly"] | None = None
    deadline: date | None = None


class HideJobIn(BaseModel):
    reason: str | None = None


class JobFeedbackIn(BaseModel):
    feedback: Literal["interested", "not_interested"] | None
