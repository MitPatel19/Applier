"""In-app notifications."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, select, update

from app.api.deps import DB, CurrentUser, get_owned
from app.models import Notification, utcnow
from app.schemas.tracking import NotificationListOut, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def list_notifications(user: CurrentUser, db: DB, unread: bool | None = None,
                       limit: int = Query(default=50, ge=1, le=200)) -> NotificationListOut:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread is True:
        stmt = stmt.where(Notification.read_at.is_(None))
    elif unread is False:
        stmt = stmt.where(Notification.read_at.is_not(None))
    items = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit))
    unread_count = db.scalar(select(func.count(Notification.id)).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return NotificationListOut(items=[NotificationOut.model_validate(n) for n in items], unread_count=unread_count)


@router.post("/read-all", status_code=204)
def read_all(user: CurrentUser, db: DB) -> Response:
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=utcnow()))
    db.commit()
    return Response(status_code=204)


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, user: CurrentUser, db: DB) -> Response:
    notification = get_owned(db, Notification, notification_id, user, "notification")
    if notification.read_at is None:
        notification.read_at = utcnow()
        db.commit()
    return Response(status_code=204)


@router.delete("/{notification_id}", status_code=204)
def delete_notification(notification_id: int, user: CurrentUser, db: DB) -> Response:
    db.delete(get_owned(db, Notification, notification_id, user, "notification"))
    db.commit()
    return Response(status_code=204)
