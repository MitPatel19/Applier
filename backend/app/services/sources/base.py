"""Job source adapter interface.

Every job source (LinkedIn, Indeed, employer career pages / public ATS boards, the demo
source) implements ``JobSourceAdapter`` and returns ``RawPosting`` objects. Postings are then
normalized, deduplicated and merged into unified ``Job`` records by ``services.jobs_ingest``.

Adapters MUST only use official APIs, authorized integrations or public, machine-readable
endpoints that permit automated access. They must never bypass authentication, CAPTCHA,
rate limits or anti-bot protections.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal, Protocol

from sqlalchemy.orm import Session

from app.models import User
from app.schemas.jobs import SearchFilters


@dataclass
class RawPosting:
    source: str  # linkedin | indeed | company_site | greenhouse | lever | ashby | demo | manual
    source_label: str  # "LinkedIn", "Indeed", "Company Website"
    external_id: str
    title: str
    company_name: str
    description: str = ""
    url: str | None = None
    apply_url: str | None = None
    apply_method: Literal["external_link", "easy_apply", "ats_form"] = "external_link"
    location: str | None = None
    city: str | None = None
    province: str | None = None
    country: str | None = None
    work_arrangement: str | None = None  # onsite | hybrid | remote
    employment_type: str | None = None
    experience_level: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_period: str | None = None  # yearly | hourly
    currency: str | None = None
    posted_at: datetime | None = None
    deadline: date | None = None
    department: str | None = None
    company_website: str | None = None
    company_careers_url: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
    is_demo: bool = False


@dataclass
class SourceStatus:
    key: str  # linkedin | indeed | company_sites
    label: str
    status: Literal["ready", "not_connected", "demo", "unavailable"]
    note: str | None = None


class SourceError(Exception):
    """Raised by an adapter when a source can't be queried. ``message`` is user-safe."""

    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.message = message
        self.retryable = retryable


class JobSourceAdapter(Protocol):
    key: str  # the user-facing source group: linkedin | indeed | company_sites
    label: str

    def status(self, db: Session, user: User) -> SourceStatus: ...

    def search(self, db: Session, user: User, filters: SearchFilters, *, limit: int = 100) -> list[RawPosting]:
        """Return postings matching ``filters``. Raise ``SourceError`` on failure."""
        ...
