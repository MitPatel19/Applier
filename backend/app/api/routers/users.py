"""Account details, personal data export, account deletion and privacy overview."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.api.deps import DB, CurrentUser, client_ip
from app.api.routers.auth import clear_session_cookie
from app.core.errors import AppError
from app.core.security import verify_password
from app.models import User, utcnow
from app.schemas.auth import DeleteAccountIn, PrivacyOut, UserOut, UserUpdate
from app.services import audit, privacy

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DB) -> User:
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "full_name" in changes:
        changes["full_name"] = changes["full_name"].strip()
    for field, value in changes.items():
        setattr(user, field, value)
    if changes:
        audit.record(db, user.id, "account.updated", "Updated account details", entity_type="user",
                     entity_id=user.id, details={"fields": sorted(changes)})
    db.commit()
    return user


@router.get("/me/export")
def export_me(user: CurrentUser, request: Request, db: DB) -> Response:
    content = privacy.export_json(db, user)
    audit.record(db, user.id, "account.exported", "Downloaded a copy of all personal data",
                 entity_type="user", entity_id=user.id, ip_address=client_ip(request))
    db.commit()
    filename = f"applier-data-export-{utcnow():%Y-%m-%d}.json"
    return Response(content=content, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.delete("/me", status_code=204)
def delete_me(body: DeleteAccountIn, user: CurrentUser, db: DB) -> Response:
    if body.confirm != "DELETE":
        raise AppError('Type DELETE (in capital letters) to confirm that you want to delete your account.',
                       code="confirmation_required")
    if not verify_password(body.password, user.password_hash):
        raise AppError("Your password is incorrect, so your account was not deleted.", code="invalid_password")
    privacy.delete_account(db, user)
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


@router.get("/me/privacy", response_model=PrivacyOut)
def privacy_info(user: CurrentUser, db: DB) -> PrivacyOut:
    return privacy.privacy_overview(db, user)
