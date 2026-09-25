"""LinkedIn job source.

LinkedIn's job-search API is available only through its partner programs. Applier never scrapes
LinkedIn pages. When partner access is configured and the user has connected LinkedIn, results
from the installed partner client are mapped here; otherwise the source reports ``not_connected``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.services.sources.base import RawPosting
from app.services.sources.partner import PartnerJobBoard


def _from_millis(value: Any) -> datetime | None:
    if not isinstance(value, int | float):
        return None
    return datetime.fromtimestamp(value / 1000, UTC).replace(tzinfo=None)


class LinkedInSource(PartnerJobBoard):
    key = "linkedin"
    label = "LinkedIn"
    access_setting = "linkedin_partner_access"

    def to_posting(self, item: dict[str, Any]) -> RawPosting:
        """Map a partner job result (id, title, companyName, description, location, listedAt, applyUrl...)."""
        job_id = str(item.get("id") or item.get("jobPostingId") or "")
        return RawPosting(
            source="linkedin",
            source_label="LinkedIn",
            external_id=job_id,
            title=str(item.get("title") or ""),
            company_name=str(item.get("companyName") or item.get("company") or ""),
            description=str(item.get("description") or ""),
            url=item.get("url") or (f"https://www.linkedin.com/jobs/view/{job_id}" if job_id else None),
            apply_url=item.get("applyUrl"),
            apply_method="easy_apply" if item.get("easyApply") else "external_link",
            location=item.get("location"),
            work_arrangement=item.get("workplaceType"),
            employment_type=item.get("employmentType"),
            posted_at=_from_millis(item.get("listedAt")),
            raw={"id": job_id},
        )
