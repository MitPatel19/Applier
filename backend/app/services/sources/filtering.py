"""Client-side filtering of postings by ``SearchFilters``.

Used by sources whose upstream API can't filter for us (public ATS boards, careers pages)
and, loosely, by the demo source. "Hard" filters (age, companies, easy-apply) always apply;
"soft" filters (relevance, location, arrangement, type, level, salary) can be relaxed so the
scorer — not the search — decides how good a job is.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import timedelta

from app.models import utcnow
from app.schemas.jobs import SearchFilters
from app.services import taxonomy
from app.services.dedup import normalize_company, title_alignment
from app.services.jd_extract import infer_fields
from app.services.location import location_matches
from app.services.search_prefs import yearly
from app.services.sources.base import RawPosting


@dataclass
class FilterResult:
    hard_ok: bool = True
    soft_failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.hard_ok and not self.soft_failures


def is_relevant(title: str, text: str, filters: SearchFilters) -> bool:
    """Does the posting relate to any requested role or keyword?"""
    if not filters.roles and not filters.keywords:
        return True
    if any(title_alignment(title, role) >= 0.75 for role in filters.roles):
        return True
    skills = set(taxonomy.extract_skills(f"{title}\n{text}"))
    for keyword in filters.keywords:
        canonical = taxonomy.canonicalize(keyword)
        if canonical in skills or re.search(rf"\b{re.escape(keyword)}\b", title, re.IGNORECASE):
            return True
    return False


def check_posting(posting: RawPosting, filters: SearchFilters) -> FilterResult:
    result = FilterResult()
    if filters.posted_within_days and posting.posted_at and \
            posting.posted_at < utcnow() - timedelta(days=filters.posted_within_days):
        result.hard_ok = False
    company = normalize_company(posting.company_name)
    if company in {normalize_company(c) for c in filters.exclude_companies}:
        result.hard_ok = False
    if filters.companies and not any(normalize_company(c) in company for c in filters.companies):
        result.hard_ok = False
    if filters.easy_apply_only and posting.apply_method != "easy_apply":
        result.hard_ok = False

    inferred = infer_fields(posting.title, posting.description, posting.location)
    arrangement = posting.work_arrangement or inferred.get("work_arrangement")
    employment = posting.employment_type or inferred.get("employment_type")
    level = posting.experience_level or inferred.get("experience_level")
    if not is_relevant(posting.title, posting.description, filters):
        result.soft_failures.append("relevance")
    if filters.locations or filters.remote_regions:
        ok, _ = location_matches({"location": posting.location, "city": posting.city, "province": posting.province,
                                  "country": posting.country, "work_arrangement": arrangement},
                                 filters.locations, filters.remote_regions)
        if not ok:
            result.soft_failures.append("location")
    if filters.work_arrangements and arrangement and arrangement not in filters.work_arrangements:
        result.soft_failures.append("work_arrangement")
    if filters.job_types and employment and employment not in filters.job_types:
        result.soft_failures.append("job_type")
    if filters.experience_levels and level and level not in filters.experience_levels:
        result.soft_failures.append("experience_level")
    if filters.salary_min:
        top = yearly(posting.salary_max or posting.salary_min or inferred.get("salary_max") or
                     inferred.get("salary_min"), posting.salary_period or inferred.get("salary_period"))
        if top and top < (yearly(filters.salary_min, filters.salary_period) or 0):
            result.soft_failures.append("salary")
    return result


def matches_filters(posting: RawPosting, filters: SearchFilters) -> bool:
    """Strict filtering (all requested criteria must hold when the posting states them)."""
    return check_posting(posting, filters).ok
