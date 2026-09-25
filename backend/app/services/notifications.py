"""In-app notifications, respecting the user's notification preferences."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Notification, UserPreference

DEFAULT_NOTIFICATION_SETTINGS: dict = {
    "in_app": True,
    "email": False,
    "browser": False,
    "types": {
        "excellent_match": True,
        "deadline": True,
        "interview": True,
        "recruiter_response": True,
        "follow_up": True,
        "status_change": True,
        "resume_issue": True,
        "missing_info": True,
        "agent": True,
    },
}


def notification_settings(db: Session, user_id: int) -> dict:
    prefs = db.query(UserPreference).filter_by(user_id=user_id).one_or_none()
    merged = {**DEFAULT_NOTIFICATION_SETTINGS, **((prefs.notification_settings if prefs else None) or {})}
    merged["types"] = {**DEFAULT_NOTIFICATION_SETTINGS["types"], **merged.get("types", {})}
    return merged


def notify(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    *,
    link: str | None = None,
    priority: str = "normal",
) -> Notification | None:
    """Create a notification unless the user disabled this type. Caller commits.

    Email delivery (when enabled) is performed by the notification dispatcher, which
    picks up rows with ``emailed_at IS NULL``.
    """
    settings = notification_settings(db, user_id)
    if not settings.get("in_app", True) and not settings.get("email"):
        return None
    if type in settings["types"] and not settings["types"][type]:
        return None
    n = Notification(user_id=user_id, type=type, title=title[:300], body=body, link=link, priority=priority)
    db.add(n)
    return n
