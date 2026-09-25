"""Timezone-aware datetimes from clients are stored as naive UTC."""

from datetime import datetime

from app.models import Interview


def test_aware_datetime_is_normalized(auth_client, db, user):
    from app.models import Application

    app = Application(user_id=user.id, company_name="XYZ", job_title="Dev")
    db.add(app)
    db.commit()
    r = auth_client.post("/api/interviews", json={
        "application_id": app.id, "kind": "technical", "scheduled_at": "2026-10-01T15:00:00-04:00",
    })
    assert r.status_code == 201, r.text
    db.expire_all()
    stored = db.get(Interview, r.json()["id"])
    assert stored.scheduled_at == datetime(2026, 10, 1, 19, 0)
    # Listing (which compares against naive "now") must still work.
    assert auth_client.get("/api/interviews?upcoming=true").status_code == 200
    assert auth_client.get("/api/analytics/dashboard").status_code == 200
