"""Companies: the user's company records, related jobs/applications, notes and research."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, get_owned
from app.api.serializers import company_out, job_out
from app.models import Application, Company, Job
from app.schemas.jobs import CompanyOut, CompanyUpdate
from app.services import audit
from app.services.company_research import research_company

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyOut])
def list_companies(db: DB, user: CurrentUser, q: str | None = Query(default=None, max_length=200)) -> list[CompanyOut]:
    stmt = select(Company).where(Company.user_id == user.id)
    if q and q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        stmt = stmt.where(or_(Company.name.ilike(pattern, escape="\\"), Company.industry.ilike(pattern, escape="\\")))
    companies = db.scalars(stmt.order_by(Company.name)).all()
    counts = dict(db.execute(
        select(Job.company_id, func.count(Job.id)).where(
            Job.user_id == user.id, Job.is_open.is_(True), Job.is_hidden.is_(False), Job.company_id.is_not(None))
        .group_by(Job.company_id)).all())
    out = []
    for company in companies:
        item = CompanyOut.model_validate(company)
        item.open_jobs = counts.get(company.id, 0)
        out.append(item)
    return sorted(out, key=lambda c: (-c.open_jobs, c.name.lower()))


@router.get("/{company_id}")
def get_company(company_id: int, db: DB, user: CurrentUser) -> dict[str, Any]:
    company = get_owned(db, Company, company_id, user, "company")
    jobs = db.scalars(select(Job).where(Job.user_id == user.id, Job.company_id == company.id)
                      .options(selectinload(Job.sources), selectinload(Job.match))
                      .order_by(Job.is_hidden, Job.first_seen_at.desc())).all()
    job_ids = [j.id for j in jobs]
    conditions = [func.lower(Application.company_name) == company.name.lower()]
    if job_ids:
        conditions.append(Application.job_id.in_(job_ids))
    apps = db.scalars(select(Application).where(Application.user_id == user.id, or_(*conditions))
                      .order_by(Application.created_at.desc())).all()
    by_job = {a.job_id: a for a in apps if a.job_id}
    return {
        "company": company_out(db, company),
        "jobs": [job_out(db, j, by_job.get(j.id), lookup_application=False) for j in jobs],
        "applications": [{"id": a.id, "job_title": a.job_title, "status": a.status.value} for a in apps],
    }


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(company_id: int, body: CompanyUpdate, db: DB, user: CurrentUser) -> CompanyOut:
    company = get_owned(db, Company, company_id, user, "company")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(company, key, value)
    audit.record(db, user.id, "company.updated", f"You updated details for {company.name}", entity_type="company",
                 entity_id=company.id, details={"fields": sorted(data)})
    db.commit()
    out = company_out(db, company)
    assert out is not None
    return out


@router.post("/{company_id}/research", response_model=CompanyOut)
def research(company_id: int, db: DB, user: CurrentUser) -> CompanyOut:
    company = get_owned(db, Company, company_id, user, "company")
    research_company(db, company, actor="user")
    db.commit()
    out = company_out(db, company)
    assert out is not None
    return out
