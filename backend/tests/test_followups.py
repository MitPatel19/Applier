from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.models import ApplicationStatus, FollowUp, Interview, Notification, Recruiter, UserPreference, utcnow
from app.services.reminders import run_due_reminders
from tests.tracking_helpers import add_profile, days_ago, make_application, make_job

S = ApplicationStatus


def test_suggestions_only_for_unanswered_applications_after_a_week(auth_client: TestClient, user, db):
    due = make_application(db, user, make_job(db, user, title="Backend Developer"), applied_days_ago=10)
    confirmed = make_application(db, user, make_job(db, user, title="Python Developer"), status=S.confirmed,
                                 applied_days_ago=8)
    make_application(db, user, make_job(db, user, title="Too Recent"), applied_days_ago=3)
    make_application(db, user, make_job(db, user, title="Interviewing"), status=S.interview, applied_days_ago=20)
    has_follow_up = make_application(db, user, make_job(db, user, title="Already Planned"), applied_days_ago=15)
    db.add(FollowUp(user_id=user.id, application_id=has_follow_up.id, due_at=utcnow()))
    db.commit()

    r = auth_client.get("/api/follow-ups/suggestions")
    assert r.status_code == 200
    suggestions = r.json()
    assert [s["application_id"] for s in suggestions] == [due.id, confirmed.id]
    first = suggestions[0]
    applied = due.applied_at
    expected_due = applied + timedelta(days=7)
    assert first["suggested_due_at"].startswith(expected_due.strftime("%Y-%m-%dT%H:%M"))
    assert first["reason"].startswith(f"Applied {applied:%B} {applied.day} → follow up around {expected_due:%B} "
                                      f"{expected_due.day}.")


def test_follow_up_crud_derived_fields_and_complete(auth_client: TestClient, user, db):
    app = make_application(db, user)
    rec = Recruiter(user_id=user.id, name="Priya Nair", company="Borealis Software")
    db.add(rec)
    db.commit()
    r = auth_client.post("/api/follow-ups", json={"application_id": app.id, "recruiter_id": rec.id,
                                                  "due_at": days_ago(1).isoformat(), "channel": "email"})
    assert r.status_code == 201
    item = r.json()
    assert item["company_name"] == "Borealis Software" and item["job_title"] == "Junior Python Developer"
    assert item["recruiter_name"] == "Priya Nair" and item["is_overdue"] is True

    pending = auth_client.get("/api/follow-ups?status=pending").json()
    assert [f["id"] for f in pending] == [item["id"]]
    later = (utcnow() + timedelta(days=3)).isoformat()
    snoozed = auth_client.patch(f"/api/follow-ups/{item['id']}", json={"due_at": later})
    assert snoozed.json()["is_overdue"] is False

    done = auth_client.post(f"/api/follow-ups/{item['id']}/complete").json()
    assert done["status"] == "done" and done["completed_at"] and done["is_overdue"] is False
    assert auth_client.get("/api/follow-ups?status=pending").json() == []
    assert auth_client.delete(f"/api/follow-ups/{item['id']}").status_code == 204


def test_follow_up_rejects_other_users_application(auth_client: TestClient, db):
    r = auth_client.post("/api/follow-ups", json={"application_id": 9999, "due_at": utcnow().isoformat()})
    assert r.status_code == 404


def test_generate_message_references_role_date_and_real_strength(auth_client: TestClient, user, db):
    add_profile(db, user)
    app = make_application(db, user, applied_days_ago=9)
    fu = FollowUp(user_id=user.id, application_id=app.id, due_at=utcnow())
    db.add(fu)
    db.commit()
    r = auth_client.post(f"/api/follow-ups/{fu.id}/generate-message")
    assert r.status_code == 200
    msg = r.json()
    assert msg["subject"] == "Following up on my Junior Python Developer application"
    applied = app.applied_at
    assert f"on {applied:%B} {applied.day}, {applied.year}" in msg["body"]
    assert "Junior Python Developer position at Borealis Software" in msg["body"]
    assert "Junior Developer at Northshore Digital I worked extensively with Python" in msg["body"]
    assert msg["body"].startswith("Hello,") and "mit@example.com" in msg["body"]
    assert msg["generated_by"] == "template"
    db.refresh(fu)
    assert fu.subject == msg["subject"] and fu.message == msg["body"]


def test_reminders_are_idempotent(db, user):
    app = make_application(db, user, applied_days_ago=9)
    db.add(FollowUp(user_id=user.id, application_id=app.id, due_at=days_ago(0.5)))
    db.add(FollowUp(user_id=user.id, application_id=app.id, due_at=utcnow() + timedelta(days=2)))  # not due yet
    for kind, when in (("technical", utcnow() + timedelta(hours=20)), ("final", utcnow() + timedelta(days=3))):
        db.add(Interview(user_id=user.id, application_id=app.id, kind=kind, scheduled_at=when, prep={},
                         practice_log=[], interviewers=[]))
    today = utcnow().date()
    make_job(db, user, title="Saved Soon", is_saved=True, deadline=today + timedelta(days=2))
    make_job(db, user, title="Saved Later", is_saved=True, deadline=today + timedelta(days=20))
    make_job(db, user, title="Not Saved", deadline=today + timedelta(days=1))
    ready_job = make_job(db, user, title="Ready One", deadline=today + timedelta(days=4))
    make_application(db, user, ready_job, status=S.ready, applied_days_ago=None)
    db.commit()

    assert run_due_reminders(db) == 4  # follow-up, interview, two deadlines
    assert run_due_reminders(db) == 0
    notes = {n.type: n for n in db.query(Notification).filter_by(user_id=user.id)}
    assert notes["follow_up"].title == "Time to follow up with Borealis Software"
    assert notes["interview"].priority == "high"
    titles = sorted(n.title for n in db.query(Notification).filter_by(type="deadline"))
    assert titles == ["Deadline in 2 days: Saved Soon at Borealis Software",
                      "Deadline in 4 days: Ready One at Borealis Software"]
    ready_note = db.query(Notification).filter(Notification.title.like("%Ready One%")).one()
    assert "ready" in ready_note.body


def test_deadline_warning_days_respects_preferences(db, user):
    prefs = db.query(UserPreference).filter_by(user_id=user.id).one()
    prefs.quality_filters = {"deadline_warning_days": 1}
    make_job(db, user, title="Saved Soon", is_saved=True, deadline=utcnow().date() + timedelta(days=2))
    db.commit()
    assert run_due_reminders(db) == 0
