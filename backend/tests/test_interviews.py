from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.models import AuditLog, Experience, Project, utcnow
from app.services.interview_prep import RESULT_PLACEHOLDER, generate_prep
from app.services.practice import evaluate
from tests.conftest import register
from tests.tracking_helpers import add_profile, make_application


def _setup(db, user):
    add_profile(db, user)
    app = make_application(db, user)
    db.commit()
    return app


def test_prep_uses_only_real_profile_facts(auth_client: TestClient, user, db):
    app = _setup(db, user)
    app.job.requirements = {**app.job.requirements, "min_years_experience": 5}
    db.commit()
    r = auth_client.post("/api/interviews", json={"application_id": app.id, "kind": "technical"})
    assert r.status_code == 201
    prep = r.json()["prep"]
    assert prep["required_skills"] == ["Python", "Django", "PostgreSQL", "Kubernetes"]
    assert "Borealis Software" in prep["company_overview"]  # no research yet -> honest guidance
    assert "Junior Python Developer at Borealis Software" in prep["role_summary"]

    topics = {t["topic"]: t for t in prep["technical_topics"]}
    expected = {"Python", "Django & Django REST Framework", "SQL & relational databases", "Docker & containers"}
    assert expected <= set(topics)
    assert "You list" in topics["Python"]["why"]
    docker_why = topics["Docker & containers"]["why"]
    assert "Kubernetes is required" in docker_why and "You list Docker" in docker_why
    assert "Kubernetes isn't in your profile yet" in docker_why
    assert all(t["subtopics"] for t in topics.values())
    assert prep["technical_questions"] and prep["behavioral_questions"][0]["question"] == "Tell me about yourself."
    assert any("posting mentions" in q["why"] for q in prep["behavioral_questions"])

    exp = db.query(Experience).one()
    project = db.query(Project).one()
    source_text = " ".join([*exp.responsibilities, *exp.achievements, *exp.metrics, *project.responsibilities,
                            project.description or ""])
    stories = prep["star_stories"]
    assert stories
    for story in stories:
        # Actions come from real bullets; results are either real metrics/results or explicit placeholders.
        first_clause = story["action"].split(";")[0].split(" Built with")[0].rstrip(".")
        assert first_clause in source_text
        assert story["result"].startswith("[") or story["result"].rstrip(".").lower() in source_text.lower()
    query_story = next(s for s in stories if "slowest report query" in s["action"])
    assert query_story["action"] == "Rewrote the slowest report query."
    assert query_story["result"] == "Cutting runtime from 4.2s to 600ms."
    assert any(s["result"] == RESULT_PLACEHOLDER for s in stories)

    gaps = " ".join(prep["gaps_to_prepare"])
    assert "Kubernetes: not in your profile" in gaps
    assert "5+ years" in gaps
    assert prep["relevant_projects"][0]["name"] == "ShiftSwap"
    assert any("match 3 of 4 required skills" in p for p in prep["talking_points"])
    assert len(prep["questions_to_ask"]) >= 5
    assert db.query(AuditLog).filter_by(action="interview.scheduled").count() == 1


def test_prep_without_job_or_profile_still_works(db, user):
    app = make_application(db, user, job=None)
    app.job_id = None
    db.flush()
    db.refresh(app)
    prep = generate_prep(db, app)
    assert prep["star_stories"] == []
    assert prep["behavioral_questions"]
    assert prep["generated_at"]


def test_crud_regenerate_and_ownership(auth_client: TestClient, user, db, client):
    app = _setup(db, user)
    created = auth_client.post("/api/interviews", json={"application_id": app.id}).json()
    iid = created["id"]
    assert created["company_name"] == "Borealis Software" and created["kind"] == "phone_screen"

    when = (utcnow() + timedelta(days=2)).replace(microsecond=0)
    patched = auth_client.patch(f"/api/interviews/{iid}",
                                json={"scheduled_at": when.isoformat(), "duration_minutes": 45})
    assert patched.status_code == 200 and patched.json()["duration_minutes"] == 45
    upcoming = auth_client.get("/api/interviews?upcoming=true").json()
    assert [i["id"] for i in upcoming] == [iid]

    regen = auth_client.post(f"/api/interviews/{iid}/prep/regenerate")
    assert regen.status_code == 200 and regen.json()["prep"]["star_stories"]

    other = TestClient(client.app)
    token = register(other, email="other@example.com", name="Other")["access_token"]
    other.headers.update({"Authorization": f"Bearer {token}"})
    assert other.get(f"/api/interviews/{iid}").status_code == 404
    assert other.post("/api/interviews", json={"application_id": app.id}).status_code == 404

    assert auth_client.delete(f"/api/interviews/{iid}").status_code == 204
    assert auth_client.get(f"/api/interviews/{iid}").status_code == 404


def test_ics_export(auth_client: TestClient, user, db):
    app = _setup(db, user)
    iid = auth_client.post("/api/interviews", json={"application_id": app.id}).json()["id"]
    unscheduled = auth_client.get(f"/api/interviews/{iid}/ics")
    assert unscheduled.status_code == 400 and unscheduled.json()["error"]["code"] == "not_scheduled"

    auth_client.patch(f"/api/interviews/{iid}", json={
        "scheduled_at": "2026-10-02T15:00:00", "duration_minutes": 30, "meeting_url": "https://meet.example.com/abc",
        "interviewers": ["Priya Nair, Talent"], "notes": "Bring questions; smile"})
    r = auth_client.get(f"/api/interviews/{iid}/ics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    text = r.text
    assert text.startswith("BEGIN:VCALENDAR\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert "DTSTART:20261002T150000Z" in text and "DTEND:20261002T153000Z" in text
    assert f"UID:interview-{iid}@" in text
    assert "Priya Nair\\, Talent" in text and "Bring questions\\; smile" in text
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))


def test_practice_feedback_rewards_star_answers(auth_client: TestClient, user, db):
    app = _setup(db, user)
    iid = auth_client.post("/api/interviews", json={"application_id": app.id}).json()["id"]
    strong = (
        "When I was a junior developer at Northshore Digital, our monthly report took over four seconds to load and "
        "customers complained. My task was to make it fast without changing the results. I profiled the query, I "
        "added two composite indexes and I rewrote the aggregation so it ran in the database instead of Python. I "
        "tested it against a copy of production data and walked the team through the change in code review. As a "
        "result, the report dropped from 4.2 seconds to 600 milliseconds and support tickets about it stopped. I "
        "learned to measure first and change second, and I now check query plans before merging anything that "
        "touches reporting."
    )
    weak = "Um, we basically just fixed it, like, you know, it was kind of slow and um we made it better."
    good = auth_client.post(f"/api/interviews/{iid}/practice",
                            json={"question": "Tell me about a time you improved performance.", "answer": strong})
    assert good.status_code == 200
    good_entry = good.json()
    bad_entry = evaluate("Tell me about a time you improved performance.", weak)
    assert good_entry["score"] >= 80 > 40 >= bad_entry.score
    assert "All four STAR parts" in good_entry["feedback"][0]
    feedback = " ".join(bad_entry.feedback)
    assert "short" in feedback and "\"I\"" in feedback and "filler" in feedback.lower()
    log = auth_client.get(f"/api/interviews/{iid}").json()["practice_log"]
    assert len(log) == 1 and log[0]["score"] == good_entry["score"]
