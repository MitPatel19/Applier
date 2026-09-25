from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

# ---------------------------------------------------------------------------
# Structured resume content (stored in Resume.content / ResumeVersion.content)
# ---------------------------------------------------------------------------


class ResumeLink(BaseModel):
    label: str
    url: str


class ResumeContact(BaseModel):
    name: str = ""
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[ResumeLink] = []


class ResumeBullet(BaseModel):
    id: str
    text: str


class ResumeSkillGroup(BaseModel):
    category: str
    items: list[str]


class ResumeExperienceItem(BaseModel):
    id: str
    source_id: int | None = None  # Experience.id when derived from the profile
    company: str
    position: str
    location: str | None = None
    start: str | None = None  # display strings, e.g. "Jan 2023"
    end: str | None = None  # None/"Present"
    bullets: list[ResumeBullet] = []
    technologies: list[str] = []


class ResumeProjectItem(BaseModel):
    id: str
    source_id: int | None = None
    name: str
    description: str | None = None
    technologies: list[str] = []
    bullets: list[ResumeBullet] = []
    url: str | None = None


class ResumeEducationItem(BaseModel):
    id: str
    institution: str
    degree: str | None = None
    program: str | None = None
    start: str | None = None
    end: str | None = None
    gpa: str | None = None
    location: str | None = None
    details: list[str] = []


class ResumeContent(BaseModel):
    contact: ResumeContact = ResumeContact()
    headline: str | None = None
    summary: str | None = None
    skills: list[ResumeSkillGroup] = []
    experience: list[ResumeExperienceItem] = []
    projects: list[ResumeProjectItem] = []
    education: list[ResumeEducationItem] = []
    certifications: list[str] = []
    section_order: list[str] = ["summary", "skills", "experience", "projects", "education", "certifications"]


# ---------------------------------------------------------------------------
# Resumes
# ---------------------------------------------------------------------------


class ResumeOut(ORMModel):
    id: int
    name: str
    target_role: str | None
    version: int
    status: str
    is_default: bool
    file_name: str | None
    mime_type: str | None
    file_size: int | None
    created_at: datetime
    updated_at: datetime
    has_file: bool = False
    skills_count: int = 0
    versions_count: int = 0


class ResumeDetailOut(ResumeOut):
    content: ResumeContent
    parsed_text: str | None = None


class ResumeCreateFromProfile(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    target_role: str | None = None
    set_default: bool = False


class ResumeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    target_role: str | None = None
    status: Literal["active", "draft", "archived"] | None = None
    content: ResumeContent | None = None


ChangeType = Literal["emphasize", "reorder", "rewrite", "remove", "keyword", "summary"]


class ResumeChange(BaseModel):
    id: str
    type: ChangeType
    section: str  # summary | skills | experience | projects | education
    item_ref: str | None = None  # id of the experience/project/bullet affected
    title: str  # short label, e.g. "Emphasized Python, REST APIs, PostgreSQL"
    before: str | None = None
    after: str | None = None
    reason: str
    accepted: bool | None = None  # None = pending review


class ResumeVersionOut(ORMModel):
    id: int
    resume_id: int
    job_id: int | None
    label: str
    file_name: str
    status: str
    ats_score: int | None
    created_at: datetime
    updated_at: datetime


class ResumeVersionDetailOut(ResumeVersionOut):
    content: ResumeContent
    base_content: ResumeContent
    changes: list[ResumeChange]
    keywords_matched: list[str] = []
    keywords_missing: list[str] = []  # job keywords the user doesn't have — deliberately NOT added
    integrity_notes: list[str] = []


class ChangeDecisionIn(BaseModel):
    decisions: dict[str, bool]  # change_id -> accepted


class TailorIn(BaseModel):
    job_id: int
    resume_id: int | None = None  # defaults to the best-matching resume


# ---------------------------------------------------------------------------
# Cover letters
# ---------------------------------------------------------------------------

CoverLetterVariant = Literal["professional", "short", "personalized"]


class CoverLetterOut(ORMModel):
    id: int
    job_id: int | None
    title: str
    variant: str
    content: str
    variants: dict[str, str]
    status: str
    generated_by: str
    created_at: datetime
    updated_at: datetime
    company_name: str | None = None
    job_title: str | None = None


class CoverLetterGenerateIn(BaseModel):
    job_id: int
    variant: CoverLetterVariant = "professional"
    template_id: int | None = None


class CoverLetterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str
    job_id: int | None = None


class CoverLetterUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    variant: CoverLetterVariant | None = None
    status: Literal["draft", "approved"] | None = None
