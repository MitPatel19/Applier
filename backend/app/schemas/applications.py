from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.jobs import CompanyOut, JobDetailOut, JobMatchOut
from app.schemas.resume import CoverLetterOut, ResumeOut, ResumeVersionDetailOut

ApplicationStatusLiteral = Literal[
    "discovered", "saved", "reviewing", "ready", "applied", "confirmed", "recruiter_contacted", "interview",
    "technical_interview", "final_interview", "offer", "rejected", "withdrawn", "closed",
]

STATUS_LABELS: dict[str, str] = {
    "discovered": "Discovered",
    "saved": "Saved",
    "reviewing": "Reviewing",
    "ready": "Ready to Apply",
    "applied": "Applied",
    "confirmed": "Application Confirmed",
    "recruiter_contacted": "Recruiter Contacted",
    "interview": "Interview",
    "technical_interview": "Technical Interview",
    "final_interview": "Final Interview",
    "offer": "Offer",
    "rejected": "Rejected",
    "withdrawn": "Withdrawn",
    "closed": "Closed",
}


class ReadinessItem(BaseModel):
    key: str  # resume | cover_letter | phone | email | salary | work_authorization | portfolio | answers | ...
    label: str  # "Resume ready"
    state: Literal["ok", "warning", "missing"]
    detail: str | None = None
    resolvable: bool = True
    # Where the user can fix it: "profile.phone", "answers", "cover_letter", ...
    field: str | None = None
    blocking: bool = False  # True -> cannot approve until resolved


class AnswerOut(ORMModel):
    id: int
    question: str
    answer: str
    field_type: str
    options: list[str]
    required: bool
    source: str
    needs_confirmation: bool
    confirmed: bool
    sort_order: int


class AnswerIn(BaseModel):
    question: str = Field(min_length=1)
    answer: str = ""
    field_type: Literal["text", "textarea", "yes_no", "number", "select"] = "text"
    options: list[str] = []
    required: bool = True


class AnswerUpdate(BaseModel):
    answer: str | None = None
    confirmed: bool | None = None


class StatusChangeOut(ORMModel):
    id: int
    from_status: str | None
    to_status: str
    actor: str
    note: str | None
    changed_at: datetime


class ApplicationDocumentOut(ORMModel):
    id: int
    kind: str
    file_name: str
    mime_type: str | None
    created_at: datetime


class ApplicationOut(ORMModel):
    id: int
    job_id: int | None
    company_name: str
    job_title: str
    location: str | None
    source: str | None
    url: str | None
    status: ApplicationStatusLiteral
    board_position: float
    match_score: int | None
    resume_id: int | None
    resume_version_id: int | None
    cover_letter_id: int | None
    recruiter_id: int | None
    date_discovered: datetime | None
    prepared_at: datetime | None
    approved_at: datetime | None
    applied_at: datetime | None
    submission_method: str | None
    submission_state: str | None
    notes: str | None
    rejection_reason: str | None
    salary_expectation: str | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    # derived
    resume_name: str | None = None
    next_interview_at: datetime | None = None
    next_follow_up_at: datetime | None = None
    readiness_summary: dict[str, int] = {}  # {"ok": 5, "warning": 1, "missing": 0}


class InterviewBrief(ORMModel):
    id: int
    kind: str
    scheduled_at: datetime | None
    outcome: str | None


class FollowUpBrief(ORMModel):
    id: int
    due_at: datetime
    status: str
    channel: str


class ApplicationDetailOut(ApplicationOut):
    apply_url: str | None
    job: JobDetailOut | None
    match: JobMatchOut | None
    company: CompanyOut | None
    resume: ResumeOut | None
    resume_version: ResumeVersionDetailOut | None
    cover_letter: CoverLetterOut | None
    answers: list[AnswerOut]
    readiness: list[ReadinessItem]
    documents: list[ApplicationDocumentOut]
    status_history: list[StatusChangeOut]
    interviews: list[InterviewBrief]
    follow_ups: list[FollowUpBrief]


class ApplicationCreate(BaseModel):
    job_id: int
    status: Literal["discovered", "saved", "reviewing"] = "saved"


class ApplicationUpdate(BaseModel):
    notes: str | None = None
    salary_expectation: str | None = None
    recruiter_id: int | None = None
    resume_id: int | None = None
    cover_letter_id: int | None = None
    rejection_reason: str | None = None


class StatusUpdateIn(BaseModel):
    status: ApplicationStatusLiteral
    note: str | None = None
    board_position: float | None = None


class PrepareIn(BaseModel):
    job_id: int
    resume_id: int | None = None  # override automatic resume selection
    cover_letter_variant: Literal["professional", "short", "personalized"] = "professional"
    include_cover_letter: bool | None = None  # None = agent decides based on posting


class PreviewRow(BaseModel):
    label: str  # "RESUME"
    value: str  # "Customized"
    state: Literal["ok", "warning", "missing", "info"] = "info"


class ApplicationPreview(BaseModel):
    application_id: int
    company: str
    position: str
    location: str | None
    source: str | None
    match: int | None
    resume_file_name: str | None
    cover_letter_file_name: str | None
    answers_completed: int
    answers_total: int
    missing: list[str]
    concerns: list[str]
    status: str
    can_approve: bool
    destination: str | None  # where the application will be sent (host/URL)
    submission_method: Literal["external_link", "automation", "manual"]
    rows: list[PreviewRow]


class ApproveIn(BaseModel):
    confirm: Literal[True]
    # The user explicitly confirms they reviewed answers flagged as needing confirmation.
    acknowledge_answers: bool = False


class SubmitPlanStep(BaseModel):
    label: str
    done: bool = False
    requires_user: bool = False


class SubmitResult(BaseModel):
    application_id: int
    # pending_user: the user must finish on the employer site and confirm | submitted | failed | paused
    state: Literal["pending_user", "submitted", "failed", "paused"]
    message: str
    apply_url: str | None
    steps: list[SubmitPlanStep]
    status: ApplicationStatusLiteral


class ConfirmSubmittedIn(BaseModel):
    submitted: bool
    note: str | None = None
    schedule_follow_up: bool = True
    follow_up_days: int = Field(default=7, ge=1, le=60)


class BoardColumn(BaseModel):
    status: ApplicationStatusLiteral
    label: str
    items: list[ApplicationOut]


class BoardOut(BaseModel):
    columns: list[BoardColumn]
