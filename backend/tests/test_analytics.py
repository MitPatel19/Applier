from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.models import (
    AgentTask,
    AgentTaskStatus,
    ApplicationStatus,
    FollowUp,
    Interview,
    Resume,
    utcnow,
)
from app.services.analytics import RESUME_NOTE, normalize_title
from tests.tracking_helpers import make_application, make_job

S = ApplicationStatus


def _seed(db, user):
    main = Resume(user_id=user.id, name="Software Developer Resume", content={}, is_default=True)
    it = Resume(user_id=user.id, name="IT Support Resume", content={})
    db.add_all([main, it])
    db.flush()
    make_application(db, user, make_job(db, user, title="Junior Software Developer"), status=S.interview,
                     applied_days_ago=10, resume_id=main.id, path=[S.applied, S.confirmed, S.interview])
    make_application(db, user, make_job(db, user, title="Software Developer II"), status=S.rejected,
                     applied_days_ago=12, resume_id=main.id, rejection_reason="Position filled",
                     path=[S.applied, S.rejected])
    make_application(db, user, make_job(db, user, title="IT Support Technician"), status=S.applied, applied_days_ago=5,
                     resume_id=it.id, source="indeed", path=[S.applied])
    make_application(db, user, make_job(db, user, title="Senior Software Developer (Remote)"), status=S.offer,
                     applied_days_ago=20, resume_id=main.id,
                     path=[S.applied, S.interview, S.technical_interview, S.offer])
    make_application(db, user, make_job(db, user, title="Old Role"), status=S.confirmed, applied_days_ago=50,
                     path=[S.applied, S.confirmed])
    make_application(db, user, make_job(db, user, title="Ready Role"), status=S.ready, applied_days_ago=None)
    db.commit()
    return main, it


def test_normalize_title():
    assert normalize_title("Junior Software Developer") == "Software Developer"
    assert normalize_title("Sr. Software Developer - Thunder Bay") == "Software Developer"
    assert normalize_title("Software Developer II") == "Software Developer"
    assert normalize_title("IT Support Technician (Contract)") == "IT Support Technician"


def test_summary_tiles_funnel_and_breakdowns(auth_client: TestClient, user, db):
    _seed(db, user)
    r = auth_client.get("/api/analytics/summary?range_days=30")
    assert r.status_code == 200
    data = r.json()
    tiles = {t["key"]: t for t in data["tiles"]}
    assert set(tiles) == {"applications", "interviews", "response_rate", "interview_rate", "offers", "jobs_discovered",
                          "jobs_saved", "rejections"}
    assert tiles["applications"]["value"] == 4  # the 50-day-old application is outside the window
    assert tiles["applications"]["delta"] == 4 - 1
    assert tiles["response_rate"]["value"] == 75.0 and tiles["response_rate"]["unit"] == "%"
    assert tiles["interview_rate"]["value"] == 50.0
    assert tiles["offers"]["value"] == 1 and tiles["rejections"]["value"] == 1
    assert tiles["jobs_discovered"]["value"] == 6

    funnel = [(f["key"], f["count"]) for f in data["funnel"]]
    assert funnel == [("discovered", 6), ("applied", 4), ("responded", 3), ("interview", 2), ("offer", 1)]
    by_title = {row["label"]: row for row in data["by_title"]}
    assert by_title["Software Developer"]["applications"] == 3
    assert by_title["Software Developer"]["interview_rate"] == round(100 * 2 / 3, 1)
    by_source = {row["label"]: row["applications"] for row in data["by_source"]}
    assert by_source == {"LinkedIn": 3, "Indeed": 1}
    by_resume = {row["label"]: row["applications"] for row in data["by_resume"]}
    assert by_resume == {"Software Developer Resume": 3, "IT Support Resume": 1}
    assert data["rejection_reasons"] == [{"reason": "Position filled", "count": 1}]
    statuses = {s["status"]: s["count"] for s in data["status_distribution"]}
    assert statuses["ready"] == 1 and statuses["offer"] == 1
    assert data["sample_size_note"] == ("Based on 4 applications — treat these as observed patterns, not proof of "
                                        "what works.")
    assert len(data["timeseries"]) == 31  # daily buckets
    assert sum(p["applied"] for p in data["timeseries"]) == 4

    weekly = auth_client.get("/api/analytics/summary?range_days=90").json()
    assert len(weekly["timeseries"]) in (13, 14)
    assert sum(p["applied"] for p in weekly["timeseries"]) == 5


