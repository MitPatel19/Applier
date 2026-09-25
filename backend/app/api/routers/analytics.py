"""Dashboard and application analytics."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import DB, CurrentUser
from app.schemas.tracking import AnalyticsOut, DashboardOut, ResumePerformanceOut
from app.services import analytics, dashboard

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(user: CurrentUser, db: DB) -> DashboardOut:
    result = dashboard.build_dashboard(db, user)
    db.commit()  # persists profile/preference rows created on first load
    return result


@router.get("/summary", response_model=AnalyticsOut)
def get_summary(user: CurrentUser, db: DB, range_days: int = Query(default=30, ge=7, le=365)) -> AnalyticsOut:
    return analytics.summary(db, user, range_days)


@router.get("/resume-performance", response_model=ResumePerformanceOut)
def get_resume_performance(user: CurrentUser, db: DB) -> ResumePerformanceOut:
    return analytics.resume_performance(db, user)
