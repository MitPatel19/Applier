"""Resume tailoring: integrity (no invented skills or metrics), reviewable changes, decisions."""

from __future__ import annotations

import json
import re

import pytest

from app.models import User
from app.schemas.resume import ResumeContent
from app.services import llm, resume_builder, resume_tailor, taxonomy
from app.services.profile_bundle import load_bundle
from tests.prep_fixtures import make_job, seed_profile


@pytest.fixture
def seeded(user: User, db):
    seed_profile(db, user)
    return load_bundle(db, user), make_job(db, user)


def _numbers(content: dict) -> set[str]:
    return set(re.findall(r"\d+", resume_tailor.content_text(content)))


def test_file_name_is_sanitized():
    assert resume_tailor.tailored_file_name("Mit Patel", "Junior Software Developer", "XYZ") == \
        "Mit_Patel_Junior_Software_Developer_XYZ.pdf"
    assert resume_tailor.tailored_file_name("Mit Kumar Patel", "C#/.NET Dev (Remote)", "Acme, Inc.") == \
        "Mit_Patel_C_NET_Dev_Remote_Acme_Inc.pdf"


def test_never_adds_skills_or_metrics_outside_the_profile(seeded):
    bundle, job = seeded
    base = resume_builder.build_from_profile(bundle)
    result = resume_tailor.tailor(bundle, base, job)

    allowed = taxonomy.expand_with_implied(bundle.skill_names | resume_tailor.content_skills(base))
    tailored_skills = resume_tailor.content_skills(result.content)
    assert tailored_skills <= allowed
    assert "Kubernetes" not in tailored_skills and "Terraform" not in tailored_skills
    without_summary = {**result.content, "summary": None}
    assert _numbers(without_summary) <= _numbers(base)  # no invented metrics anywhere
    years = int(bundle.total_years_experience())
    assert set(re.findall(r"\d+", result.content["summary"])) <= {str(years)}  # summary uses real tenure only
    assert {"Kubernetes", "Terraform"} <= set(result.keywords_missing)
    assert any("Kubernetes" in n and "Terraform" in n and "not added" in n for n in result.integrity_notes)
    assert "Python" in result.keywords_matched
    assert 0 <= result.ats_score <= 100


def test_changes_are_reviewable_with_before_after_and_reason(seeded):
    bundle, job = seeded
    result = resume_tailor.tailor(bundle, resume_builder.build_from_profile(bundle), job)
    ids = [c["id"] for c in result.changes]
    assert len(ids) == len(set(ids))
    types = {c["type"] for c in result.changes}
    assert {"emphasize", "rewrite", "reorder", "summary", "remove"} <= types
    for change in result.changes:
        assert change["reason"] and change["title"] and change["accepted"] is None

    rewrites = {c["before"]: c["after"] for c in result.changes if c["type"] == "rewrite"}
    assert rewrites["Responsible for maintaining the internal ticketing API in Django"] == \
        "Maintained the internal ticketing API in Django"
    assert rewrites["Built REST APIs with Django and Postgres for 3 internal tools"] == \
        "Built REST APIs with Django and PostgreSQL for 3 internal tools"
    emphasize = next(c for c in result.changes if c["type"] == "emphasize")
    assert emphasize["title"].startswith("Emphasized Python")
    removed = next(c for c in result.changes if c["type"] == "remove")
    assert removed["before"] == "Photo Gallery"
    summary = next(c for c in result.changes if c["type"] == "summary")["after"]
    assert "Kubernetes" not in summary and "Junior Software Developer" in summary


def test_keyword_added_only_when_the_profile_has_it(seeded):
    bundle, job = seeded
    base = resume_builder.build_from_profile(bundle)
    base["skills"] = [{"category": "Programming", "items": ["Python"]}]  # e.g. an older uploaded resume
    result = resume_tailor.tailor(bundle, base, job)
    added = {c["after"] for c in result.changes if c["type"] == "keyword"}
    assert {"Django", "PostgreSQL", "React", "Docker"} <= added
    assert not added & {"Kubernetes", "Terraform", "REST APIs"}  # REST APIs isn't a listed profile skill


