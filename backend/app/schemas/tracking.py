"""Schemas for interviews, networking, follow-ups, notifications, integrations, agent, audit, analytics."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

# ---------------------------------------------------------------------------
# Interviews
# ---------------------------------------------------------------------------

InterviewKind = Literal["phone_screen", "recruiter", "technical", "behavioral", "onsite", "final", "other"]


class StarStory(BaseModel):
    title: str  # e.g. "Delivered REST API under deadline"
    source: str  # which experience/project it draws from
    situation: str
    task: str
    action: str
    result: str
    fits_questions: list[str] = []


class PrepQuestion(BaseModel):
    question: str
    why: str | None = None  # why it's likely
    tips: list[str] = []
    suggested_story: str | None = None  # StarStory.title


class InterviewPrep(BaseModel):
    company_overview: str = ""
    role_summary: str = ""
    required_skills: list[str] = []
    technical_topics: list[dict[str, Any]] = []  # [{"topic","why","subtopics":[...]}]
    behavioral_questions: list[PrepQuestion] = []
    technical_questions: list[PrepQuestion] = []
    star_stories: list[StarStory] = []
    questions_to_ask: list[str] = []
    relevant_projects: list[dict[str, Any]] = []  # [{"name","why","talking_points":[...]}]
    talking_points: list[str] = []
    gaps_to_prepare: list[str] = []  # missing skills: how to address honestly
    generated_at: datetime | None = None


class InterviewIn(BaseModel):
    application_id: int
    kind: InterviewKind = "phone_screen"
    scheduled_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=600)
    location: str | None = None
    meeting_url: str | None = None
    interviewers: list[str] = []
    notes: str | None = None


class InterviewUpdate(BaseModel):
    kind: InterviewKind | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int | None = None
    location: str | None = None
    meeting_url: str | None = None
    interviewers: list[str] | None = None
    notes: str | None = None
    outcome: Literal["pending", "passed", "failed", "cancelled"] | None = None


class PracticeEntry(BaseModel):
    question: str
    answer: str
    feedback: list[str]
    score: int  # 0-100
    created_at: datetime


class InterviewOut(ORMModel):
    id: int
    application_id: int
    kind: str
    scheduled_at: datetime | None
    duration_minutes: int | None
    location: str | None
    meeting_url: str | None
    interviewers: list[str]
    notes: str | None
    outcome: str | None
    created_at: datetime
    company_name: str = ""
    job_title: str = ""


class InterviewDetailOut(InterviewOut):
    prep: InterviewPrep
    practice_log: list[PracticeEntry]


class PracticeIn(BaseModel):
    question: str = Field(min_length=3)
    answer: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------


class RecruiterIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    title: str | None = None
    company: str | None = None
    kind: Literal["recruiter", "hiring_manager", "contact"] = "recruiter"
    linkedin_url: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
    last_contact_at: datetime | None = None
    next_follow_up_at: datetime | None = None


class RecruiterUpdate(BaseModel):
    name: str | None = None
    title: str | None = None
    company: str | None = None
    kind: Literal["recruiter", "hiring_manager", "contact"] | None = None
    linkedin_url: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
    last_contact_at: datetime | None = None
    next_follow_up_at: datetime | None = None


class RecruiterOut(RecruiterIn, ORMModel):
    id: int
    created_at: datetime
    applications_count: int = 0


class NetworkingMessageIn(BaseModel):
    purpose: Literal["introduction", "follow_up", "thank_you", "referral_request", "informational_interview"]
    application_id: int | None = None
    job_id: int | None = None
    extra_context: str | None = Field(default=None, max_length=1000)


# ---------------------------------------------------------------------------
# Follow-ups
# ---------------------------------------------------------------------------


class FollowUpIn(BaseModel):
    application_id: int | None = None
    recruiter_id: int | None = None
    due_at: datetime
    channel: Literal["email", "dashboard", "manual"] = "dashboard"
    subject: str | None = None
    message: str | None = None
    note: str | None = None


class FollowUpUpdate(BaseModel):
    due_at: datetime | None = None
    channel: Literal["email", "dashboard", "manual"] | None = None
    status: Literal["pending", "done", "dismissed", "snoozed"] | None = None
    subject: str | None = None
    message: str | None = None
    note: str | None = None


class FollowUpOut(ORMModel):
    id: int
    application_id: int | None
    recruiter_id: int | None
    due_at: datetime
    channel: str
    status: str
    subject: str | None
    message: str | None
    note: str | None
    completed_at: datetime | None
    created_at: datetime
    company_name: str | None = None
    job_title: str | None = None
    recruiter_name: str | None = None
    is_overdue: bool = False


class FollowUpSuggestion(BaseModel):
    application_id: int
    suggested_due_at: datetime
    reason: str


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationOut(ORMModel):
    id: int
    type: str
    title: str
    body: str | None
    link: str | None
    priority: str
    read_at: datetime | None
    created_at: datetime


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

TemplateKind = Literal["cover_letter", "question", "follow_up", "recruiter_message", "thank_you"]


class TemplateIn(BaseModel):
    kind: TemplateKind
    name: str = Field(min_length=1, max_length=200)
    subject: str | None = None
    body: str = Field(min_length=1)
    question: str | None = None
    is_default: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    body: str | None = None
    question: str | None = None
    is_default: bool | None = None


class TemplateOut(TemplateIn, ORMModel):
    id: int
    created_at: datetime
    updated_at: datetime


class TemplateRenderIn(BaseModel):
    application_id: int | None = None
    job_id: int | None = None
    recruiter_id: int | None = None


class TemplateRenderOut(BaseModel):
    subject: str | None
    body: str
    unresolved: list[str]  # placeholders that couldn't be filled


# ---------------------------------------------------------------------------
# Integrations
# ---------------------------------------------------------------------------


class IntegrationOut(BaseModel):
    provider: str  # linkedin | indeed | gmail | outlook | google_calendar | microsoft_calendar
    name: str
    category: Literal["job_source", "email", "calendar"]
    description: str
    status: Literal["connected", "disconnected", "error", "pending", "unavailable"]
    available: bool  # server has OAuth credentials configured for this provider
    availability_note: str | None = None
    account_label: str | None = None
    scopes: list[str] = []
    scope_explanations: list[str] = []  # plain-language description of what access is requested
    connected_at: datetime | None = None
    last_sync_at: datetime | None = None
    last_error: str | None = None


class ConnectOut(BaseModel):
    authorize_url: str


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class AgentStep(BaseModel):
    key: str
    label: str
    status: Literal["pending", "running", "done", "failed", "skipped"]
    detail: str | None = None
    count: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class AgentTaskOut(ORMModel):
    id: int
    kind: str
    title: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    trigger: str
    job_search_id: int | None
    steps: list[AgentStep]
    params: dict[str, Any]
    result: dict[str, Any]
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class AgentStatusOut(BaseModel):
    running: AgentTaskOut | None
    last: AgentTaskOut | None
    next_scheduled_run: datetime | None
    search_frequency: str
    ai_writing_available: bool
    demo_mode: bool
    sources: list[dict[str, Any]]  # [{"key","label","status": "ready"|"not_connected"|"demo","note"}]


class AgentRunIn(BaseModel):
    kind: Literal["search", "analyze"] = "search"


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class AuditLogOut(ORMModel):
    id: int
    actor: str
    action: str
    entity_type: str | None
    entity_id: int | None
    summary: str
    details: dict[str, Any]
    created_at: datetime


# ---------------------------------------------------------------------------
# Analytics / dashboard
# ---------------------------------------------------------------------------


class StatTile(BaseModel):
    key: str
    label: str
    value: float
    unit: str | None = None  # "%" or None
    delta: float | None = None  # vs previous period
    hint: str | None = None


class SeriesPoint(BaseModel):
    date: str  # ISO date (bucket start)
    discovered: int = 0
    applied: int = 0
    interviews: int = 0


class BreakdownRow(BaseModel):
    label: str
    applications: int
    responses: int
    interviews: int
    offers: int
    response_rate: float
    interview_rate: float


class FunnelStage(BaseModel):
    key: str
    label: str
    count: int


class AnalyticsOut(BaseModel):
    range_days: int
    tiles: list[StatTile]
    timeseries: list[SeriesPoint]
    funnel: list[FunnelStage]
    by_source: list[BreakdownRow]
    by_title: list[BreakdownRow]
    by_resume: list[BreakdownRow]
    rejection_reasons: list[dict[str, Any]]  # [{"reason","count"}]
    status_distribution: list[dict[str, Any]]  # [{"status","label","count"}]
    sample_size_note: str | None = None  # caution when datasets are small


class ResumePerformanceRow(BaseModel):
    resume_id: int | None
    resume_name: str
    applications: int
    interviews: int
    offers: int
    interview_rate: float
    confidence: Literal["low", "medium", "high"]
    note: str


class ResumePerformanceOut(BaseModel):
    rows: list[ResumePerformanceRow]
    disclaimer: str


class DashboardJob(BaseModel):
    id: int
    title: str
    company_name: str
    location: str | None
    match: int | None
    tier: str | None
    recommendation: str | None
    deadline: str | None
    sources: list[str]
    is_saved: bool


class DashboardAction(BaseModel):
    key: str  # ready_to_apply | follow_ups_due | interview_soon | missing_info | resume_issue
    label: str  # "3 Applications Ready"
    count: int
    link: str
    priority: Literal["low", "normal", "high"] = "normal"


class DashboardOut(BaseModel):
    greeting_name: str
    agent_status: str  # "ready" | "searching" | "idle"
    agent_message: str
    job_search: dict[str, int]  # {"found","relevant","strong","new"}
    applications: dict[str, int]  # {"applied","interviews","awaiting_response","offers"}
    actions: list[DashboardAction]
    top_opportunities: list[DashboardJob]
    new_jobs: list[DashboardJob]
    closing_soon: list[DashboardJob]
    saved_jobs: list[DashboardJob]
    ready_to_apply: list[dict[str, Any]]  # [{"application_id","company","title","match"}]
    upcoming_interviews: list[dict[str, Any]]  # [{"interview_id","application_id","company","title","kind","scheduled_at"}]
    follow_ups_due: list[dict[str, Any]]
    pipeline: list[dict[str, Any]]  # [{"status","label","count"}]
    profile_completeness: int
    onboarding_completed: bool
