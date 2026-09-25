from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.models import AuditLog, Company, Job
from app.services.jobs_ingest import ingest_postings
from app.services.sources.demo import all_postings
from tests.conftest import register
from tests.jobs_helpers import JUNIOR_PYTHON_JD, make_profile


@pytest.fixture
def jobs(db, user):
    make_profile(db, user)
    ingest_postings(db, user, sorted(all_postings(), key=lambda p: p.source != "linkedin"))
    db.commit()
    return db.query(Job).filter_by(user_id=user.id).all()


def listing(client, **params) -> dict:
    r = client.get("/api/jobs", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_list_views_counts_and_pagination(auth_client, jobs):
    data = listing(auth_client, page_size=10)
    counts = data["counts"]
    visible = [j for j in jobs if not j.is_hidden]
    assert data["total"] == counts["all"] == len(visible)
    assert counts["hidden"] == len(jobs) - len(visible)
    assert len(data["items"]) == 10 and data["page"] == 1
    scores = [i["match"]["overall"] for i in data["items"]]
    assert scores == sorted(scores, reverse=True)  # default sort: best match first
    first = data["items"][0]
    assert first["match"]["recommendation"] and first["sources"]
    page2 = listing(auth_client, page=2, page_size=10)["items"]
    assert not {i["id"] for i in page2} & {i["id"] for i in data["items"]}

    recommended = listing(auth_client, view="recommended", page_size=100)
    assert recommended["total"] == counts["recommended"] == counts["strong"] + counts["good"]
    assert all(i["match"]["tier"] in ("strong", "good") for i in recommended["items"])
    hidden = listing(auth_client, view="hidden", page_size=100)
    assert hidden["total"] == counts["hidden"] and all(i["is_hidden"] and i["hidden_reasons"] for i in hidden["items"])
    assert listing(auth_client, view="new")["total"] == counts["new"] == counts["all"]  # nothing seen yet
    closing = listing(auth_client, view="closing_soon", page_size=100)
    assert closing["total"] == counts["closing_soon"] > 0
    assert all(i["deadline"] for i in closing["items"])


def test_list_filters_search_and_sort(auth_client, jobs):
    strong = listing(auth_client, tier="strong", page_size=100)
    assert strong["total"] == strong["counts"]["strong"]
    remote = listing(auth_client, work_arrangement="remote", page_size=100)["items"]
    assert remote and all(i["work_arrangement"] == "remote" for i in remote)
    company_sites = listing(auth_client, source="company_sites", page_size=100)["items"]
    assert company_sites and all(any(s["source"] == "company_site" for s in i["sources"]) for i in company_sites)
    indeed = listing(auth_client, source="indeed", page_size=100)["items"]
    assert all(any(s["source"] == "indeed" for s in i["sources"]) for i in indeed)
    found = listing(auth_client, q="borealis")["items"]
    assert found and all("Borealis" in i["company_name"] for i in found)
    assert listing(auth_client, q="100%_nothing")["total"] == 0

    by_date = listing(auth_client, sort="date", page_size=100)["items"]
    dates = [i["posted_at"] for i in by_date]
    assert dates == sorted(dates, reverse=True)
    by_deadline = listing(auth_client, sort="deadline", page_size=100)["items"]
    deadlines = [i["deadline"] for i in by_deadline if i["deadline"]]
    assert deadlines == sorted(deadlines) and by_deadline[0]["deadline"]
    by_salary = listing(auth_client, sort="salary", page_size=5)["items"]
    assert by_salary[0]["salary_max"] >= by_salary[1]["salary_max"]


def test_detail_marks_seen_and_shows_everything(auth_client, jobs):
    job = next(j for j in jobs if len(j.sources) == 3)
    r = auth_client.get(f"/api/jobs/{job.id}")
    assert r.status_code == 200
    detail = r.json()
    assert detail["is_seen"] is True and detail["duplicates_merged"] == 2
    assert detail["requirements"]["required_skills"]
    assert len(detail["full_match"]["breakdown"]) == 9
    assert detail["company"]["name"] == job.company_name and detail["company"]["is_demo"] is True
    assert listing(auth_client, view="new")["counts"]["new"] == listing(auth_client)["counts"]["all"] - 1


def test_save_hide_unhide_feedback_rescore(auth_client, db, jobs):
    hidden_job = next(j for j in jobs if j.is_hidden)
    saved = auth_client.post(f"/api/jobs/{hidden_job.id}/save").json()
    assert saved["is_saved"] and not saved["is_hidden"]  # saving overrides filters
    assert listing(auth_client, view="saved")["total"] == 1
    assert auth_client.delete(f"/api/jobs/{hidden_job.id}/save").json()["is_hidden"] is True

    visible = next(j for j in jobs if not j.is_hidden)
    hidden = auth_client.post(f"/api/jobs/{visible.id}/hide", json={"reason": "Too far"}).json()
    assert hidden["is_hidden"] and hidden["hidden_reasons"] == ["You hid this job: Too far"]
    restored = auth_client.post(f"/api/jobs/{hidden_job.id}/unhide").json()
    assert not restored["is_hidden"] and any(f["code"] == "user_unhidden" for f in restored["flags"])
    # Recomputing keeps the user's choices.
    assert auth_client.post("/api/job-matches/recompute").json()["updated"] == len(jobs)
    db.expire_all()
    assert not db.get(Job, hidden_job.id).is_hidden and db.get(Job, visible.id).is_hidden

    fb = auth_client.post(f"/api/jobs/{visible.id}/feedback", json={"feedback": "not_interested"})
    assert fb.status_code == 200
    rescored = auth_client.post(f"/api/jobs/{visible.id}/rescore").json()
    assert rescored["job_id"] == visible.id and len(rescored["breakdown"]) == 9
    actions = {a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "job")}
    assert {"job.saved", "job.unsaved", "job.hidden", "job.unhidden", "job.feedback"} <= actions


