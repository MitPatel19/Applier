from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.crypto import encrypt_str
from app.core.storage import get_storage
from app.db import Base
from app.models import (
    AgentTask,
    AuditLog,
    EmailMessage,
    FollowUp,
    Integration,
    Interview,
    Notification,
    Recruiter,
    Resume,
    User,
    utcnow,
)
from app.services.privacy import _owned_rows_stmt
from tests.conftest import PASSWORD, register
from tests.tracking_helpers import add_profile, make_application


def _fill_account(db, user: User) -> None:
    add_profile(db, user)
    app = make_application(db, user)
    db.add_all([
        Interview(user_id=user.id, application_id=app.id, kind="technical", prep={}, practice_log=[], interviewers=[]),
        FollowUp(user_id=user.id, application_id=app.id, due_at=utcnow()),
        Recruiter(user_id=user.id, name="Priya Nair", company="Borealis Software"),
        Notification(user_id=user.id, type="agent", title="Hello"),
        EmailMessage(user_id=user.id, application_id=app.id, provider_message_id="gmail:1", from_address="a@b.c",
                     subject="Thanks for applying", category="confirmation", received_at=utcnow()),
        Integration(user_id=user.id, provider="gmail", status="connected", scopes=["gmail.readonly"],
                    access_token_enc=encrypt_str("ya29.secret-access"), refresh_token_enc=encrypt_str("1//refresh"),
                    oauth_state="state-123"),
        AgentTask(user_id=user.id, kind="search", title="Search", steps=[], params={}, result={}),
        Resume(user_id=user.id, name="Main", content={}, file_key=f"u{user.id}/abc.enc"),
    ])
    db.commit()


def _owned_row_count(db, user_id: int) -> int:
    total = 0
    for table in Base.metadata.sorted_tables:
        stmt = _owned_rows_stmt(table, user_id)
        if stmt is not None:
            total += len(db.execute(stmt).all())
    return total


def test_export_contains_personal_data_but_no_secrets(auth_client: TestClient, user, db):
    _fill_account(db, user)
    r = auth_client.get("/api/users/me/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment; filename=\"applier-data-export-")
    data = r.json()
    assert data["users"][0]["email"] == "mit@example.com"
    assert "password_hash" not in data["users"][0]
    assert len(data["experiences"]) == 1 and len(data["applications"]) == 1
    assert len(data["job_sources"]) == 1  # child rows are included via their parent
    integration = data["integrations"][0]
    assert integration["provider"] == "gmail"
    for secret_field in ("access_token_enc", "refresh_token_enc", "oauth_state"):
        assert secret_field not in integration
    assert "file_key" not in data["resumes"][0]
    raw = r.text
    assert "ya29.secret-access" not in raw and "$argon2" not in raw and "state-123" not in raw
    assert db.scalar(select(AuditLog).where(AuditLog.action == "account.exported")) is not None


def test_delete_account_requires_password_and_confirmation(auth_client: TestClient):
    wrong_confirm = auth_client.request("DELETE", "/api/users/me", json={"password": PASSWORD, "confirm": "delete"})
    assert wrong_confirm.status_code == 400
    wrong_password = auth_client.request("DELETE", "/api/users/me",
                                         json={"password": "Nope-123-Aa", "confirm": "DELETE"})
    assert wrong_password.status_code == 400
    assert auth_client.get("/api/auth/me").status_code == 200


def test_delete_account_cascades_every_row_and_file(auth_client: TestClient, user, db, client):
    _fill_account(db, user)
    other = TestClient(client.app)
    other_token = register(other, email="other@example.com", name="Other Person")["access_token"]
    other_user = db.scalar(select(User).where(User.email == "other@example.com"))
    _fill_account(db, other_user)
    user_id, other_id = user.id, other_user.id
    storage = get_storage()
    storage.put(user_id, "resume.pdf", b"%PDF-1.4 secret")
    assert _owned_row_count(db, user_id) > 20
    other_before = _owned_row_count(db, other_id)

    r = auth_client.request("DELETE", "/api/users/me", json={"password": PASSWORD, "confirm": "DELETE"})
    assert r.status_code == 204
    db.expire_all()
    assert _owned_row_count(db, user_id) == 0
    assert _owned_row_count(db, other_id) == other_before
    assert not (storage.files.root / f"u{user_id}").exists()  # type: ignore[attr-defined]
    assert auth_client.get("/api/auth/me").status_code == 401
    other.headers.update({"Authorization": f"Bearer {other_token}"})
    assert other.get("/api/auth/me").status_code == 200


def test_privacy_overview(auth_client: TestClient, user, db):
    _fill_account(db, user)
    r = auth_client.get("/api/users/me/privacy")
    assert r.status_code == 200
    data = r.json()
    categories = {c["category"]: c for c in data["stored_data"]}
    assert categories["Account"]["count"] == 1
    assert categories["Job-related emails"]["count"] == 1
    assert "never stored" in categories["Job-related emails"]["description"]
    assert categories["Profile"]["count"] == 1 + 1 + 6  # experience, project, skills
    assert data["integrations"] == [{"provider": "gmail", "name": "Gmail", "status": "connected", "account_label": None,
                                     "scopes": ["gmail.readonly"]}]
    assert "argon2" in data["encryption"] and "encrypted at rest" in data["encryption"]
    assert "Deleting your account" in data["retention"]
    json.dumps(data)
