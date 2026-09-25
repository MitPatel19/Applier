from __future__ import annotations

from collections import Counter

from fastapi.testclient import TestClient

from app.models import Recruiter, Template, UserProfile
from app.services.templates_service import _PLACEHOLDER_RE, DEFAULT_TEMPLATES, PLACEHOLDERS
from tests.conftest import register
from tests.tracking_helpers import add_profile, make_application


def test_defaults_cover_every_kind(auth_client: TestClient):
    templates = auth_client.get("/api/templates").json()
    kinds = Counter(t["kind"] for t in templates)
    assert kinds["cover_letter"] >= 2 and kinds["question"] >= 3 and kinds["follow_up"] >= 2
    assert kinds["recruiter_message"] >= 2 and kinds["thank_you"] >= 1
    assert all(t["is_default"] for t in templates)
    only_thanks = auth_client.get("/api/templates?kind=thank_you").json()
    assert {t["kind"] for t in only_thanks} == {"thank_you"}


def test_default_templates_only_use_supported_placeholders():
    for spec in DEFAULT_TEMPLATES:
        for text in (spec["body"], spec["subject"] or ""):
            assert set(_PLACEHOLDER_RE.findall(text or "")) <= set(PLACEHOLDERS), spec["name"]


def test_defaults_are_reseeded_when_empty(auth_client: TestClient, user, db):
    db.query(Template).filter_by(user_id=user.id).delete()
    db.commit()
    assert len(auth_client.get("/api/templates").json()) == len(DEFAULT_TEMPLATES)


def test_render_fills_placeholders_and_reports_unresolved(auth_client: TestClient, user, db):
    add_profile(db, user)
    db.query(UserProfile).filter_by(user_id=user.id).one().phone = "807-555-0100"
    app = make_application(db, user, applied_days_ago=5)
    db.commit()
    template = next(t for t in auth_client.get("/api/templates?kind=follow_up").json()
                    if t["name"] == "Follow-up after applying")

    r = auth_client.post(f"/api/templates/{template['id']}/render", json={"application_id": app.id})
    assert r.status_code == 200
    out = r.json()
    assert out["subject"] == "Following up on my Junior Python Developer application"
    applied = app.applied_at
    assert f"on {applied:%B} {applied.day}, {applied.year}" in out["body"]
    assert "Python, Django and PostgreSQL" in out["body"]  # the job's required skills the user has
    assert "807-555-0100" in out["body"] and "Mit Patel" in out["body"]
    assert out["unresolved"] == ["recruiter_name"]
    assert "{{recruiter_name}}" in out["body"]

    rec = Recruiter(user_id=user.id, name="Priya Nair")
    db.add(rec)
    db.commit()
    with_rec = auth_client.post(f"/api/templates/{template['id']}/render",
                                json={"application_id": app.id, "recruiter_id": rec.id}).json()
    assert with_rec["unresolved"] == [] and with_rec["body"].startswith("Hi Priya,")


def test_render_without_context_lists_missing_fields(auth_client: TestClient):
    template = auth_client.get("/api/templates?kind=cover_letter").json()[0]
    out = auth_client.post(f"/api/templates/{template['id']}/render", json={}).json()
    assert {"company", "job_title"} <= set(out["unresolved"])
    assert "mit@example.com" in out["body"]


def test_crud_and_ownership(auth_client: TestClient, client):
    payload = {"kind": "question", "name": "Salary", "body": "Around {{top_skills}}", "question": "Expected salary?"}
    created = auth_client.post("/api/templates", json=payload)
    assert created.status_code == 201
    tid = created.json()["id"]
    updated = auth_client.patch(f"/api/templates/{tid}", json={"body": "Open to discussing it."})
    assert updated.json()["body"] == "Open to discussing it." and updated.json()["name"] == "Salary"

    other = TestClient(client.app)
    token = register(other, email="other@example.com", name="Other")["access_token"]
    other.headers.update({"Authorization": f"Bearer {token}"})
    assert other.patch(f"/api/templates/{tid}", json={"body": "x"}).status_code == 404
    assert other.post(f"/api/templates/{tid}/render", json={}).status_code == 404

    assert auth_client.delete(f"/api/templates/{tid}").status_code == 204
    assert auth_client.patch(f"/api/templates/{tid}", json={"body": "x"}).status_code == 404