def test_manual_job_is_extracted_deduped_and_scored(auth_client, db, user):
    make_profile(db, user)
    db.commit()
    body = {"title": "Junior Python Developer", "company_name": "Lakeview Apps Inc.", "location": "Thunder Bay, ON",
            "url": "https://careers.example.com/lakeview/42",
            "description": JUNIOR_PYTHON_JD + "\nSalary: $60,000 - $68,000 per year. Hybrid, full-time."}
    r = auth_client.post("/api/jobs/manual", json=body)
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["sources"][0]["source"] == "manual" and job["sources"][0]["source_label"] == "Added by you"
    assert (job["salary_min"], job["salary_max"], job["work_arrangement"]) == (60000, 68000, "hybrid")
    assert "Python" in job["requirements"]["required_skills"]
    assert job["full_match"]["tier"] in ("strong", "good")
    again = auth_client.post("/api/jobs/manual", json={**body, "title": "Jr. Python Developer"}).json()
    assert again["id"] == job["id"]  # recognised as the same job
    audit = db.query(AuditLog).filter_by(user_id=user.id, action="job.added").one()
    assert audit.summary == "You added job: Junior Python Developer at Lakeview Apps Inc." and audit.actor == "user"
    assert auth_client.post("/api/jobs/manual", json={**body, "description": "short"}).status_code == 422


def test_weights_validation_and_recompute(auth_client, jobs):
    data = auth_client.get("/api/job-matches/weights").json()
    assert data["weights"] == data["defaults"] and data["labels"]["skills"] == "Technical skills"
    bad = auth_client.put("/api/job-matches/weights", json={"weights": {"skills": 70, "vibes": 5}})
    assert bad.status_code == 422
    assert {d["field"] for d in bad.json()["error"]["details"]} == {"weights.skills", "weights.vibes"}
    zero = {k: 0 for k in data["defaults"]}
    assert auth_client.put("/api/job-matches/weights", json={"weights": zero}).status_code == 422
    ok = auth_client.put("/api/job-matches/weights", json={"weights": {"skills": 50, "salary": 0}}).json()
    assert ok["weights"]["skills"] == 50 and ok["weights"]["salary"] == 0 and ok["weights"]["experience"] == 18
    match = auth_client.get(f"/api/job-matches/{jobs[0].id}").json()
    assert match["weights"]["skills"] == 50
    assert next(c for c in match["breakdown"] if c["key"] == "skills")["weight"] == 50


def test_companies(auth_client, db, user, jobs):
    companies = auth_client.get("/api/companies").json()
    assert companies and companies[0]["open_jobs"] >= companies[-1]["open_jobs"]
    borealis = auth_client.get("/api/companies", params={"q": "borealis"}).json()
    assert [c["name"] for c in borealis] == ["Borealis Software"]
    detail = auth_client.get(f"/api/companies/{borealis[0]['id']}").json()
    assert detail["company"]["industry"] == "Logistics software (SaaS)"
    assert len(detail["jobs"]) == 6 and detail["applications"] == []
    patched = auth_client.patch(f"/api/companies/{borealis[0]['id']}", json={"notes": "Met them at a meetup"}).json()
    assert patched["notes"] == "Met them at a meetup"
    researched = auth_client.post(f"/api/companies/{borealis[0]['id']}/research").json()
    kinds = {f["kind"] for f in researched["facts"]}
    assert {"verified", "inferred"} <= kinds and researched["researched_at"]
    assert "Python" in researched["tech_stack"]
    assert any(f["source"] == "Job postings" for f in researched["facts"])
    assert db.query(AuditLog).filter_by(user_id=user.id, action="company.researched").count() == 1
    suspicious = db.query(Company).filter_by(user_id=user.id, name="QuickHire Global Staffing").one()
    assert not suspicious.is_demo and suspicious.website is None


def test_audit_endpoint_filters_and_paginates(auth_client, jobs):
    entries = auth_client.get("/api/audit", params={"limit": 5}).json()
    assert len(entries) == 5 and entries[0]["id"] > entries[-1]["id"]
    older = auth_client.get("/api/audit", params={"limit": 5, "before_id": entries[-1]["id"]}).json()
    assert older[0]["id"] < entries[-1]["id"]
    job_entries = auth_client.get("/api/audit", params={"entity_type": "job", "entity_id": jobs[0].id}).json()
    assert [e["action"] for e in job_entries] == ["job.discovered"]


def test_other_users_cannot_see_jobs(client, auth_client, jobs):
    other = register(client, email="other@example.com", name="Other Person")
    headers = {"Authorization": f"Bearer {other['access_token']}"}
    job_id = jobs[0].id
    assert client.get(f"/api/jobs/{job_id}", headers=headers).status_code == 404
    assert client.post(f"/api/jobs/{job_id}/save", headers=headers).status_code == 404
    assert client.get(f"/api/job-matches/{job_id}", headers=headers).status_code == 404
    assert client.get("/api/jobs", headers=headers).json()["total"] == 0
    assert client.get("/api/audit", params={"entity_type": "job"}, headers=headers).json() == []


def test_deadline_and_closing_soon_uses_quality_window(auth_client, db, user, jobs):
    job = next(j for j in jobs if not j.is_hidden)
    job.deadline = date.today() + timedelta(days=4)
    db.commit()
    ids = {i["id"] for i in listing(auth_client, view="closing_soon", page_size=100)["items"]}
    assert job.id in ids
