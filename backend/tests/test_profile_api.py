"""Profile API: CRUD, skills normalization, preferences defaults/merge, completeness, resume import."""

from __future__ import annotations

from app.models import AuditLog
from app.services import matching


def test_profile_defaults_and_completeness(auth_client):
    r = auth_client.get("/api/profile")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == "mit@example.com"
    assert body["experiences"] == [] and body["completeness"]["percent"] == 0
    assert sum(i["weight"] for i in body["completeness"]["items"]) == 100

    r = auth_client.patch("/api/profile", json={"phone": "807-555-0100", "city": "Thunder Bay",
                                                "headline": "Junior Developer", "authorized_countries": ["Canada"]})
    assert r.status_code == 200 and r.json()["phone"] == "807-555-0100"
    items = {i["key"]: i["done"] for i in auth_client.get("/api/profile").json()["completeness"]["items"]}
    assert items["contact"] and items["headline"] and items["work_authorization"] and not items["experience"]


def test_experience_education_project_crud(auth_client):
    r = auth_client.post("/api/profile/experiences", json={"company": "Acme", "position": "Developer",
                                                           "start_date": "2023-01-01",
                                                           "responsibilities": ["Built APIs"]})
    assert r.status_code == 201, r.text
    exp_id = r.json()["id"]
    r = auth_client.patch(f"/api/profile/experiences/{exp_id}", json={"company": "Acme Corp", "position": "Developer"})
    assert r.json()["company"] == "Acme Corp" and r.json()["responsibilities"] == []
    assert auth_client.post("/api/profile/educations", json={"institution": "Lakehead"}).status_code == 201
    project = auth_client.post("/api/profile/projects", json={"name": "Tracker", "technologies": ["Flask"]}).json()
    assert auth_client.delete(f"/api/profile/projects/{project['id']}").status_code == 204
    profile = auth_client.get("/api/profile").json()
    assert len(profile["experiences"]) == 1 and len(profile["educations"]) == 1 and profile["projects"] == []
    assert auth_client.post("/api/profile/experiences", json={"company": "", "position": "x"}).status_code == 422


def test_skills_are_canonicalized_categorized_and_deduplicated(auth_client):
    r = auth_client.post("/api/profile/skills", json={"name": "postgres"})
    assert r.status_code == 201 and r.json()["name"] == "PostgreSQL" and r.json()["category"] == "databases"
    dup = auth_client.post("/api/profile/skills", json={"name": "PostgreSQL"})
    assert dup.status_code == 409 and "already" in dup.json()["error"]["message"]

    r = auth_client.post("/api/profile/skills/bulk", json={"skills": [
        {"name": "reactjs"}, {"name": "Psql"}, {"name": "Python", "level": "advanced", "years": 2},
        {"name": "React"}, {"name": "AWS Cloud Practitioner", "category": "certifications"},
        {"name": "Underwater basket weaving"}]})
    assert r.status_code == 201
    added = {s["name"]: s["category"] for s in r.json()}
    assert added == {"React": "frameworks", "Python": "programming", "AWS Cloud Practitioner": "certifications",
                     "Underwater basket weaving": "other"}

    skill_id = next(s["id"] for s in r.json() if s["name"] == "Python")
    assert auth_client.patch(f"/api/profile/skills/{skill_id}", json={"name": "React"}).status_code == 409
    assert auth_client.delete(f"/api/profile/skills/{skill_id}").status_code == 204


def test_preferences_defaults_merge_and_recompute(auth_client, monkeypatch):
    calls: list[int] = []
    monkeypatch.setattr(matching, "recompute_all", lambda db, user: calls.append(user.id) or 0)
    prefs = auth_client.get("/api/profile/preferences").json()
    assert prefs["scoring_weights"] == matching.DEFAULT_WEIGHTS
    assert prefs["agent_settings"]["auto_submit"] is False and prefs["quality_filters"]["max_age_days"] == 45
    assert prefs["ui_settings"]["theme"] == "system"

    r = auth_client.patch("/api/profile/preferences", json={"ui_settings": {"theme": "dark"}})
    assert r.json()["ui_settings"]["theme"] == "dark" and calls == []
    r = auth_client.patch("/api/profile/preferences", json={"target_roles": ["Software Developer"],
                                                            "salary_min": 60000})
    body = r.json()
    assert body["target_roles"] == ["Software Developer"] and body["salary_min"] == 60000
    assert body["ui_settings"]["theme"] == "dark" and len(calls) == 1


def test_import_parsed_resume(auth_client, db):
    auth_client.patch("/api/profile", json={"phone": "111-111-1111"})
    auth_client.post("/api/profile/experiences", json={"company": "Acme Corp", "position": "Developer"})
    auth_client.post("/api/profile/skills", json={"name": "Python"})
    parsed = {
        "full_name": "Mit Patel", "phone": "222-222-2222", "city": "Thunder Bay", "province": "ON",
        "headline": "Junior Developer",
        "experiences": [{"company": "ACME Corp.", "position": "developer"},
                        {"company": "City Library", "position": "IT Support Assistant",
                         "responsibilities": ["Resolved tickets"]}],
        "educations": [{"institution": "Lakehead University", "degree": "Bachelor of Science"}],
        "projects": [{"name": "Tracker"}],
        "skills": [{"name": "python"}, {"name": "Django"}],
    }
    r = auth_client.post("/api/profile/import", json={"parsed": parsed})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["profile"]["phone"] == "111-111-1111"  # non-empty personal fields are kept
    assert body["profile"]["city"] == "Thunder Bay" and body["profile"]["headline"] == "Junior Developer"
    assert [e["company"] for e in body["experiences"]].count("City Library") == 1
    assert len(body["experiences"]) == 2  # "ACME Corp." / "developer" is a near-duplicate
    assert sorted(s["name"] for s in body["skills"]) == ["Django", "Python"]
    assert len(body["educations"]) == 1 and len(body["projects"]) == 1

    r = auth_client.post("/api/profile/import", json={"parsed": parsed, "overwrite_personal": True})
    assert r.json()["profile"]["phone"] == "222-222-2222" and len(r.json()["experiences"]) == 2
    assert db.query(AuditLog).filter_by(action="profile.imported").count() == 2


def test_other_users_items_are_not_found(auth_client, client):
    exp = auth_client.post("/api/profile/experiences", json={"company": "Acme", "position": "Dev"}).json()
    from tests.conftest import register

    other = register(client, email="other@example.com", name="Other Person")
    client.headers.update({"Authorization": f"Bearer {other['access_token']}"})
    assert client.delete(f"/api/profile/experiences/{exp['id']}").status_code == 404
