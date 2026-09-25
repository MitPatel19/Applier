"""Audit history: every meaningful action by the user or the agent, newest first."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.models import AuditLog
from app.schemas.tracking import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def list_audit(
    db: DB,
    user: CurrentUser,
    entity_type: str | None = Query(default=None, max_length=40),
    entity_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    before_id: int | None = Query(default=None, ge=1),
) -> list[AuditLog]:
    stmt = select(AuditLog).where(AuditLog.user_id == user.id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if before_id is not None:
        stmt = stmt.where(AuditLog.id < before_id)
    return list(db.scalars(stmt.order_by(AuditLog.id.desc()).limit(limit)))
