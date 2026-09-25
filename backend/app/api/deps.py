"""Shared FastAPI dependencies: database session, authentication, CSRF and authorization."""

from __future__ import annotations

from typing import Annotated, TypeVar

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.security import decode_access_token
from app.db import Base, get_db
from app.models import User

DB = Annotated[Session, Depends(get_db)]
T = TypeVar("T", bound=Base)

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _token_from_request(request: Request) -> tuple[str | None, bool]:
    """Return (token, from_cookie)."""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip(), False
    return request.cookies.get(get_settings().session_cookie_name), True


def get_current_user(request: Request, db: DB) -> User:
    token, from_cookie = _token_from_request(request)
    if not token:
        raise Unauthorized("Please sign in to continue.")
    payload = decode_access_token(token)
    if not payload:
        raise Unauthorized("Your session has expired. Please sign in again.")
    # Cookie-authenticated state-changing requests must carry the CSRF header, which
    # cross-site forms cannot set (combined with SameSite=Lax cookies).
    s = get_settings()
    if from_cookie and request.method not in _SAFE_METHODS and not request.headers.get(s.csrf_header):
        raise Forbidden("This request was blocked for your security. Please refresh and try again.",
                        code="csrf_failed")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active or user.token_version != payload.get("tv"):
        raise Unauthorized("Your session has expired. Please sign in again.")
    request.state.user_id = user.id
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise Forbidden("Administrator access is required.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def get_owned(db: Session, model: type[T], obj_id: int, user: User, what: str = "item") -> T:
    """Fetch a row owned by ``user`` or raise a friendly 404 (never reveals other users' data)."""
    obj = db.scalar(select(model).where(model.id == obj_id, model.user_id == user.id))  # type: ignore[attr-defined]
    if obj is None:
        raise NotFound(what)
    return obj
