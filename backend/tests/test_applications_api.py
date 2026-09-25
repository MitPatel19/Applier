"""Application flow: prepare → preview → approve → submit (hand-off) → confirm → applied."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.models import Application, AuditLog, FollowUp, Interview, utcnow
from app.schemas.applications import STATUS_LABELS
from tests.conftest import register
from tests.prep_fixtures import make_job, seed_profile

SCREENING = "Describe your experience working on an agile team."


@pytest.fixture
def job(user, db):
    seed_profile(db, user)
    return make_job(db, user, questions=[SCREENING],
                    description="Build REST APIs with Python and Django. Please include a cover letter.")


def _prepare(client, job_id: int) -> dict:
    r = client.post("/api/applications/prepare", json={"job_id": job_id})
    assert r.status_code == 200, r.text
    return r.json()


def _answer(detail: dict, fragment: str) -> dict:
    return next(a for a in detail["answers"] if fragment in a["question"])


def test_full_flow(auth_client, job, db):
    detail = _prepare(auth_client, job.id)
    assert detail["status"] == "reviewing"  # the screening question is required and unanswered
    blocking = [i for i in detail["readiness"] if i["blocking"]]
    assert [i["key"] for i in blocking] == ["answers"] and blocking[0]["field"] == "answers"
    assert detail["resume_version"]["file_name"] == "Mit_Patel_Junior_Software_Developer_XYZ.pdf"
    assert "Kubernetes" in detail["resume_version"]["keywords_missing"]
    assert detail["cover_letter"]["company_name"] == "XYZ"
    auth = _answer(detail, "authorized to work in Canada")
    assert auth["answer"] == "Yes" and auth["needs_confirmation"] and not auth["confirmed"]
    assert _answer(detail, "sponsorship")["answer"] == "No"
    assert _answer(detail, "experience do you have with Python")["answer"] == "2"
    assert _answer(detail, "salary")["answer"] == "$65,000 CAD per year"
    assert detail["job"]["id"] == job.id and detail["status_history"][0]["to_status"] == "discovered"

    r = auth_client.patch(f"/api/application-answers/{_answer(detail, 'agile')['id']}",
                          json={"answer": "Two years of two-week sprints at Northern Tech Solutions."})
    assert r.status_code == 200 and r.json()["source"] == "user"
    detail = auth_client.get(f"/api/applications/{detail['id']}").json()
    assert detail["status"] == "ready" and detail["readiness_summary"]["missing"] == 0
    app_id = detail["id"]

    preview = auth_client.get(f"/api/applications/{app_id}/preview").json()
    assert preview["can_approve"] and preview["submission_method"] == "external_link"
    assert preview["destination"] == "careers.xyz.example"
    assert preview["resume_file_name"] == "Mit_Patel_Junior_Software_Developer_XYZ.pdf"
    assert preview["cover_letter_file_name"] == "XYZ_Cover_Letter.pdf"
    assert {row["label"] for row in preview["rows"]} >= {"COMPANY", "POSITION", "RESUME", "ANSWERS"}

    r = auth_client.post(f"/api/applications/{app_id}/submit")
    assert r.status_code == 403
    assert r.json()["error"]["message"] == "Please review and approve this application first."

    r = auth_client.post(f"/api/applications/{app_id}/approve", json={"confirm": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "answers_unconfirmed"
    assert any("authorized" in d["message"] for d in r.json()["error"]["details"])

    r = auth_client.post(f"/api/applications/{app_id}/approve", json={"confirm": True, "acknowledge_answers": True})
    assert r.status_code == 200, r.text
    approved = r.json()
    assert approved["approved_at"] and approved["status"] == "ready"
    assert approved["resume_version"]["status"] == "approved"
    assert all(c["accepted"] is not None for c in approved["resume_version"]["changes"])
    assert approved["cover_letter"]["status"] == "approved"
    assert all(a["confirmed"] for a in approved["answers"] if a["needs_confirmation"] and a["answer"])
    docs = {d["kind"]: d for d in approved["documents"]}
    assert docs["resume"]["file_name"] == "Mit_Patel_Junior_Software_Developer_XYZ.pdf"
    assert docs["cover_letter"]["file_name"] == "XYZ_Cover_Letter.pdf"
    download = auth_client.get(f"/api/applications/{app_id}/documents/{docs['resume']['id']}")
    assert download.status_code == 200 and download.content.startswith(b"%PDF")

    r = auth_client.post(f"/api/applications/{app_id}/submit")
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["state"] == "pending_user" and result["status"] == "ready"
    assert result["apply_url"] == "https://careers.xyz.example/apply/123"
    assert result["steps"][0] == {"label": "Open the employer's application page", "done": True,
                                  "requires_user": False}
    assert [s["label"] for s in result["steps"]][-1] == "Submit on the employer's site"
    assert any(s["label"] == "Upload your cover letter" for s in result["steps"])
    assert auth_client.get(f"/api/applications/{app_id}").json()["status"] == "ready"  # not applied yet

    r = auth_client.post(f"/api/applications/{app_id}/confirm-submitted", json={"submitted": True})
    assert r.status_code == 200, r.text
    final = r.json()
    assert final["status"] == "applied" and final["applied_at"] and final["submission_state"] == "submitted"
    assert len(final["follow_ups"]) == 1 and final["next_follow_up_at"]
    follow_up = db.query(FollowUp).one()
    assert follow_up.note == "Check in on your application" and follow_up.channel == "dashboard"
    assert (follow_up.due_at - utcnow()).days in (6, 7)

    actions = [a.action for a in db.query(AuditLog).filter(AuditLog.entity_type.in_(
        ["application", "resume_version", "cover_letter"])).order_by(AuditLog.id)]
    expected = ["resume.customized", "cover_letter.generated", "application.prepared", "application.approved",
                "application.handed_off", "application.submitted"]
    positions = [actions.index(a) for a in expected]
    assert positions == sorted(positions)
    submitted = db.query(AuditLog).filter_by(action="application.submitted").one()
    assert submitted.summary.startswith("Application submitted (confirmed by you)")

    assert auth_client.post(f"/api/applications/{app_id}/submit").status_code == 409


def test_not_submitted_returns_to_ready(auth_client, job):
    app_id = _prepare(auth_client, job.id)["id"]
    detail = auth_client.get(f"/api/applications/{app_id}").json()
    auth_client.patch(f"/api/application-answers/{_answer(detail, 'agile')['id']}", json={"answer": "Yes, daily."})
    auth_client.post(f"/api/applications/{app_id}/approve", json={"confirm": True, "acknowledge_answers": True})
    auth_client.post(f"/api/applications/{app_id}/submit")
    r = auth_client.post(f"/api/applications/{app_id}/confirm-submitted", json={"submitted": False})
    body = r.json()
    assert body["status"] == "ready" and body["approved_at"] is None and body["submission_state"] is None
    assert auth_client.post(f"/api/applications/{app_id}/submit").status_code == 403


def test_approval_expires_and_edits_clear_it(auth_client, job, db):
    app_id = _prepare(auth_client, job.id)["id"]
    detail = auth_client.get(f"/api/applications/{app_id}").json()
    auth_client.patch(f"/api/application-answers/{_answer(detail, 'agile')['id']}", json={"answer": "Yes."})
    auth_client.post(f"/api/applications/{app_id}/approve", json={"confirm": True, "acknowledge_answers": True})

    app = db.get(Application, app_id)
    app.approved_at = utcnow() - timedelta(minutes=31)
    db.commit()
    assert auth_client.post(f"/api/applications/{app_id}/submit").status_code == 403

    auth_client.post(f"/api/applications/{app_id}/approve", json={"confirm": True})
    salary = _answer(detail, "salary")
    auth_client.patch(f"/api/application-answers/{salary['id']}", json={"answer": "$70,000"})
    assert auth_client.get(f"/api/applications/{app_id}").json()["approved_at"] is None


def test_blocking_items_prevent_approval(auth_client, user, db):
    seed_profile(db, user)
    job = make_job(db, user, deadline=date.today() - timedelta(days=1))
    detail = _prepare(auth_client, job.id)
    assert any(i["key"] == "deadline" and i["blocking"] for i in detail["readiness"])
    r = auth_client.post(f"/api/applications/{detail['id']}/approve", json={"confirm": True,
                                                                           "acknowledge_answers": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_ready"
    assert "deadline" in r.json()["error"]["message"]
    assert auth_client.post(f"/api/applications/{detail['id']}/approve", json={"confirm": False}).status_code == 422


def test_board_create_status_and_interviews(auth_client, job, db):
    r = auth_client.post("/api/applications", json={"job_id": job.id})
    assert r.status_code == 201 and r.json()["status"] == "saved"
    assert auth_client.post("/api/applications", json={"job_id": job.id}).status_code == 409
    app_id = r.json()["id"]

    board = auth_client.get("/api/applications/board").json()
    assert [c["status"] for c in board["columns"]] == list(STATUS_LABELS)
    assert board["columns"][1]["items"][0]["id"] == app_id

    r = auth_client.post(f"/api/applications/{app_id}/status", json={"status": "interview", "note": "Recruiter call"})
    assert r.status_code == 200 and r.json()["status"] == "interview"
    interview = db.query(Interview).one()
    assert interview.kind == "phone_screen" and interview.application_id == app_id
    auth_client.post(f"/api/applications/{app_id}/status", json={"status": "interview"})
    assert db.query(Interview).count() == 1

    assert [a["id"] for a in auth_client.get("/api/applications?status=interview&q=xyz").json()] == [app_id]
    assert auth_client.get("/api/applications?status=offer").json() == []
    assert auth_client.post("/api/applications/prepare", json={"job_id": job.id}).status_code == 409
    assert auth_client.delete(f"/api/applications/{app_id}").status_code == 204


def test_other_users_cannot_see_applications(auth_client, client, job):
    app_id = _prepare(auth_client, job.id)["id"]
    other = register(client, email="other@example.com", name="Other Person")
    client.headers.update({"Authorization": f"Bearer {other['access_token']}"})
    assert client.get(f"/api/applications/{app_id}").status_code == 404
    assert client.post(f"/api/applications/{app_id}/approve", json={"confirm": True}).status_code == 404


def test_status_side_effects(auth_client, job, db):
    from app.models import Notification
    from app.services.application_status import change_status

    app_id = auth_client.post("/api/applications", json={"job_id": job.id}).json()["id"]
    app = db.get(Application, app_id)
    db.add(FollowUp(user_id=app.user_id, application_id=app_id, due_at=utcnow(), status="pending"))
    change_status(db, app, "applied", actor="email")
    change_status(db, app, "rejected", actor="email", note="Position filled")
    db.commit()
    assert app.applied_at is not None
    assert db.query(FollowUp).one().status == "dismissed"
    assert [n.title for n in db.query(Notification).order_by(Notification.id)] == ["XYZ: Applied", "XYZ: Rejected"]
    history = [(h["from_status"], h["to_status"], h["actor"]) for h in
               auth_client.get(f"/api/applications/{app_id}").json()["status_history"]]
    assert history == [(None, "saved", "user"), ("saved", "applied", "email"), ("applied", "rejected", "email")]
