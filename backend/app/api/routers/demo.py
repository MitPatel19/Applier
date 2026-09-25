"""Demo data (available only when ``APPLIER_DEMO_MODE`` is enabled)."""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.api.deps import DB, CurrentUser
from app.core.config import get_settings
from app.core.errors import Forbidden
from app.schemas.common import Message
from app.services import demo_seed

router = APIRouter(prefix="/demo", tags=["demo"])


def _require_demo_mode() -> None:
    if not get_settings().demo_mode:
        raise Forbidden("Demo data isn't available on this server.", code="demo_disabled")


@router.post("/seed", response_model=Message)
def seed(user: CurrentUser, db: DB) -> Message:
    _require_demo_mode()
    return Message(message=demo_seed.seed_demo(db, user))


@router.delete("", status_code=204)
def clear(user: CurrentUser, db: DB) -> Response:
    """Always allowed, so demo rows can be removed even after demo mode is switched off."""
    demo_seed.remove_demo(db, user)
    return Response(status_code=204)
