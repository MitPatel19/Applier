from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.models import (
    AgentTask,
    Application,
    AuditLog,
    Company,
    EmailMessage,
    Experience,
    FollowUp,
    Interview,
    Job,
    Notification,
    Recruiter,
    Resume,
    Skill,
    UserProfile,
)

pytest.importorskip("app.services.jobs_ingest")
pytest.importorskip("app.services.sources.demo")
pytest.importorskip("app.services.resume_builder")


def _counts(db, user_id: int) -> dict[str, int]:
    models = {"apps": Application, "jobs": Job, "resumes": Resume, "recruiters": Recruiter, "interviews": Interview,
              "follow_ups": FollowUp, "notifications": Notification, "emails": EmailMessage, "tasks": AgentTask,
              "experiences": Experience, "skills": Skill}
    db.expire_all()
    return {k: db.query(m).filter_by(user_id=user_id).count() for k, m in models.items()}


def test_seed_builds_a_living_account(auth_client: TestClient, user, db):
    r = auth_client.post("/api/demo/seed")
    assert r.status_code == 200, r.text
    assert "Loaded sample data" in r.json()["message"]
    c = _counts(db, user.id)
    assert c["apps"] == 14 and c["resumes"] == 3 and c["recruiters"] == 3 and c["interviews"] == 3
    assert c["follow_ups"] == 2 and c["notifications"] >= 6 and c["emails"] >= 5
    assert c["experiences"] == 3 and c["skills"] >= 25
    profile = db.query(UserProfile).filter_by(user_id=user.id).one()
    assert profile.city == "Thunder Bay" and profile.authorized_countries == ["Canada"]
    assert db.query(Resume).filter_by(user_id=user.id, is_default=True).one().name == "Software Developer Resume"
    assert all(a.is_demo for a in db.query(Application).filter_by(user_id=user.id))
    assert db.query(AuditLog).filter_by(user_id=user.id, action="application.approved").count() == 1

    dash = auth_client.get("/api/analytics/dashboard").json()
    assert dash["agent_status"] == "ready"
    labels = {a["key"]: a["label"] for a in dash["actions"]}
    assert labels["ready_to_apply"] == "3 Applications Ready"
    assert labels["follow_ups_due"] == "2 Follow-ups Due"
    assert labels["interview_soon"] == "1 Interview Tomorrow"
    assert "missing_info" in labels
    assert dash["top_opportunities"] and dash["upcoming_interviews"]
    interview = auth_client.get(f"/api/interviews/{dash['upcoming_interviews'][0]['interview_id']}").json()
    assert interview["prep"]["star_stories"]

    summary = auth_client.get("/api/analytics/summary?range_days=60").json()
    funnel = {f["key"]: f["count"] for f in summary["funnel"]}
    assert funnel["applied"] == 10 and funnel["interview"] == 4 and funnel["offer"] == 1
    perf = auth_client.get("/api/analytics/resume-performance").json()
    assert sum(r["applications"] for r in perf["rows"]) == 10


def test_seed_is_idempotent_and_removable(auth_client: TestClient, user, db):
    auth_client.post("/api/demo/seed")
    first = _counts(db, user.id)
    assert auth_client.post("/api/demo/seed").status_code == 200
    second = _counts(db, user.id)
    assert {k: v for k, v in second.items() if k != "tasks"} == {k: v for k, v in first.items() if k != "tasks"}

    assert auth_client.delete("/api/demo").status_code == 204
    after = _counts(db, user.id)
    for key in ("apps", "jobs", "resumes", "recruiters", "interviews", "follow_ups", "emails", "experiences", "skills"):
        assert after[key] == 0, key
    assert after["notifications"] == 0
    assert db.query(Company).filter_by(user_id=user.id, is_demo=True).count() == 0
    assert db.query(UserProfile).filter_by(user_id=user.id).one().headline is None
    assert db.query(AuditLog).filter_by(user_id=user.id, action="demo.cleared").count() == 1


def test_seed_keeps_a_real_profile(auth_client: TestClient, user, db):
    db.add(Experience(user_id=user.id, company="Real Employer", position="Analyst", responsibilities=[],
                      achievements=[], technologies=[], metrics=[]))
    db.commit()
    auth_client.post("/api/demo/seed")
    assert [e.company for e in db.query(Experience).filter_by(user_id=user.id)] == ["Real Employer"]
    auth_client.delete("/api/demo")
    assert db.query(Experience).filter_by(user_id=user.id).count() == 1


def test_seed_requires_demo_mode(auth_client: TestClient, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    r = auth_client.post("/api/demo/seed")
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_disabled"