def test_empty_summary(auth_client: TestClient):
    data = auth_client.get("/api/analytics/summary").json()
    assert data["funnel"][1]["count"] == 0 and data["tiles"][2]["value"] == 0
    assert data["sample_size_note"].startswith("Based on 0 applications")
    assert auth_client.get("/api/analytics/summary?range_days=2").status_code == 422


def test_resume_performance_is_labelled_as_observational(auth_client: TestClient, user, db):
    _seed(db, user)
    data = auth_client.get("/api/analytics/resume-performance").json()
    rows = {r["resume_name"]: r for r in data["rows"]}
    main = rows["Software Developer Resume"]
    assert (main["applications"], main["interviews"], main["offers"]) == (3, 2, 1)
    assert main["interview_rate"] == round(100 * 2 / 3, 1) and main["confidence"] == "low"
    assert main["note"] == RESUME_NOTE
    assert rows["No resume recorded"]["applications"] == 1
    assert "not as proof" in data["disclaimer"]


def test_dashboard(auth_client: TestClient, user, db):
    _seed(db, user)
    now = utcnow()
    interview_app = make_application(db, user, make_job(db, user, title="Backend Developer"), status=S.interview)
    db.add(Interview(user_id=user.id, application_id=interview_app.id, kind="phone_screen",
                     scheduled_at=now + timedelta(hours=3), prep={}, practice_log=[], interviewers=[]))
    db.add(FollowUp(user_id=user.id, application_id=interview_app.id, due_at=now - timedelta(days=1)))
    make_job(db, user, title="Saved Job", is_saved=True, saved_at=now, deadline=now.date() + timedelta(days=2))
    make_job(db, user, title="Top Match", match=95)
    db.add(AgentTask(user_id=user.id, kind="search", title="Daily search", status=AgentTaskStatus.completed,
                     steps=[], params={}, result={}, finished_at=now - timedelta(hours=2)))
    db.commit()

    r = auth_client.get("/api/analytics/dashboard")
    assert r.status_code == 200
    d = r.json()
    assert d["greeting_name"] == "Mit"
    assert d["agent_status"] == "ready" and d["agent_message"].startswith("Last search finished 2 hours ago")
    assert d["job_search"]["found"] == 9 and d["job_search"]["strong"] == 9 and d["job_search"]["new"] == 9
    assert d["applications"] == {"applied": 6, "interviews": 2, "awaiting_response": 2, "offers": 1}
    actions = {a["key"]: a for a in d["actions"]}
    assert actions["ready_to_apply"]["label"] == "1 Application Ready"
    assert actions["follow_ups_due"]["label"] == "1 Follow-up Due"
    assert actions["interview_soon"]["label"].startswith("1 Interview ")
    assert "resume_issue" not in actions  # a default resume exists
    assert d["top_opportunities"][0]["title"] == "Top Match"
    top_titles = {j["title"] for j in d["top_opportunities"]}
    assert not top_titles & {"Junior Software Developer", "Ready Role", "Backend Developer"}  # already in progress
    assert d["top_opportunities"][0]["sources"] == ["LinkedIn"]
    assert d["saved_jobs"][0]["title"] == "Saved Job"
    assert d["closing_soon"][0]["title"] == "Saved Job"
    assert d["ready_to_apply"][0]["title"] == "Ready Role"
    assert d["upcoming_interviews"][0]["company"] == "Borealis Software"
    assert d["follow_ups_due"][0]["title"] == "Backend Developer"
    assert len(d["pipeline"]) == 14 and {p["status"]: p["count"] for p in d["pipeline"]}["interview"] == 2
    assert 0 <= d["profile_completeness"] <= 100 and d["onboarding_completed"] is False


def test_dashboard_for_new_user(auth_client: TestClient):
    d = auth_client.get("/api/analytics/dashboard").json()
    assert d["agent_status"] == "idle" and d["top_opportunities"] == []
    assert [a["key"] for a in d["actions"]] == ["resume_issue"]
