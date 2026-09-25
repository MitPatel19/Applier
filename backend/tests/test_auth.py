from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models import AuditLog, Template, User
from app.services.rate_limit import FailureLimiter, login_limiter
from tests.conftest import PASSWORD, register

CSRF = {"X-Requested-With": "applier"}


def _login(client: TestClient, password: str):
    return client.post("/api/auth/login", json={"email": "mit@example.com", "password": password})


@pytest.fixture(autouse=True)
def _reset_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def test_register_sets_secure_cookie_and_seeds_account(client: TestClient, db):
    payload = {"email": "Mit@Example.com", "password": PASSWORD, "full_name": "Mit Patel"}
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "mit@example.com"
    assert body["access_token"] and body["token_type"] == "bearer"
    cookie = r.headers["set-cookie"].lower()
    assert "applier_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie
    user = db.query(User).filter_by(email="mit@example.com").one()
    assert user.password_hash != PASSWORD and user.password_hash.startswith("$argon2")
    assert db.query(Template).filter_by(user_id=user.id).count() >= 10
    assert db.query(AuditLog).filter_by(user_id=user.id, action="account.created").one().summary == "Account created"


def test_register_duplicate_email_is_friendly_409(client: TestClient):
    register(client)
    r = client.post("/api/auth/register", json={"email": "MIT@example.com", "password": PASSWORD, "full_name": "X"})
    assert r.status_code == 409
    assert r.json()["error"]["message"] == "An account with this email already exists. Try signing in instead."


def test_register_rejects_weak_password(client: TestClient):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "password": "short", "full_name": "A"})
    assert r.status_code == 422


def test_login_me_and_logout(client: TestClient, db):
    register(client)
    client.cookies.clear()
    bad = client.post("/api/auth/login", json={"email": "mit@example.com", "password": "Wrong-password1"})
    assert bad.status_code == 401
    assert bad.json()["error"]["message"] == "Email or password is incorrect."
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert unknown.json()["error"]["message"] == "Email or password is incorrect."

    r = client.post("/api/auth/login", json={"email": "MIT@example.com", "password": PASSWORD})
    assert r.status_code == 200
    me = client.get("/api/auth/me")  # cookie auth
    assert me.status_code == 200 and me.json()["email"] == "mit@example.com"
    assert me.json()["last_login_at"] is not None
    assert db.query(AuditLog).filter_by(action="account.signed_in").count() == 1

    out = client.post("/api/auth/logout", headers=CSRF)
    assert out.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_cookie_auth_requires_csrf_header_for_writes(client: TestClient):
    register(client)  # browser-style: session cookie only
    blocked = client.post("/api/auth/logout-all")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "csrf_failed"
    assert client.patch("/api/users/me", json={"full_name": "Mit P"}).status_code == 403
    ok = client.patch("/api/users/me", json={"full_name": "Mit P"}, headers=CSRF)
    assert ok.status_code == 200 and ok.json()["full_name"] == "Mit P"


def test_login_rate_limited_after_five_failures(client: TestClient):
    register(client)
    for _ in range(5):
        assert _login(client, "Nope-nope-1A").status_code == 401
    r = client.post("/api/auth/login", json={"email": "mit@example.com", "password": PASSWORD})
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "rate_limited" and err["retryable"] is True
    assert "wait" in err["message"] and err["details"]["retry_after_seconds"] > 0


def test_successful_login_resets_failure_count(client: TestClient):
    register(client)
    for _ in range(4):
        client.post("/api/auth/login", json={"email": "mit@example.com", "password": "Nope-nope-1A"})
    assert client.post("/api/auth/login", json={"email": "mit@example.com", "password": PASSWORD}).status_code == 200
    for _ in range(4):
        client.post("/api/auth/login", json={"email": "mit@example.com", "password": "Nope-nope-1A"})
    assert client.post("/api/auth/login", json={"email": "mit@example.com", "password": PASSWORD}).status_code == 200


def test_limiter_window_expires(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr("app.services.rate_limit.time.monotonic", lambda: clock[0])
    limiter = FailureLimiter(max_failures=2, window_seconds=60)
    limiter.record_failure("k")
    limiter.record_failure("k")
    assert limiter.retry_after("k") == 60
    clock[0] += 61
    assert limiter.retry_after("k") == 0


def test_logout_all_revokes_every_token(client: TestClient):
    token = register(client)["access_token"]
    client.cookies.clear()
    auth = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=auth).status_code == 200
    assert client.post("/api/auth/logout-all", headers=auth).status_code == 204
    r = client.get("/api/auth/me", headers=auth)
    assert r.status_code == 401


def test_change_password_revokes_other_sessions_and_reissues_cookie(client: TestClient):
    token = register(client)["access_token"]
    other_device = {"Authorization": f"Bearer {token}"}
    wrong = client.post("/api/auth/change-password", headers=CSRF,
                        json={"current_password": "Wrong-password1", "new_password": "N3w-Password-ok"})
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "invalid_password"

    r = client.post("/api/auth/change-password", headers=CSRF,
                    json={"current_password": PASSWORD, "new_password": "N3w-Password-ok"})
    assert r.status_code == 204
    assert "applier_session=" in r.headers["set-cookie"]
    assert client.get("/api/auth/me").status_code == 200  # this browser keeps working (new cookie)
    client.cookies.clear()
    assert client.get("/api/auth/me", headers=other_device).status_code == 401
    assert _login(client, PASSWORD).status_code == 401
    assert _login(client, "N3w-Password-ok").status_code == 200
