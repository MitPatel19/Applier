from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.crypto import decrypt_str
from app.models import (
    AgentTask,
    Application,
    ApplicationStatus,
    AuditLog,
    EmailMessage,
    Integration,
    Notification,
)
from app.services import email_sync
from app.services.integrations import oauth
from tests.tracking_helpers import make_application, make_job


def _start(client: TestClient) -> str:
    """Begin connecting Gmail and return the OAuth ``state`` from the authorize URL."""
    url = client.post("/api/integrations/gmail/connect").json()["authorize_url"]
    return parse_qs(urlparse(url).query)["state"][0]


@pytest.fixture
def google_configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "google-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "google-client-secret")


def test_lists_all_providers_with_scope_explanations(auth_client: TestClient):
    items = {i["provider"]: i for i in auth_client.get("/api/integrations").json()}
    assert set(items) == {"linkedin", "indeed", "gmail", "outlook", "google_calendar", "microsoft_calendar"}
    assert all(i["status"] == "unavailable" and i["available"] is False for i in items.values())
    assert items["linkedin"]["scopes"] == ["openid", "profile", "email"]
    assert "partner" in items["linkedin"]["availability_note"] and "partner" in items["indeed"]["availability_note"]
    assert items["gmail"]["scopes"] == ["https://www.googleapis.com/auth/gmail.readonly"]
    gmail_explanation = items["gmail"]["scope_explanations"][0]
    assert "only" in gmail_explanation and "job-related" in gmail_explanation
    assert items["outlook"]["scopes"] == ["Mail.Read", "offline_access"]
    assert items["google_calendar"]["scopes"] == ["https://www.googleapis.com/auth/calendar.events"]
    assert "Calendars.ReadWrite" in items["microsoft_calendar"]["scopes"]


def test_connect_unavailable_provider_is_friendly_400(auth_client: TestClient):
    r = auth_client.post("/api/integrations/gmail/connect")
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "integration_unavailable" and "isn't set up on this server" in err["message"]
    assert auth_client.post("/api/integrations/myspace/connect").status_code == 404


def test_connect_builds_authorize_url_with_state(auth_client: TestClient, user, db, google_configured):
    r = auth_client.post("/api/integrations/gmail/connect")
    assert r.status_code == 200
    url = urlparse(r.json()["authorize_url"])
    params = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert params["scope"] == ["https://www.googleapis.com/auth/gmail.readonly"]
    assert params["redirect_uri"] == ["http://localhost:3000/api/integrations/gmail/callback"]
    assert params["access_type"] == ["offline"] and params["response_type"] == ["code"]
    row = db.query(Integration).filter_by(user_id=user.id, provider="gmail").one()
    assert row.status == "pending" and row.oauth_state == params["state"][0] and len(row.oauth_state) >= 32


