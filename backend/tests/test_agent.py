"""End-to-end: the agent searches (demo sources), merges duplicates, analyzes, scores and explains."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.models import AgentTask, AgentTaskStatus, AuditLog, Job, JobMatch, JobSearch, Notification, utcnow
from app.services.agent import runner, scheduler
from app.services.sources.base import SourceError
from tests.jobs_helpers import make_profile

STEP_KEYS = ["search_linkedin", "search_indeed", "search_company_sites", "dedupe", "analyze", "score", "recommend"]


@pytest.fixture
def profile(db, user):
    bundle = make_profile(db, user)
    db.commit()
    return bundle


def run_search(client, **body) -> dict:
    r = client.post("/api/job-searches/run", json={"filters": {}, **body})
    assert r.status_code == 202, r.text
    return r.json()


def test_demo_search_end_to_end(auth_client, db, user, profile):
    task = run_search(auth_client)
    assert task["status"] == "completed"
    assert [s["key"] for s in task["steps"]] == STEP_KEYS
    assert all(s["status"] == "done" for s in task["steps"])
    steps = {s["key"]: s for s in task["steps"]}
    assert steps["search_linkedin"]["label"] == "Searching LinkedIn"
    assert steps["search_linkedin"]["detail"] == "55 jobs found (sample data)"
    assert steps["dedupe"]["detail"] == "82 unique jobs (44 duplicates merged)"
    assert " relevant, " in steps["analyze"]["detail"] and "hidden by your filters" in steps["analyze"]["detail"]
    assert steps["recommend"]["detail"].endswith("ready for review")

    result = task["result"]
    assert (result["found"], result["unique"], result["duplicates"], result["new"]) == (126, 82, 44, 82)
    assert result["strong"] >= 3
    assert result["strong"] + result["good"] + result["possible"] <= 82 - result["hidden"]
    assert len(result["top_job_ids"]) == 10

    db.expire_all()
    jobs = db.query(Job).filter_by(user_id=user.id).all()
    assert len(jobs) == 82 and all(j.is_demo for j in jobs)
    assert db.query(JobMatch).filter_by(user_id=user.id).count() == 82
    assert max(len(j.sources) for j in jobs) == 3
    assert any(j.is_hidden for j in jobs)  # e.g. outside Thunder Bay / not remote in Canada
    assert sum(1 for j in jobs if any(f["code"] == "suspicious_posting" for f in j.flags)) == 2

    audit_actions = [a.action for a in db.query(AuditLog).filter_by(user_id=user.id)]
    assert audit_actions.count("job.discovered") == 82
    assert "agent.search_completed" in audit_actions
    discovered = db.query(AuditLog).filter_by(user_id=user.id, action="job.discovered").first()
    assert discovered.summary.startswith("Agent discovered job: ") and discovered.actor == "agent"
    notes = db.query(Notification).filter_by(user_id=user.id).all()
    assert any(n.type == "agent" for n in notes)
    assert sum(1 for n in notes if n.type == "excellent_match") == result["strong"]

    # The best match is explained category by category.
    top = auth_client.get(f"/api/job-matches/{result['top_job_ids'][0]}").json()
    assert top["tier"] == "strong"
    assert len(top["breakdown"]) == 9
    skills = next(c for c in top["breakdown"] if c["key"] == "skills")
    assert skills["reasons"][0].startswith("You have ")
    assert top["recommendation"].startswith("Recommended because")

    # Counts in the job list agree with the run.
    counts = auth_client.get("/api/jobs").json()["counts"]
    assert counts["all"] + counts["hidden"] == 82
    assert counts["hidden"] == result["hidden"]
    assert counts["strong"] == result["strong"]
    assert counts["recommended"] == counts["strong"] + counts["good"]


def test_second_run_updates_instead_of_duplicating(auth_client, db, user, profile):
    run_search(auth_client)
    task = run_search(auth_client)
    assert task["result"]["new"] == 0 and task["result"]["unique"] == 82
    db.expire_all()
    assert db.query(Job).filter_by(user_id=user.id).count() == 82
    assert db.query(AuditLog).filter_by(user_id=user.id, action="job.discovered").count() == 82


def test_filters_narrow_demo_results(auth_client, profile):
    task = run_search(auth_client, filters={"roles": ["Python Developer"], "posted_within_days": 7},
                      sources=["linkedin"])
    steps = {s["key"]: s for s in task["steps"]}
    assert steps["search_indeed"]["status"] == "skipped"
    assert steps["search_indeed"]["detail"] == "Not selected for this search"
    assert 0 < task["result"]["found"] < 55


def test_failed_source_is_reported_and_run_continues(auth_client, monkeypatch, profile):
    original = runner.resolve

    class Broken:
        def search(self, *args, **kwargs):
            raise SourceError("We couldn't retrieve jobs from this source right now. You can retry or continue with "
                              "the other job sources.")

    def fake_resolve(db, user, key):
        resolved = original(db, user, key)
        if key == "indeed":
            resolved.adapter = Broken()
        return resolved

    monkeypatch.setattr(runner, "resolve", fake_resolve)
    task = run_search(auth_client)
    steps = {s["key"]: s for s in task["steps"]}
    assert task["status"] == "completed"
    assert steps["search_indeed"]["status"] == "failed"
    assert steps["search_indeed"]["detail"].startswith("We couldn't retrieve jobs from this source right now")
    assert steps["search_linkedin"]["status"] == "done" and steps["dedupe"]["status"] == "done"
    assert task["result"]["failed_sources"] == ["Indeed"]


def test_all_sources_failing_fails_the_task_with_a_friendly_error(auth_client, monkeypatch, profile):
    def boom(*args, **kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr("app.services.sources.demo.DemoSource.search", boom)
    task = run_search(auth_client)
    assert task["status"] == "failed"
    assert task["error"] == "We couldn't retrieve jobs from any source right now. Please try again in a few minutes."
    assert {s["status"] for s in task["steps"][:3]} == {"failed"}
    assert {s["status"] for s in task["steps"][3:]} == {"skipped"}


def test_agent_settings_toggles_skip_steps(auth_client, profile):
    r = auth_client.patch("/api/agent/settings", json={"auto_score": False, "auto_submit": True})
    assert r.status_code == 200
    assert r.json()["auto_score"] is False and r.json()["auto_submit"] is False
    task = run_search(auth_client)
    steps = {s["key"]: s for s in task["steps"]}
    assert steps["score"]["status"] == "skipped"
    assert steps["score"]["detail"] == "Automatic scoring is off in agent settings"


def test_agent_settings_validation(auth_client):
    r = auth_client.patch("/api/agent/settings", json={"strong_match_threshold": 20, "mystery": True})
    assert r.status_code == 422
    fields = {d["field"] for d in r.json()["error"]["details"]}
    assert fields == {"mystery"}
    r = auth_client.patch("/api/agent/settings", json={"strong_match_threshold": 20})
    assert r.status_code == 422
    assert auth_client.get("/api/agent/settings").json()["strong_match_threshold"] == 80


def test_status_tasks_and_cancel(auth_client, db, user, profile):
    status = auth_client.get("/api/agent/status").json()
    assert status["demo_mode"] is True and status["running"] is None
    assert [(s["key"], s["status"]) for s in status["sources"]] == [
        ("linkedin", "demo"), ("indeed", "demo"), ("company_sites", "demo")]
    assert status["sources"][0]["note"] == "Showing sample jobs — connect LinkedIn to search real postings"

    task = AgentTask(user_id=user.id, kind="search", title="Queued search", status=AgentTaskStatus.queued,
                     steps=[{"key": k, "label": k, "status": "pending"} for k in STEP_KEYS], params={}, result={})
    db.add(task)
    db.commit()
    assert auth_client.get("/api/agent/status").json()["running"]["id"] == task.id
    cancelled = auth_client.post(f"/api/agent/tasks/{task.id}/cancel").json()
    assert cancelled["status"] == "cancelled"
    assert {s["status"] for s in cancelled["steps"]} == {"skipped"}
    runner.run_search_task(task.id)  # a cancelled task is never executed
    db.expire_all()
    assert db.get(AgentTask, task.id).status == AgentTaskStatus.cancelled

    tasks = auth_client.get("/api/agent/tasks?limit=5").json()
    assert tasks[0]["id"] == task.id
    assert auth_client.get("/api/agent/tasks/999999").status_code == 404


def test_run_from_preferences(auth_client, profile):
    r = auth_client.post("/api/agent/run", json={"kind": "search"})
    assert r.status_code == 202
    task = r.json()
    assert task["params"]["origin"] == "preferences"
    assert task["params"]["filters"]["locations"] == ["Thunder Bay, ON"]
    assert task["params"]["filters"]["remote_regions"] == ["Canada"]
    assert task["status"] == "completed"
    analyze = auth_client.post("/api/agent/run", json={"kind": "analyze"}).json()
    assert analyze["kind"] == "analyze" and analyze["status"] == "completed"
    assert analyze["result"]["updated"] == task["result"]["unique"]


def test_saved_searches_crud_run_and_schedule(auth_client, db, user, profile):
    parsed = auth_client.post("/api/job-searches/parse", json={
        "text": "junior python developer jobs in Thunder Bay and remote Canada"}).json()
    body = {"name": parsed["suggested_name"], "query_text": parsed["text"], "filters": parsed["filters"],
            "schedule": "daily"}
    created = auth_client.post("/api/job-searches", json=body)
    assert created.status_code == 201
    search = created.json()
    assert search["next_run_at"] is not None
    assert auth_client.get("/api/job-searches").json()[0]["id"] == search["id"]

    task = auth_client.post(f"/api/job-searches/{search['id']}/run").json()
    assert task["job_search_id"] == search["id"] and task["status"] == "completed"
    refreshed = auth_client.get("/api/job-searches").json()[0]
    assert refreshed["last_result_count"] == task["result"]["unique"]
    assert refreshed["last_run_at"] is not None

    patched = auth_client.patch(f"/api/job-searches/{search['id']}", json={"schedule": "manual"}).json()
    assert patched["schedule"] == "manual" and patched["next_run_at"] is None
    assert auth_client.delete(f"/api/job-searches/{search['id']}").status_code == 204
    assert auth_client.get("/api/job-searches").json() == []


def test_scheduler_runs_due_searches_and_preference_searches(db, user, profile):
    search = JobSearch(user_id=user.id, name="Daily", filters={"roles": ["Python Developer"]},
                       sources=["linkedin"], schedule="daily", is_active=True,
                       next_run_at=utcnow() - timedelta(minutes=1))
    db.add(search)
    user.onboarding_completed = True
    db.commit()
    assert scheduler.run_due_searches(db) == 1
    db.expire_all()
    search = db.get(JobSearch, search.id)
    assert search.last_run_at is not None and search.next_run_at > utcnow() + timedelta(hours=23)
    assert scheduler.run_due_searches(db) == 0

    # The saved-search run doesn't count as the preference search, so that one is due too.
    assert scheduler.run_due_preference_searches(db) == 1
    assert scheduler.run_due_preference_searches(db) == 0
    tasks = db.query(AgentTask).filter_by(user_id=user.id).all()
    assert {t.trigger for t in tasks} == {"schedule"}
    scheduler.tick()  # all parts run without raising (reminders are optional)