def test_rejecting_a_change_removes_it_from_the_content(seeded):
    bundle, job = seeded
    base = resume_builder.build_from_profile(bundle)
    base["skills"] = [{"category": "Programming", "items": ["Python"]}]
    result = resume_tailor.tailor(bundle, base, job)
    keyword = next(c for c in result.changes if c["type"] == "keyword" and c["after"] == "PostgreSQL")
    removal = next(c for c in result.changes if c["type"] == "remove")

    decided = [{**c, "accepted": False} if c["id"] in (keyword["id"], removal["id"]) else c for c in result.changes]
    content = resume_tailor.apply_changes(base, decided)
    skills = {i for g in content["skills"] for i in g["items"]}
    assert "PostgreSQL" not in skills and "Django" in skills
    assert "Photo Gallery" in [p["name"] for p in content["projects"]]

    all_rejected = resume_tailor.apply_changes(base, [{**c, "accepted": False} for c in result.changes])
    assert all_rejected == ResumeContent.model_validate(base).model_dump()


def test_ai_rewrites_that_add_claims_are_discarded(seeded, monkeypatch):
    bundle, job = seeded
    base = resume_builder.build_from_profile(bundle)
    first_exp = base["experience"][0]
    ids = [b["id"] for b in first_exp["bullets"]]

    def fake_generate(system: str, prompt: str, **_: object) -> str:
        return json.dumps({
            ids[0]: "Maintained the internal ticketing API in Django and Kubernetes",  # new skill
            ids[1]: "Built REST APIs with Django and PostgreSQL for 12 internal tools",  # new number
            ids[2]: "Wrote clear onboarding guides for new hires",  # safe
        })

    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(llm, "generate", fake_generate)
    result = resume_tailor.tailor(bundle, base, job)
    text = resume_tailor.content_text(result.content)
    assert "Kubernetes" not in text and "12 internal" not in text
    assert "Wrote clear onboarding guides for new hires" in text
    assert any("discarded" in n for n in result.integrity_notes)


def test_no_changes_when_customization_is_off(seeded):
    bundle, job = seeded
    base = resume_builder.build_from_profile(bundle)
    result = resume_tailor.tailor(bundle, base, job, propose_changes=False)
    assert result.changes == [] and result.content == ResumeContent.model_validate(base).model_dump()


def test_tailor_api_decisions_and_approval(auth_client, user, db):
    seed_profile(db, user)
    job = make_job(db, user)
    r = auth_client.post("/api/resumes/from-profile", json={"name": "Main", "set_default": True})
    assert r.status_code == 201, r.text
    r = auth_client.post("/api/resumes/tailor", json={"job_id": job.id})
    assert r.status_code == 201, r.text
    version = r.json()
    assert version["file_name"] == "Mit_Patel_Junior_Software_Developer_XYZ.pdf"
    assert "Kubernetes" in version["keywords_missing"] and version["integrity_notes"]
    summary_change = next(c for c in version["changes"] if c["type"] == "summary")

    r = auth_client.post(f"/api/resumes/versions/{version['id']}/decisions",
                         json={"decisions": {summary_change["id"]: False}})
    assert r.status_code == 200, r.text
    assert r.json()["content"]["summary"] == version["base_content"]["summary"]

    r = auth_client.post(f"/api/resumes/versions/{version['id']}/decisions", json={"decisions": {"nope": True}})
    assert r.status_code == 422

    r = auth_client.post(f"/api/resumes/versions/{version['id']}/approve")
    body = r.json()
    assert body["status"] == "approved"
    assert all(c["accepted"] is False for c in body["changes"])  # pending proposals are rejected on approve
    assert body["content"] == body["base_content"]

    r = auth_client.get(f"/api/resumes/versions/{version['id']}/render?format=pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert "Mit_Patel_Junior_Software_Developer_XYZ.pdf" in r.headers["content-disposition"]
    r = auth_client.get(f"/api/resumes/versions/{version['id']}/render?format=docx")
    assert r.status_code == 200 and r.content.startswith(b"PK")
