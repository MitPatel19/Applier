"""Employer websites: public ATS job-board APIs and schema.org JobPosting data on careers pages.

- Greenhouse, Lever and Ashby publish public, documented, unauthenticated JSON job-board APIs
  intended for embedding job listings. Boards to search come from ``settings.employer_boards``.
- Company careers pages (``Company.careers_url``) are fetched only when robots.txt allows it; we
  read the machine-readable schema.org ``JobPosting`` JSON-LD the employer publishes for search
  engines. Nothing else on the page is scraped.

Each board is fetched independently; one failing board doesn't stop the others.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Company, User
from app.schemas.jobs import SearchFilters
from app.services.sources.base import RawPosting, SourceError, SourceStatus
from app.services.sources.filtering import matches_filters
from app.services.sources.web import FetchError, get_html, get_json, html_to_text, json_ld_blocks

log = logging.getLogger("applier.sources.employer")

FRIENDLY_ERROR = ("We couldn't retrieve jobs from this source right now. You can retry or continue with the other "
                  "job sources.")
_ASHBY_TYPES = {"FullTime": "full_time", "PartTime": "part_time", "Intern": "internship", "Contract": "contract",
                "Temporary": "temporary"}
_SCHEMA_TYPES = {"FULL_TIME": "full_time", "PART_TIME": "part_time", "CONTRACTOR": "contract",
                 "INTERN": "internship", "TEMPORARY": "temporary"}
_WORKPLACE = {"remote": "remote", "hybrid": "hybrid", "onsite": "onsite", "on-site": "onsite"}


def _iso(value: Any) -> datetime | None:
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value / 1000, UTC).replace(tzinfo=None)
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC).replace(tzinfo=None) if parsed.tzinfo else parsed


def _salary_period(interval: str | None) -> str | None:
    text = (interval or "").lower()
    return "hourly" if "hour" in text else "yearly" if ("year" in text or "annual" in text) else None


# ---------------------------------------------------------------------------
# Public ATS boards
# ---------------------------------------------------------------------------


def fetch_greenhouse(token: str) -> list[RawPosting]:
    base = f"https://boards-api.greenhouse.io/v1/boards/{token}"
    try:
        company = str((get_json(base) or {}).get("name") or token.replace("-", " ").title())
    except FetchError:
        company = token.replace("-", " ").title()
    data = get_json(f"{base}/jobs?content=true")
    out = []
    for job in data.get("jobs", []):
        location = (job.get("location") or {}).get("name")
        out.append(RawPosting(
            source="greenhouse", source_label="Company Website (Greenhouse)", external_id=str(job.get("id")),
            title=str(job.get("title") or ""), company_name=company,
            description=html_to_text(job.get("content")), url=job.get("absolute_url"),
            apply_url=job.get("absolute_url"), apply_method="ats_form", location=location,
            posted_at=_iso(job.get("first_published") or job.get("updated_at")),
            department=((job.get("departments") or [{}])[0] or {}).get("name"),
            raw={"board": token, "id": job.get("id")}))
    return out


def fetch_lever(company_slug: str) -> list[RawPosting]:
    data = get_json(f"https://api.lever.co/v0/postings/{company_slug}?mode=json")
    company = company_slug.replace("-", " ").title()
    out = []
    for job in data if isinstance(data, list) else []:
        categories = job.get("categories") or {}
        lists = "\n\n".join(f"{item.get('text', '')}\n{html_to_text(item.get('content'))}"
                            for item in job.get("lists") or [])
        description = "\n\n".join(p for p in (job.get("descriptionPlain") or html_to_text(job.get("description")),
                                               lists, job.get("additionalPlain") or "") if p)
        salary = job.get("salaryRange") or {}
        commitment = (categories.get("commitment") or "").lower()
        out.append(RawPosting(
            source="lever", source_label="Company Website (Lever)", external_id=str(job.get("id")),
            title=str(job.get("text") or ""), company_name=company, description=description,
            url=job.get("hostedUrl"), apply_url=job.get("applyUrl") or job.get("hostedUrl"), apply_method="ats_form",
            location=categories.get("location"), work_arrangement=_WORKPLACE.get(str(job.get("workplaceType")).lower()),
            employment_type="full_time" if "full" in commitment else "part_time" if "part" in commitment else
            "contract" if "contract" in commitment else "internship" if "intern" in commitment else None,
            salary_min=salary.get("min"), salary_max=salary.get("max"),
            salary_period=_salary_period(salary.get("interval")) if salary else None, currency=salary.get("currency"),
            posted_at=_iso(job.get("createdAt")), department=categories.get("department") or categories.get("team"),
            raw={"board": company_slug, "id": job.get("id")}))
    return out


def _ashby_salary(job: dict[str, Any]) -> dict[str, Any]:
    for comp in ((job.get("compensation") or {}).get("summaryComponents") or []):
        if comp.get("compensationType") == "Salary":
            return {"salary_min": comp.get("minValue"), "salary_max": comp.get("maxValue"),
                    "salary_period": _salary_period(comp.get("interval")), "currency": comp.get("currencyCode")}
    return {}


def fetch_ashby(board: str) -> list[RawPosting]:
    data = get_json(f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true")
    company = board.replace("-", " ").title()
    out = []
    for job in data.get("jobs", []):
        if job.get("isListed") is False:
            continue
        salary = _ashby_salary(job)
        out.append(RawPosting(
            source="ashby", source_label="Company Website (Ashby)", external_id=str(job.get("id")),
            title=str(job.get("title") or ""), company_name=company,
            description=job.get("descriptionPlain") or html_to_text(job.get("descriptionHtml")),
            url=job.get("jobUrl"), apply_url=job.get("applyUrl") or job.get("jobUrl"), apply_method="ats_form",
            location=job.get("location"),
            work_arrangement="remote" if job.get("isRemote") else _WORKPLACE.get(str(job.get("workplaceType")).lower()),
            employment_type=_ASHBY_TYPES.get(job.get("employmentType") or ""),
            salary_min=int(salary["salary_min"]) if salary.get("salary_min") else None,
            salary_max=int(salary["salary_max"]) if salary.get("salary_max") else None,
            salary_period=salary.get("salary_period"), currency=salary.get("currency"),
            posted_at=_iso(job.get("publishedAt")), department=job.get("department") or job.get("team"),
            raw={"board": board, "id": job.get("id")}))
    return out


# ---------------------------------------------------------------------------
# Careers pages (schema.org JobPosting)
# ---------------------------------------------------------------------------


def _schema_location(posting: dict[str, Any]) -> tuple[str | None, bool]:
    remote = str(posting.get("jobLocationType") or "").upper() == "TELECOMMUTE"
    locations = posting.get("jobLocation") or []
    first = locations[0] if isinstance(locations, list) and locations else locations
    address = (first or {}).get("address") if isinstance(first, dict) else None
    if isinstance(address, dict):
        parts = [address.get("addressLocality"), address.get("addressRegion"), address.get("addressCountry")]
        text = ", ".join(str(p) if not isinstance(p, dict) else str(p.get("name")) for p in parts if p)
        return (f"Remote - {text}" if remote else text) or None, remote
    return ("Remote" if remote else None), remote


def _schema_salary(posting: dict[str, Any]) -> dict[str, Any]:
    salary = posting.get("baseSalary")
    if not isinstance(salary, dict):
        return {}
    value = salary.get("value") if isinstance(salary.get("value"), dict) else {"value": salary.get("value")}
    lo = value.get("minValue") or value.get("value")
    hi = value.get("maxValue")
    try:
        return {"salary_min": int(float(lo)) if lo else None, "salary_max": int(float(hi)) if hi else None,
                "salary_period": _salary_period(value.get("unitText")), "currency": salary.get("currency")}
    except (TypeError, ValueError):
        return {}


def postings_from_jsonld(markup: str, page_url: str, fallback_company: str) -> list[RawPosting]:
    out = []
    for block in json_ld_blocks(markup):
        kind = block.get("@type")
        if kind != "JobPosting" and not (isinstance(kind, list) and "JobPosting" in kind):
            continue
        org = block.get("hiringOrganization")
        company = (org.get("name") if isinstance(org, dict) else org) or fallback_company
        location, remote = _schema_location(block)
        identifier = block.get("identifier")
        ext = identifier.get("value") if isinstance(identifier, dict) else identifier
        url = block.get("url") or page_url
        employment = block.get("employmentType")
        employment = employment[0] if isinstance(employment, list) and employment else employment
        salary = _schema_salary(block)
        valid_through = _iso(block.get("validThrough"))
        out.append(RawPosting(
            source="company_site", source_label="Company Website", external_id=str(ext or url)[:200],
            title=str(block.get("title") or ""), company_name=str(company),
            description=html_to_text(block.get("description")), url=url, apply_url=url, location=location,
            work_arrangement="remote" if remote else None,
            employment_type=_SCHEMA_TYPES.get(str(employment or "").upper()),
            posted_at=_iso(block.get("datePosted")), deadline=valid_through.date() if valid_through else None,
            **{k: v for k, v in salary.items() if v is not None}, raw={"careers_url": page_url}))
    return out


def fetch_careers_page(company: Company) -> list[RawPosting]:
    assert company.careers_url
    return postings_from_jsonld(get_html(company.careers_url), company.careers_url, company.name)


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

BOARD_FETCHERS: dict[str, Callable[[str], list[RawPosting]]] = {
    "greenhouse": fetch_greenhouse, "lever": fetch_lever, "ashby": fetch_ashby,
}


class EmployerSitesSource:
    key = "company_sites"
    label = "Employer websites"

    def _careers_companies(self, db: Session, user: User) -> list[Company]:
        return list(db.scalars(select(Company).where(
            Company.user_id == user.id, Company.careers_url.is_not(None), Company.is_demo.is_(False))))

    def _boards(self) -> list[tuple[str, str]]:
        boards = get_settings().employer_boards or {}
        return [(kind, slug) for kind, slugs in boards.items() if kind in BOARD_FETCHERS for slug in slugs]

    def status(self, db: Session, user: User) -> SourceStatus:
        if self._boards() or self._careers_companies(db, user):
            return SourceStatus(self.key, self.label, "ready", None)
        return SourceStatus(self.key, self.label, "not_connected",
                            "No employer job boards or careers pages are configured yet.")

    def search(self, db: Session, user: User, filters: SearchFilters, *, limit: int = 200) -> list[RawPosting]:
        tasks: list[tuple[str, Callable[[], list[RawPosting]]]] = [
            (f"{kind}:{slug}", lambda k=kind, s=slug: BOARD_FETCHERS[k](s)) for kind, slug in self._boards()]
        tasks += [(f"careers:{c.name}", lambda c=c: fetch_careers_page(c)) for c in self._careers_companies(db, user)]
        if not tasks:
            raise SourceError("No employer job boards or careers pages are set up yet. You can continue with the "
                              "other job sources.", retryable=False)
        postings: list[RawPosting] = []
        failures = 0
        for name, fetch in tasks:
            try:
                postings.extend(fetch())
            except FetchError as exc:
                failures += 1
                log.warning("Employer source %s failed: %s", name, exc)
        if failures == len(tasks):
            raise SourceError(FRIENDLY_ERROR)
        return [p for p in postings if p.title and matches_filters(p, filters)][:limit]
