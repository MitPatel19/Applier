"""Personal data export, full account deletion and the privacy overview.

Export and deletion are driven by the schema itself: every table that carries ``user_id``
(or hangs off a table that does) is included, so new tables are covered automatically.
"""

from __future__ import annotations

import enum
import json
import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import Table, delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.storage import get_storage
from app.db import Base
from app.models import (
    AgentTask,
    Application,
    AuditLog,
    Company,
    CoverLetter,
    Education,
    EmailMessage,
    Experience,
    FollowUp,
    Integration,
    Interview,
    Job,
    Notification,
    Project,
    Recruiter,
    Resume,
    ResumeVersion,
    Skill,
    Template,
    User,
    utcnow,
)
from app.schemas.auth import PrivacyIntegration, PrivacyOut, StoredDataCategory

log = logging.getLogger("applier.privacy")

# Secrets and internal bookkeeping that never leave the server, not even in the user's own export.
EXPORT_EXCLUDED_COLUMNS = frozenset({
    "password_hash", "token_version", "access_token_enc", "refresh_token_enc", "oauth_state", "file_key",
})


# Encrypted document blobs (downloadable individually from the app) are not inlined in the export.
EXPORT_EXCLUDED_TABLES = frozenset({"stored_files"})


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return value.value
    return str(value)


def _owned_rows_stmt(table: Table, user_id: int):
    """SELECT for the rows of ``table`` belonging to ``user_id`` (None if the table isn't user data)."""
    if table.name == User.__tablename__:
        return select(table).where(table.c.id == user_id)
    if table.name in EXPORT_EXCLUDED_TABLES:
        return None
    if "user_id" in table.c:
        return select(table).where(table.c.user_id == user_id)
    for fk in table.foreign_keys:
        parent = fk.column.table
        if "user_id" in parent.c:
            return select(table).where(fk.parent.in_(select(parent.c.id).where(parent.c.user_id == user_id)))
    return None


def export_user_data(db: Session, user: User) -> dict[str, Any]:
    """Every personal record for ``user``, keyed by table name (secrets excluded)."""
    data: dict[str, Any] = {
        "exported_at": utcnow().isoformat(),
        "format": "Applier personal data export v1",
        "note": "Passwords, OAuth access tokens and internal storage keys are intentionally excluded.",
    }
    for table in Base.metadata.sorted_tables:
        stmt = _owned_rows_stmt(table, user.id)
        if stmt is None:
            continue
        rows = db.execute(stmt).mappings().all()
        data[table.name] = [
            {k: v for k, v in row.items() if k not in EXPORT_EXCLUDED_COLUMNS} for row in rows
        ]
    return data


def export_json(db: Session, user: User) -> str:
    return json.dumps(export_user_data(db, user), default=_json_default, indent=2, ensure_ascii=False)


def delete_account(db: Session, user: User) -> None:
    """Permanently delete the user's stored files and every database row they own.

    All user-owned tables reference ``users.id`` with ``ON DELETE CASCADE`` (directly or through
    their parent), so deleting the user row removes everything in one statement.
    """
    user_id = user.id
    get_storage().delete_user(user_id)
    db.execute(delete(User).where(User.id == user_id))
    db.commit()
    log.info("Account %s deleted with all personal data", user_id)


def _count(db: Session, *models: type[Base], user_id: int) -> int:
    return sum(
        db.scalar(select(func.count()).select_from(m).where(m.user_id == user_id)) or 0  # type: ignore[attr-defined]
        for m in models
    )


_CATEGORIES: list[tuple[str, tuple[type[Base], ...], str]] = [
    ("Profile", (Education, Experience, Skill, Project),
     "Work history, education, skills and projects you entered or imported, plus your contact details and "
     "job preferences."),
    ("Resumes & cover letters", (Resume, ResumeVersion, CoverLetter),
     "Uploaded resumes (files are encrypted at rest), tailored resume versions and cover letters."),
    ("Jobs & companies", (Job, Company),
     "Job postings found for you, their match scores and company research notes."),
    ("Applications", (Application,),
     "Application records, prepared answers, status history and submission details."),
    ("Interviews, follow-ups & contacts", (Interview, FollowUp, Recruiter),
     "Interview schedules and preparation, follow-up reminders and networking contacts you added."),
    ("Job-related emails", (EmailMessage,),
     "Only emails detected as job-related: sender, subject, a short snippet and the detected category. "
     "Full message bodies and all other email are never stored."),
    ("Notifications & templates", (Notification, Template),
     "In-app notifications and your reusable message templates."),
    ("Activity history", (AuditLog, AgentTask),
     "A record of every action you and the agent took, so you can review exactly what happened."),
]


def privacy_overview(db: Session, user: User) -> PrivacyOut:
    from app.services.integrations.providers import PROVIDERS

    stored = [StoredDataCategory(
        category="Account", count=1,
        description="Your name, email address and a one-way password hash (argon2). Your password itself is "
                    "never stored.")]
    stored += [StoredDataCategory(category=label, count=_count(db, *models, user_id=user.id), description=desc)
               for label, models, desc in _CATEGORIES]
    rows = db.scalars(select(Integration).where(Integration.user_id == user.id,
                                                Integration.status.in_(("connected", "pending", "error"))))
    integrations = [
        PrivacyIntegration(provider=row.provider, name=PROVIDERS[row.provider].name if row.provider in PROVIDERS
                           else row.provider, status=row.status, account_label=row.account_label,
                           scopes=row.scopes or [])
        for row in rows
    ]
    secure_cookie = " and is only sent over HTTPS" if get_settings().cookie_secure else ""
    return PrivacyOut(
        stored_data=stored,
        integrations=integrations,
        retention=(
            "Your data is kept only while your account exists. Disconnecting an integration deletes its access "
            "tokens immediately. Deleting your account permanently removes every record and stored file from "
            "Applier's database and document storage; this can't be undone."
        ),
        encryption=(
            "Passwords are hashed with argon2 and never stored in readable form. Integration access tokens and "
            "uploaded documents are encrypted at rest (Fernet: AES-128 with HMAC-SHA256). Your session cookie is "
            f"httpOnly and SameSite=Lax{secure_cookie}, so page scripts and other sites can't read or reuse it."
        ),
    )
