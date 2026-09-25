"""Company records and lightweight, clearly-sourced company research.

Facts are labelled by how much you can rely on them:

- ``verified`` — stated by the company itself (its job postings, its own website's title/description,
  or, for demo companies, the sample company profile).
- ``inferred`` — derived by Applier, e.g. a tech stack inferred from the skills its postings ask for.
- ``opinion`` — third-party views (reviews, news commentary). Applier has no such source by default;
  existing opinion facts are preserved so an integration can add them later.

Network access is optional and non-fatal: the website is fetched only when robots.txt allows it,
with a short timeout.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company, Job, utcnow
from app.services import audit
from app.services.dedup import normalize_company
from app.services.sources.demo import demo_company_profile
from app.services.sources.web import FetchError, get_html, page_title_and_description

log = logging.getLogger("applier.company_research")

_COMPANY_FIELDS = ("industry", "website", "headquarters", "size", "careers_url", "description")
_LIST_FIELDS = ("locations", "products", "tech_stack", "benefits")


def _fill(company: Company, fields: dict[str, Any]) -> None:
    """Fill empty fields only — never overwrite what the user or an earlier source set."""
    for key in _COMPANY_FIELDS:
        value = fields.get(key)
        if value and not getattr(company, key):
            setattr(company, key, value)
    for key in _LIST_FIELDS:
        value = fields.get(key)
        if value and not getattr(company, key):
            setattr(company, key, list(value))


def get_or_create_company(db: Session, user_id: int, name: str, **fields: Any) -> Company:
    """The user's company record for ``name`` (matched by normalized name), created if needed. Caller commits."""
    normalized = normalize_company(name)[:200]
    company = db.scalar(select(Company).where(Company.user_id == user_id, Company.normalized_name == normalized))
    demo = demo_company_profile(name)
    if company is None:
        company = Company(user_id=user_id, name=(demo or {}).get("name") or name.strip()[:200],
                          normalized_name=normalized, locations=[], products=[], tech_stack=[], benefits=[], facts=[],
                          is_demo=bool(demo))
        db.add(company)
        db.flush()
    _fill(company, {k: v for k, v in fields.items() if v is not None})
    if demo:
        _fill(company, demo)
    return company


def _fact(text: str, kind: str, source: str, source_url: str | None = None) -> dict[str, Any]:
    return {"text": text, "kind": kind, "source": source, "source_url": source_url,
            "as_of": utcnow().date().isoformat()}


def _posting_facts(company: Company, jobs: list[Job]) -> list[dict[str, Any]]:
    if not jobs:
        return []
    facts: list[dict[str, Any]] = []
    titles = list(dict.fromkeys(j.title for j in jobs))
    source_url = next((s.url for j in jobs for s in j.sources if s.url), None)
    facts.append(_fact(f"Currently hiring for {len(titles)} role{'s' if len(titles) != 1 else ''}: "
                       f"{', '.join(titles[:5])}{'…' if len(titles) > 5 else ''}", "verified", "Job postings",
                       source_url))
    locations = list(dict.fromkeys(j.location for j in jobs if j.location))
    if locations:
        facts.append(_fact(f"Posts jobs in {', '.join(locations[:5])}", "verified", "Job postings"))
    arrangements = Counter(j.work_arrangement for j in jobs if j.work_arrangement)
    if arrangements:
        described = ", ".join(f"{n} {a}" for a, n in arrangements.most_common())
        facts.append(_fact(f"Work arrangements in current postings: {described}", "verified", "Job postings"))
    salaries = [j for j in jobs if j.salary_min or j.salary_max]
    if salaries:
        facts.append(_fact(f"{len(salaries)} of {len(jobs)} postings list a salary range", "verified", "Job postings"))
    skills = Counter(s for j in jobs for s in ((j.requirements or {}).get("technologies") or []))
    if skills:
        top = [s for s, _ in skills.most_common(8)]
        facts.append(_fact(f"Likely tech stack (from the skills its postings ask for): {', '.join(top)}", "inferred",
                           "Applier analysis of job postings"))
    return facts


def _website_facts(company: Company) -> list[dict[str, Any]]:
    """Title/description from the company's own homepage, when robots.txt allows."""
    url = company.website
    if not url or company.is_demo:
        return []
    host = urlparse(url).netloc
    if not host or host.endswith("example.com"):
        return []
    try:
        title, description = page_title_and_description(get_html(url))
    except FetchError as exc:
        log.info("Company website not fetched for %s: %s", host, exc)
        return []
    facts = []
    if title:
        facts.append(_fact(f"Website title: {title}", "verified", "Company website", url))
    if description:
        facts.append(_fact(description, "verified", "Company website", url))
        if not company.description:
            company.description = description
    return facts


def _profile_facts(company: Company) -> list[dict[str, Any]]:
    source = "Company profile (sample data)" if company.is_demo else "Company profile"
    facts = []
    for label, value in (("Industry", company.industry), ("Company size", company.size),
                         ("Headquarters", company.headquarters)):
        if value and value != "Unknown":
            facts.append(_fact(f"{label}: {value}", "verified", source, company.website))
    if company.products:
        facts.append(_fact(f"Products: {', '.join(company.products)}", "verified", source, company.website))
    return facts


def research_company(db: Session, company: Company, *, actor: str = "agent") -> Company:
    """Refresh a company's profile and labelled facts from its postings, profile and website. Caller commits."""
    jobs = list(db.scalars(select(Job).where(Job.user_id == company.user_id, Job.company_id == company.id)))
    if demo := demo_company_profile(company.name):
        _fill(company, demo)
    skills = Counter(s for j in jobs for s in ((j.requirements or {}).get("technologies") or []))
    company.tech_stack = list(dict.fromkeys((company.tech_stack or []) + [s for s, _ in skills.most_common(12)]))
    benefits = [b for j in jobs for b in ((j.requirements or {}).get("benefits") or [])]
    company.benefits = list(dict.fromkeys((company.benefits or []) + benefits))[:15]
    company.locations = list(dict.fromkeys((company.locations or []) + [j.location for j in jobs if j.location]))[:15]

    opinions = [f for f in company.facts or [] if f.get("kind") == "opinion"]
    website = _website_facts(company)
    company.facts = _profile_facts(company) + _posting_facts(company, jobs) + website + opinions
    company.researched_at = utcnow()
    audit.record(db, company.user_id, "company.researched",
                 f"{'Agent' if actor == 'agent' else 'You'} researched {company.name}: {len(company.facts)} facts "
                 f"from {len(jobs)} posting{'s' if len(jobs) != 1 else ''}"
                 f"{' and the company website' if website else ''}",
                 actor=actor, entity_type="company", entity_id=company.id,
                 details={"facts": len(company.facts), "jobs": len(jobs)})
    return company
