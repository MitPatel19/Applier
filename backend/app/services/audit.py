"""Audit trail: every meaningful action by the user or the agent is recorded here."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    user_id: int,
    action: str,
    summary: str,
    *,
    actor: str = "user",
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Add an audit entry to the session (caller commits).

    ``action`` is a dotted verb such as ``job.discovered``, ``resume.customized``,
    ``application.approved`` or ``application.submitted``. ``summary`` is the
    human-readable sentence shown in the audit history.
    """
    entry = AuditLog(
        user_id=user_id,
        actor=actor,
        action=action,
        summary=summary[:500],
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
