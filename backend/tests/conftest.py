"""Shared test fixtures. Each test gets a fresh SQLite database and an authenticated client."""

from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="applier-test-")
os.environ.setdefault("APPLIER_ENVIRONMENT", "test")
os.environ.setdefault("APPLIER_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("APPLIER_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("APPLIER_SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256-signing")
os.environ.setdefault("APPLIER_SCHEDULER_ENABLED", "false")
os.environ.setdefault("APPLIER_DEMO_MODE", "true")
os.environ.pop("APPLIER_ANTHROPIC_API_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "Str0ngPassword!"


@pytest.fixture(autouse=True)
def _fresh_db():
    from app import models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def register(client: TestClient, email: str = "mit@example.com", name: str = "Mit Patel") -> dict:
    r = client.post("/api/auth/register", json={"email": email, "password": PASSWORD, "full_name": name})
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """A client authenticated via Bearer token (no CSRF header needed)."""
    data = register(client)
    client.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return client


@pytest.fixture
def user(auth_client, db):
    from app.models import User

    return db.query(User).filter_by(email="mit@example.com").one()
