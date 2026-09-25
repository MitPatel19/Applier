"""Transparent matching: scoring weights, recompute, and per-job match breakdowns."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DB, CurrentUser, get_owned
from app.api.serializers import match_out
from app.core.errors import AppError
from app.models import Job
from app.schemas.jobs import JobMatchOut, ScoringWeightsIn, ScoringWeightsOut
from app.services import audit
from app.services.matching import (
    CATEGORY_LABELS,
    DEFAULT_WEIGHTS,
    load_signals,
    recompute_all,
    upsert_match,
    weights_for,
)
from app.services.profile_bundle import ensure_profile_rows, load_bundle

router = APIRouter(prefix="/job-matches", tags=["job-matches"])

MAX_WEIGHT = 50


def _weights_out(weights: dict[str, int]) -> ScoringWeightsOut:
    return ScoringWeightsOut(weights=weights, defaults=dict(DEFAULT_WEIGHTS), labels=dict(CATEGORY_LABELS))


def _validate(weights: dict[str, int]) -> None:
    errors = [{"field": f"weights.{key}", "message": "Unknown scoring category"} for key in weights
              if key not in DEFAULT_WEIGHTS]
    errors += [{"field": f"weights.{key}", "message": f"Must be between 0 and {MAX_WEIGHT}"}
               for key, value in weights.items() if key in DEFAULT_WEIGHTS and not 0 <= value <= MAX_WEIGHT]
    if not errors and not any(v > 0 for v in {**DEFAULT_WEIGHTS, **weights}.values()):
        errors.append({"field": "weights", "message": "At least one category needs a weight above 0"})
    if errors:
        raise AppError("Some scoring weights need attention before we can save them.", code="validation_error",
                       status_code=422, details=errors)


@router.get("/weights", response_model=ScoringWeightsOut)
def get_weights(db: DB, user: CurrentUser) -> ScoringWeightsOut:
    _, prefs = ensure_profile_rows(db, user)
    return _weights_out(weights_for(prefs))


@router.put("/weights", response_model=ScoringWeightsOut)
def put_weights(body: ScoringWeightsIn, db: DB, user: CurrentUser) -> ScoringWeightsOut:
    _validate(body.weights)
    _, prefs = ensure_profile_rows(db, user)
    merged = {**weights_for(prefs), **body.weights}
    prefs.scoring_weights = merged
    updated = recompute_all(db, user)
    changed = ", ".join(f"{CATEGORY_LABELS[k]} {v}" for k, v in body.weights.items())
    audit.record(db, user.id, "matching.weights_updated",
                 f"You changed scoring weights ({changed}); {updated} job matches recalculated",
                 entity_type="user_preference", entity_id=prefs.id, details={"weights": merged})
    db.commit()
    return _weights_out(merged)


@router.post("/recompute")
def recompute(db: DB, user: CurrentUser) -> dict[str, int]:
    updated = recompute_all(db, user)
    audit.record(db, user.id, "matching.recomputed", f"You recalculated {updated} job matches")
    db.commit()
    return {"updated": updated}


@router.get("/{job_id}", response_model=JobMatchOut)
def get_match(job_id: int, db: DB, user: CurrentUser) -> JobMatchOut:
    job = get_owned(db, Job, job_id, user, "job")
    match = job.match
    if match is None:
        match = upsert_match(db, job, load_bundle(db, user), load_signals(db, user.id))
        db.commit()
    out = match_out(match)
    assert out is not None
    return out
