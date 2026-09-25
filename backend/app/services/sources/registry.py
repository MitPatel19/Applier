"""Which adapter serves each user-facing source group, and what state it's in.

Source groups: ``linkedin``, ``indeed``, ``company_sites``. In demo mode a group that isn't
connected is served by the matching slice of the sample catalogue (status ``demo``).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import User
from app.services.sources.base import JobSourceAdapter, SourceStatus
from app.services.sources.demo import DemoSource
from app.services.sources.employer import EmployerSitesSource
from app.services.sources.indeed import IndeedSource
from app.services.sources.linkedin import LinkedInSource

SOURCE_KEYS = ("linkedin", "indeed", "company_sites")
SOURCE_LABELS = {"linkedin": "LinkedIn", "indeed": "Indeed", "company_sites": "Employer websites"}
# JobSource.source values that belong to each group (used for filtering jobs by source)
SOURCE_GROUP_MEMBERS = {"linkedin": ("linkedin",), "indeed": ("indeed",),
                        "company_sites": ("company_site", "greenhouse", "lever", "ashby")}


@dataclass
class ResolvedSource:
    key: str
    adapter: JobSourceAdapter
    status: SourceStatus


def _real_adapter(key: str) -> JobSourceAdapter:
    if key == "linkedin":
        return LinkedInSource()
    if key == "indeed":
        return IndeedSource()
    if key == "company_sites":
        return EmployerSitesSource()
    raise ValueError(f"Unknown job source: {key}")


def resolve(db: Session, user: User, key: str) -> ResolvedSource:
    adapter = _real_adapter(key)
    status = adapter.status(db, user)
    if status.status != "ready" and get_settings().demo_mode:
        demo = DemoSource(key, SOURCE_LABELS[key])
        return ResolvedSource(key, demo, demo.status(db, user))
    return ResolvedSource(key, adapter, status)


def get_adapters(db: Session, user: User, source_keys: list[str]) -> list[JobSourceAdapter]:
    return [resolve(db, user, key).adapter for key in source_keys if key in SOURCE_KEYS]


def source_statuses(db: Session, user: User) -> list[SourceStatus]:
    return [resolve(db, user, key).status for key in SOURCE_KEYS]
