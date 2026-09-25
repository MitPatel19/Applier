"""Reusable templates for cover letters, common answers, follow-ups and networking messages."""

from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, get_owned
from app.models import Application, Job, Recruiter, Template
from app.schemas.tracking import (
    TemplateIn,
    TemplateKind,
    TemplateOut,
    TemplateRenderIn,
    TemplateRenderOut,
    TemplateUpdate,
)
from app.services import audit, templates_service
from app.services.profile_bundle import ensure_profile_rows

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
def list_templates(user: CurrentUser, db: DB, kind: TemplateKind | None = None) -> list[Template]:
    if templates_service.seed_defaults(db, user.id):
        db.commit()
    stmt = select(Template).where(Template.user_id == user.id)
    if kind:
        stmt = stmt.where(Template.kind == kind)
    return list(db.scalars(stmt.order_by(Template.kind, Template.is_default.desc(), Template.name)))


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateIn, user: CurrentUser, db: DB) -> Template:
    template = Template(user_id=user.id, **body.model_dump())
    db.add(template)
    db.flush()
    audit.record(db, user.id, "template.created", f"Created template “{template.name}”",
                 entity_type="template", entity_id=template.id)
    db.commit()
    return template


@router.patch("/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, body: TemplateUpdate, user: CurrentUser, db: DB) -> Template:
    template = get_owned(db, Template, template_id, user, "template")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    audit.record(db, user.id, "template.updated", f"Updated template “{template.name}”",
                 entity_type="template", entity_id=template.id)
    db.commit()
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, user: CurrentUser, db: DB) -> Response:
    template = get_owned(db, Template, template_id, user, "template")
    audit.record(db, user.id, "template.deleted", f"Deleted template “{template.name}”",
                 entity_type="template", entity_id=template.id)
    db.delete(template)
    db.commit()
    return Response(status_code=204)


@router.post("/{template_id}/render", response_model=TemplateRenderOut)
def render_template(template_id: int, body: TemplateRenderIn, user: CurrentUser, db: DB) -> TemplateRenderOut:
    template = get_owned(db, Template, template_id, user, "template")
    profile, _ = ensure_profile_rows(db, user)
    app = get_owned(db, Application, body.application_id, user, "application") if body.application_id else None
    job = get_owned(db, Job, body.job_id, user, "job") if body.job_id else None
    rec = get_owned(db, Recruiter, body.recruiter_id, user, "contact") if body.recruiter_id else None
    ctx = templates_service.RenderContext(user=user, profile=profile, application=app, job=job, recruiter=rec)
    subject, text, unresolved = templates_service.render(db, template, ctx)
    return TemplateRenderOut(subject=subject, body=text, unresolved=unresolved)
