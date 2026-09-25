"""Indeed job source.

Indeed's job-search API is available only to approved partners. Applier never scrapes Indeed
pages. When partner access is configured and the user has connected Indeed, results from the
installed partner client are mapped here; otherwise the source reports ``not_connected``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.services.sources.base import RawPosting
from app.services.sources.partner import PartnerJobBoard


def _parse_date(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


class IndeedSource(PartnerJobBoard):
    key = "indeed"
    label = "Indeed"
    access_setting = "indeed_partner_access"

    def to_posting(self, item: dict[str, Any]) -> RawPosting:
        """Map a partner job result (jobkey, jobtitle, company, snippet/description, formattedLocation, date, url)."""
        job_key = str(item.get("jobkey") or item.get("id") or "")
        return RawPosting(
            source="indeed",
            source_label="Indeed",
            external_id=job_key,
            title=str(item.get("jobtitle") or item.get("title") or ""),
            company_name=str(item.get("company") or ""),
            description=str(item.get("description") or item.get("snippet") or ""),
            url=item.get("url"),
            apply_url=item.get("applyUrl") or item.get("url"),
            location=item.get("formattedLocation") or item.get("location"),
            posted_at=_parse_date(item.get("date")),
            raw={"jobkey": job_key},
        )