def test_callback_rejects_state_mismatch(auth_client: TestClient, user, db, google_configured, monkeypatch):
    monkeypatch.setattr(oauth, "exchange_code", lambda *a: pytest.fail("must not exchange a code on bad state"))
    auth_client.post("/api/integrations/gmail/connect")
    r = auth_client.get("/api/integrations/gmail/callback?code=abc&state=forged", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "http://localhost:3000/settings?tab=integrations&provider=gmail&error=state_mismatch"
    row = db.query(Integration).filter_by(user_id=user.id, provider="gmail").one()
    assert row.status == "pending" and row.access_token_enc is None


def test_callback_stores_tokens_encrypted(auth_client: TestClient, user, db, google_configured, monkeypatch):
    monkeypatch.setattr(oauth, "exchange_code", lambda provider, code: oauth.TokenSet(
        access_token="ya29.plain-access", refresh_token="1//plain-refresh", expires_in=3600,
        scopes=["https://www.googleapis.com/auth/gmail.readonly"]))
    monkeypatch.setattr(oauth, "fetch_account_label", lambda provider, token: "mit@gmail.com")
    state = _start(auth_client)

    r = auth_client.get(f"/api/integrations/gmail/callback?code=good&state={state}", follow_redirects=False)
    assert r.headers["location"] == "http://localhost:3000/settings?tab=integrations&connected=gmail"
    db.expire_all()
    row = db.query(Integration).filter_by(user_id=user.id, provider="gmail").one()
    assert row.status == "connected" and row.account_label == "mit@gmail.com" and row.oauth_state is None
    assert row.access_token_enc and "plain-access" not in row.access_token_enc
    assert decrypt_str(row.access_token_enc) == "ya29.plain-access"
    assert decrypt_str(row.refresh_token_enc) == "1//plain-refresh"
    connected = db.query(AuditLog).filter_by(action="integration.connected").one()
    assert connected.summary == "Connected Gmail (mit@gmail.com)"

    replay = auth_client.get(f"/api/integrations/gmail/callback?code=good&state={state}", follow_redirects=False)
    assert "error=state_mismatch" in replay.headers["location"]  # state is single-use

    listed = {i["provider"]: i for i in auth_client.get("/api/integrations").json()}
    assert listed["gmail"]["status"] == "connected" and listed["gmail"]["account_label"] == "mit@gmail.com"

    out = auth_client.post("/api/integrations/gmail/disconnect")
    assert out.status_code == 200 and out.json()["status"] == "disconnected"
    db.expire_all()
    row = db.query(Integration).filter_by(user_id=user.id, provider="gmail").one()
    assert row.access_token_enc is None and row.refresh_token_enc is None


def test_callback_denied_by_user(auth_client: TestClient, google_configured):
    state = _start(auth_client)
    r = auth_client.get(f"/api/integrations/gmail/callback?error=access_denied&state={state}", follow_redirects=False)
    assert r.headers["location"].endswith("&error=access_denied")


def test_callback_without_session_redirects(client: TestClient):
    r = client.get("/api/integrations/gmail/callback?code=x&state=y", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].endswith("error=session_expired")


@pytest.mark.parametrize(("subject", "sender", "snippet", "expected"), [
    ("Thank you for applying to Borealis", "no-reply@greenhouse.io",
     "We have received your application for Junior Developer and will review it.", "confirmation"),
    ("Interview invitation: Junior Developer", "talent@borealis.example.com",
     "We'd like to schedule a call. Please share your availability for a phone screen.", "interview_invite"),
    ("Your application to Borealis", "careers@borealis.example.com",
     "Thank you for applying. Unfortunately, we have decided to move forward with other candidates.", "rejection"),
    ("Offer letter — Junior Developer", "hr@borealis.example.com",
     "We are pleased to offer you the position. Your offer letter and start date are attached.", "offer"),
    ("Opportunity at Northwind", "sarah@northwind.example.com",
     "I came across your profile and would you be interested in a quick chat about a backend role?", "recruiter"),
    ("Your weekly newsletter", "news@example.com", "Ten productivity tips for your week.", "other"),
])
def test_classifier(subject, sender, snippet, expected):
    category, confidence = email_sync.classify(subject, sender, snippet)
    assert category == expected
    assert (confidence == 0) if expected == "other" else (0 < confidence <= 1)


def test_high_confidence_confirmation_and_rejection():
    sender = "jobs@acme.example.com"
    confirmation = email_sync.classify("Application received", sender,
                                       "Thank you for applying. We have received your application.")
    rejection = email_sync.classify("Update", sender,
                                    "Unfortunately we regret to inform you that you were not selected.")
    assert confirmation[1] >= email_sync.HIGH_CONFIDENCE and rejection[1] >= email_sync.HIGH_CONFIDENCE


def test_match_application_by_domain_or_name(db, user):
    borealis = make_application(db, user, make_job(db, user, company="Borealis Software Inc."))
    northwind = make_application(db, user, make_job(db, user, company="Northwind Labs"))
    apps = [borealis, northwind]
    assert email_sync.match_application(apps, "HR <hr@borealissoftware.com>", "Hello", "") is borealis
    subject = "Thank you for applying to Northwind Labs"
    assert email_sync.match_application(apps, "no-reply@greenhouse.io", subject, "") is northwind
    assert email_sync.match_application(apps, "someone@else.com", "Hi", "nothing") is None


def test_email_sync_demo_mode(auth_client: TestClient, user, db):
    applied = make_application(db, user, make_job(db, user, company="Borealis Software"), applied_days_ago=2,
                               is_demo=True)
    confirmed = make_application(db, user, make_job(db, user, company="Northwind Labs"),
                                 status=ApplicationStatus.confirmed, applied_days_ago=9, is_demo=True)
    make_application(db, user, make_job(db, user, company="Not Demo Inc"), applied_days_ago=1)
    db.commit()
    r = auth_client.post("/api/integrations/email/sync")
    assert r.status_code == 200
    task = r.json()
    assert task["kind"] == "email_sync" and task["status"] == "completed"
    assert [s["status"] for s in task["steps"]] == ["done"] * 5
    assert task["result"]["stored"] == 2 and task["result"]["status_updates"] == 1
    db.expire_all()
    assert db.get(Application, applied.id).status == ApplicationStatus.confirmed
    stored = {m.category: m for m in db.query(EmailMessage).filter_by(user_id=user.id)}
    assert set(stored) == {"confirmation", "interview_invite"}
    assert stored["interview_invite"].application_id == confirmed.id
    assert db.query(Notification).filter_by(user_id=user.id, type="interview").count() == 1

    again = auth_client.post("/api/integrations/email/sync").json()
    assert again["result"]["stored"] == 0  # idempotent
    assert db.query(AgentTask).filter_by(user_id=user.id, kind="email_sync").count() == 2


def test_email_sync_requires_mailbox_outside_demo(auth_client: TestClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    r = auth_client.post("/api/integrations/email/sync")
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_mailbox"
