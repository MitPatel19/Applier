"""Registration, sign-in and session management."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, client_ip, get_current_user
from app.core.config import get_settings
from app.core.errors import AppError, Conflict, Unauthorized
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User, utcnow
from app.schemas.auth import ChangePasswordIn, LoginIn, RegisterIn, SessionOut, UserOut
from app.services import audit, templates_service
from app.services.profile_bundle import ensure_profile_rows
from app.services.rate_limit import login_key, login_limiter

router = APIRouter(prefix="/auth", tags=["auth"])

# Verifying against a throwaway hash when the email is unknown keeps response times similar,
# so sign-in timing does not reveal which emails have accounts.
_DUMMY_HASH = hash_password("applier-timing-equalizer-Password1")


def set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=s.cookie_secure,
        max_age=s.access_token_ttl_minutes * 60,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(key=s.session_cookie_name, path="/", httponly=True, samesite="lax", secure=s.cookie_secure)


def _start_session(response: Response, user: User) -> SessionOut:
    token = create_access_token(user.id, user.token_version, user.role)
    set_session_cookie(response, token)
    return SessionOut(user=UserOut.model_validate(user), access_token=token)


@router.post("/register", response_model=SessionOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: DB) -> SessionOut:
    email = body.email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise Conflict("An account with this email already exists. Try signing in instead.", code="email_taken")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip(),
                last_login_at=utcnow())
    db.add(user)
    db.flush()
    ensure_profile_rows(db, user)
    templates_service.seed_defaults(db, user.id)
    audit.record(db, user.id, "account.created", "Account created", entity_type="user", entity_id=user.id,
                 ip_address=client_ip(request))
    db.commit()
    return _start_session(response, user)


@router.post("/login", response_model=SessionOut)
def login(body: LoginIn, request: Request, response: Response, db: DB) -> SessionOut:
    email = body.email.strip().lower()
    ip = client_ip(request)
    key = login_key(email, ip)
    wait = login_limiter.retry_after(key)
    if wait:
        minutes = max(1, round(wait / 60))
        raise AppError(
            f"Too many sign-in attempts. For your security, please wait about {minutes} minute"
            f"{'s' if minutes != 1 else ''} and try again.",
            code="rate_limited", status_code=429, retryable=True, details={"retry_after_seconds": wait},
        )
    user = db.scalar(select(User).where(User.email == email))
    password_ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not password_ok or not user.is_active:
        login_limiter.record_failure(key)
        raise Unauthorized("Email or password is incorrect.", code="invalid_credentials")
    login_limiter.reset(key)
    user.last_login_at = utcnow()
    audit.record(db, user.id, "account.signed_in", "Signed in", entity_type="user", entity_id=user.id, ip_address=ip)
    db.commit()
    return _start_session(response, user)


@router.post("/logout", status_code=204)
def logout(request: Request, db: DB) -> Response:
    """Always clears the cookie; records the sign-out when the session is still valid."""
    response = Response(status_code=204)
    try:
        user = get_current_user(request, db)
    except AppError:
        user = None
    if user is not None:
        audit.record(db, user.id, "account.signed_out", "Signed out", entity_type="user", entity_id=user.id,
                     ip_address=client_ip(request))
        db.commit()
    clear_session_cookie(response)
    return response


@router.post("/logout-all", status_code=204)
def logout_all(user: CurrentUser, request: Request, db: DB) -> Response:
    user.token_version += 1
    audit.record(db, user.id, "account.signed_out_everywhere", "Signed out of all devices",
                 entity_type="user", entity_id=user.id, ip_address=client_ip(request))
    db.commit()
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, user: CurrentUser, request: Request, db: DB) -> Response:
    if not verify_password(body.current_password, user.password_hash):
        raise AppError("Your current password is incorrect.", code="invalid_password")
    if verify_password(body.new_password, user.password_hash):
        raise AppError("Choose a new password that's different from your current one.", code="password_unchanged")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # revokes every other session
    audit.record(db, user.id, "account.password_changed",
                 "Changed password and signed out other sessions", entity_type="user", entity_id=user.id,
                 ip_address=client_ip(request))
    db.commit()
    response = Response(status_code=204)
    set_session_cookie(response, create_access_token(user.id, user.token_version, user.role))
    return response
