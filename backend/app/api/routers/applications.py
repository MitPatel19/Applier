"""Applications: tracking board, preparation, preview, explicit approval, hand-off and confirmation.

Human-in-the-loop guarantees enforced here:

* ``/submit`` refuses (403) unless this specific application was approved in the last 30 minutes.
* The default flow hands off to the employer's site; the status only becomes "applied" after the
  user confirms via ``/confirm-submitted``.
* The documents stored at approval time are the exact files the user approved.
"""

from __future__ import annotations

from datetime import timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import DB, CurrentUser, get_owned
from app.api.routers.cover_letters import cover_letter_file_name
from app.api.routers.resumes import attachment
from app.api.serializers_applications import application_detail_out, application_out, application_outs
from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.core.storage import get_storage
from app.models import (
    Application,
    ApplicationDocument,
    ApplicationStatus,
    CoverLetter,
    FollowUp,
    Job,
    Recruiter,
    Resume,
    User,
    utcnow,
)
from app.schemas.applications import (
    STATUS_LABELS,
    ApplicationCreate,
    ApplicationDetailOut,
    ApplicationOut,
    ApplicationPreview,
    ApplicationUpdate,
    ApproveIn,
    BoardColumn,
    BoardOut,
    ConfirmSubmittedIn,
    PrepareIn,
    PreviewRow,
    StatusUpdateIn,
    SubmitPlanStep,
    SubmitResult,
)
from app.services import audit, documents, readiness, resume_tailor, submission
from app.services.application_prep import (
    create_application,
    invalidate_approval,
    prepare_application,
    refresh_readiness,
)
from app.services.application_status import change_status
from app.services.profile_bundle import load_bundle
from app.services.resume_builder import build_contact

router = APIRouter(prefix="/applications", tags=["applications"])

APPROVAL_WINDOW = timedelta(minutes=30)
EDITABLE = (ApplicationStatus.discovered, ApplicationStatus.saved, ApplicationStatus.reviewing,
            ApplicationStatus.ready)
APPROVABLE = (ApplicationStatus.reviewing, ApplicationStatus.ready)


def _source_label(app: Application) -> str:
    """Human label of the posting's source ("LinkedIn", "Company Website")."""
    if app.job:
        for src in app.job.sources:
            if src.source == app.source:
                return src.source_label
    return (app.source or "Unknown").replace("_", " ").title()


def _get(db: Session, app_id: int, user: User) -> Application:
    return get_owned(db, Application, app_id, user, "application")


def _detail(db: Session, app: Application) -> ApplicationDetailOut:
    return application_detail_out(db, app)


# ---------------------------------------------------------------------------
# Listing & board
# ---------------------------------------------------------------------------


@router.get("", response_model=list[ApplicationOut])
def list_applications(user: CurrentUser, db: DB, status_filter: str | None = Query(None, alias="status"),
                      q: str | None = Query(None, max_length=200)) -> list[ApplicationOut]:
    query = select(Application).where(Application.user_id == user.id)
    if status_filter:
        statuses = [s for s in status_filter.split(",") if s in STATUS_LABELS]
        query = query.where(Application.status.in_([ApplicationStatus(s) for s in statuses]))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Application.company_name.ilike(like), Application.job_title.ilike(like)))
    apps = list(db.scalars(query.order_by(Application.updated_at.desc())))
    return application_outs(db, apps)


@router.get("/board", response_model=BoardOut)
def board(user: CurrentUser, db: DB) -> BoardOut:
    apps = list(db.scalars(select(Application).where(Application.user_id == user.id)
                           .order_by(Application.board_position, Application.updated_at.desc())))
    columns: dict[str, list[ApplicationOut]] = {s: [] for s in STATUS_LABELS}
    for item in application_outs(db, apps):
        columns[item.status].append(item)
    return BoardOut(columns=[BoardColumn(status=s, label=label, items=columns[s])  # type: ignore[arg-type]
                             for s, label in STATUS_LABELS.items()])


@router.post("", response_model=ApplicationOut, status_code=201)
def create(payload: ApplicationCreate, user: CurrentUser, db: DB) -> ApplicationOut:
    job = get_owned(db, Job, payload.job_id, user, "job")
    if db.scalar(select(Application.id).where(Application.user_id == user.id, Application.job_id == job.id)):
        raise Conflict("You're already tracking this job.", code="application_exists")
    app = create_application(db, user, job, ApplicationStatus(payload.status))
    db.commit()
    return application_out(db, app)


@router.post("/prepare", response_model=ApplicationDetailOut)
def prepare(payload: PrepareIn, user: CurrentUser, db: DB) -> ApplicationDetailOut:
    job = get_owned(db, Job, payload.job_id, user, "job")
    app = prepare_application(db, user, job, resume_id=payload.resume_id,
                              cover_letter_variant=payload.cover_letter_variant,
                              include_cover_letter=payload.include_cover_letter, actor="user")
    db.commit()
    return _detail(db, app)


# ---------------------------------------------------------------------------
# Single application
# ---------------------------------------------------------------------------


@router.get("/{app_id}", response_model=ApplicationDetailOut)
def get_application(app_id: int, user: CurrentUser, db: DB) -> ApplicationDetailOut:
    return _detail(db, _get(db, app_id, user))


def _apply_document_choice(db: Session, user: User, app: Application, payload: ApplicationUpdate) -> list[str]:
    changed: list[str] = []
    fields = payload.model_fields_set
    if "resume_id" in fields and payload.resume_id != app.resume_id:
        if payload.resume_id is not None:
            get_owned(db, Resume, payload.resume_id, user, "resume")
        app.resume_id = payload.resume_id
        if app.resume_version is not None and app.resume_version.resume_id != payload.resume_id:
            app.resume_version_id, app.resume_version = None, None
        changed.append("resume")
    if "cover_letter_id" in fields and payload.cover_letter_id != app.cover_letter_id:
        letter = get_owned(db, CoverLetter, payload.cover_letter_id, user, "cover letter") \
            if payload.cover_letter_id is not None else None
        app.cover_letter_id, app.cover_letter = payload.cover_letter_id, letter
        changed.append("cover letter")
    return changed


def _sync_salary_answer(app: Application, salary: str | None) -> None:
    answer = next((a for a in app.answers if "salary" in a.question.lower()), None)
    if answer is not None and salary:
        answer.answer, answer.source, answer.confirmed = salary, "user", True


@router.patch("/{app_id}", response_model=ApplicationDetailOut)
def update_application(app_id: int, payload: ApplicationUpdate, user: CurrentUser, db: DB) -> ApplicationDetailOut:
    app = _get(db, app_id, user)
    fields = payload.model_fields_set
    if "recruiter_id" in fields and payload.recruiter_id is not None:
        get_owned(db, Recruiter, payload.recruiter_id, user, "contact")
    for key in fields & {"notes", "salary_expectation", "recruiter_id", "rejection_reason"}:
        setattr(app, key, getattr(payload, key))
    if "salary_expectation" in fields:
        _sync_salary_answer(app, payload.salary_expectation)
    changed = _apply_document_choice(db, user, app, payload)
    if changed or "salary_expectation" in fields:
        invalidate_approval(db, app, " and ".join(changed) or "salary expectation")
    refresh_readiness(db, app, load_bundle(db, user), actor="user")
    audit.record(db, user.id, "application.updated", f"Updated {app.job_title} at {app.company_name}",
                 entity_type="application", entity_id=app.id, details={"fields": sorted(fields)})
    db.commit()
    return _detail(db, app)


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: int, user: CurrentUser, db: DB) -> Response:
    app = _get(db, app_id, user)
    keys = [d.file_key for d in app.documents if d.file_key]
    submission.release(app)
    audit.record(db, user.id, "application.deleted", f"Removed {app.job_title} at {app.company_name} from your tracker",
                 entity_type="application", entity_id=app.id)
    db.delete(app)
    db.commit()
    for key in keys:
        get_storage().delete(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{app_id}/status", response_model=ApplicationOut)
def update_status(app_id: int, payload: StatusUpdateIn, user: CurrentUser, db: DB) -> ApplicationOut:
    app = _get(db, app_id, user)
    change_status(db, app, payload.status, actor="user", note=payload.note, board_position=payload.board_position)
    db.commit()
    return application_out(db, app)


@router.post("/{app_id}/readiness/refresh", response_model=ApplicationDetailOut)
def refresh(app_id: int, user: CurrentUser, db: DB) -> ApplicationDetailOut:
    app = _get(db, app_id, user)
    refresh_readiness(db, app, load_bundle(db, user), actor="user")
    db.commit()
    return _detail(db, app)


# ---------------------------------------------------------------------------
# Preview → approve → submit → confirm
# ---------------------------------------------------------------------------


def _preview_rows(app: Application, items: list[dict], answered: int, total: int, method: str) -> list[PreviewRow]:
    version = app.resume_version
    to_confirm = [i for i in items if i["key"] in ("confirmations", "work_authorization")]
    rows = [
        PreviewRow(label="COMPANY", value=app.company_name),
        PreviewRow(label="POSITION", value=app.job_title),
        PreviewRow(label="LOCATION", value=app.location or "Not listed"),
        PreviewRow(label="SOURCE", value=_source_label(app)),
        PreviewRow(label="MATCH", value=f"{app.match_score}%" if app.match_score is not None else "Not scored"),
        PreviewRow(label="RESUME", state="ok" if app.resume_id else "missing",
                   value=(f"Customized — {version.file_name}" if version and version.changes
                          else version.file_name if version else "Not selected")),
        PreviewRow(label="COVER LETTER", state="ok" if app.cover_letter else "info",
                   value="Included" if app.cover_letter else "Not included"),
        PreviewRow(label="ANSWERS", state="ok" if answered == total else "warning",
                   value=f"{answered} of {total} completed"),
    ]
    if to_confirm:
        rows.append(PreviewRow(label="NEEDS CONFIRMATION", state="warning",
                               value="; ".join(i["label"] for i in to_confirm)))
    rows.append(PreviewRow(label="SUBMISSION", value="You'll review and submit on the employer's site"
                           if method == "external_link" else "Browser assist fills the form and stops before submit"))
    rows.append(PreviewRow(label="STATUS", value=STATUS_LABELS.get(app.status.value, app.status.value)))
    return rows


@router.get("/{app_id}/preview", response_model=ApplicationPreview)
def preview(app_id: int, user: CurrentUser, db: DB) -> ApplicationPreview:
    app = _get(db, app_id, user)
    items = readiness.compute_readiness(db, load_bundle(db, user), app)
    answered = sum(1 for a in app.answers if a.answer.strip())
    method = submission.choose_submitter(app).method
    concerns = [*(app.job.match.concerns if app.job and app.job.match else []),
                *(i["label"] for i in items if i["state"] == "warning")]
    return ApplicationPreview(
        application_id=app.id, company=app.company_name, position=app.job_title, location=app.location,
        source=app.source, match=app.match_score,
        resume_file_name=app.resume_version.file_name if app.resume_version else None,
        cover_letter_file_name=cover_letter_file_name(app.company_name) if app.cover_letter else None,
        answers_completed=answered, answers_total=len(app.answers),
        missing=[i["label"] for i in items if i["state"] == "missing"], concerns=concerns,
        status=app.status.value, can_approve=app.status in APPROVABLE and not readiness.has_blocking(items),
        destination=urlparse(app.apply_url).netloc or app.apply_url if app.apply_url else None,
        submission_method=method,  # type: ignore[arg-type]
        rows=_preview_rows(app, items, answered, len(app.answers), method),
    )


def _approve_resume_version(app: Application) -> None:
    version = app.resume_version
    if version is None:
        return
    version.changes = [{**c, "accepted": True if c.get("accepted") is None else c["accepted"]}
                       for c in version.changes or []]
    version.content = resume_tailor.apply_changes(version.base_content or {}, version.changes)
    version.status = "approved"


def _store_documents(db: Session, user: User, app: Application) -> list[str]:
    """Render and store the exact approved files. Returns storage keys of replaced documents."""
    replaced = [d.file_key for d in app.documents if d.file_key]
    app.documents.clear()
    storage = get_storage()
    resume_content = app.resume_version.content if app.resume_version else (app.resume.content if app.resume else None)
    if resume_content:
        name = app.resume_version.file_name if app.resume_version else resume_tailor.tailored_file_name(
            user.full_name, app.job_title, app.company_name)
        data = documents.render_resume(resume_content, "pdf")
        app.documents.append(ApplicationDocument(kind="resume", file_name=name, mime_type=documents.PDF_MIME,
                                                 file_key=storage.put(user.id, name, data)))
    if app.cover_letter is not None:
        name = cover_letter_file_name(app.company_name)
        data = documents.render_cover_letter(app.cover_letter.content, build_contact(load_bundle(db, user)),
                                             company=app.company_name)
        app.documents.append(ApplicationDocument(kind="cover_letter", file_name=name, mime_type=documents.PDF_MIME,
                                                 file_key=storage.put(user.id, name, data)))
    return replaced


@router.post("/{app_id}/approve", response_model=ApplicationDetailOut)
def approve(app_id: int, payload: ApproveIn, user: CurrentUser, db: DB) -> ApplicationDetailOut:
    app = _get(db, app_id, user)
    if app.status not in APPROVABLE:
        raise Conflict("Only applications that are prepared and not yet sent can be approved.",
                       code="not_approvable")
    bundle = load_bundle(db, user)
    app.readiness = readiness.compute_readiness(db, bundle, app)
    blocking = [i for i in app.readiness if i["blocking"]]
    if blocking:
        raise Conflict("Please resolve these items before approving: "
                       + "; ".join(i["label"] for i in blocking) + ".", code="not_ready",
                       details=[{"field": i["field"], "message": i["label"]} for i in blocking])
    unconfirmed = [a for a in app.answers if a.needs_confirmation and not a.confirmed and a.answer.strip()]
    if unconfirmed and not payload.acknowledge_answers:
        raise Conflict(f"Please confirm {len(unconfirmed)} answer{'s' if len(unconfirmed) != 1 else ''} before "
                       "approving — for example your work authorization.", code="answers_unconfirmed",
                       details=[{"field": f"answers.{a.id}", "message": a.question} for a in unconfirmed])
    for answer in unconfirmed:
        answer.confirmed = True
    _approve_resume_version(app)
    if app.cover_letter is not None:
        app.cover_letter.status = "approved"
    replaced = _store_documents(db, user, app)
    app.approved_at = utcnow()
    refresh_readiness(db, app, bundle, actor="user")
    audit.record(db, user.id, "application.approved",
                 f"User approved application: {app.job_title} at {app.company_name}",
                 entity_type="application", entity_id=app.id,
                 details={"documents": [d.file_name for d in app.documents],
                          "answers_acknowledged": len(unconfirmed)})
    db.commit()
    for key in replaced:
        get_storage().delete(key)
    return _detail(db, app)


@router.post("/{app_id}/submit", response_model=SubmitResult)
def submit(app_id: int, user: CurrentUser, db: DB) -> SubmitResult:
    app = _get(db, app_id, user)
    if app.approved_at is None or utcnow() - app.approved_at > APPROVAL_WINDOW:
        raise Forbidden("Please review and approve this application first.", code="approval_required")
    if app.status not in APPROVABLE:
        raise Conflict("This application has already been sent.", code="already_submitted")
    outcome = submission.choose_submitter(app).submit(db, app)
    app.submission_method, app.submission_state = outcome.method, outcome.state
    audit.record(db, user.id, "application.handed_off" if outcome.state == "pending_user" else "application.assisted",
                 f"{outcome.message.split('.')[0]} — {app.job_title} at {app.company_name}",
                 entity_type="application", entity_id=app.id, details={"state": outcome.state,
                                                                       "method": outcome.method})
    db.commit()
    return SubmitResult(application_id=app.id, state=outcome.state, message=outcome.message, apply_url=app.apply_url,
                        steps=[SubmitPlanStep(label=s.label, done=s.done, requires_user=s.requires_user)
                               for s in outcome.steps], status=app.status.value)  # type: ignore[arg-type]


@router.post("/{app_id}/confirm-submitted", response_model=ApplicationDetailOut)
def confirm_submitted(app_id: int, payload: ConfirmSubmittedIn, user: CurrentUser, db: DB) -> ApplicationDetailOut:
    app = _get(db, app_id, user)
    if app.approved_at is None:
        raise Forbidden("Please review and approve this application first.", code="approval_required")
    if app.status not in APPROVABLE:
        raise Conflict("This application is already marked as sent.", code="already_submitted")
    submission.release(app)
    if payload.submitted:
        app.submission_state = "submitted"
        app.submission_method = app.submission_method or "manual"
        change_status(db, app, ApplicationStatus.applied, actor="user", note=payload.note)
        if payload.schedule_follow_up:
            db.add(FollowUp(user_id=user.id, application_id=app.id, channel="dashboard", status="pending",
                            due_at=utcnow() + timedelta(days=payload.follow_up_days),
                            note="Check in on your application"))
        audit.record(db, user.id, "application.submitted",
                     f"Application submitted (confirmed by you): {app.job_title} at {app.company_name}",
                     entity_type="application", entity_id=app.id,
                     details={"method": app.submission_method, "follow_up_days": payload.follow_up_days
                              if payload.schedule_follow_up else None})
    else:
        app.approved_at, app.submission_state = None, None
        change_status(db, app, ApplicationStatus.ready, actor="user", note=payload.note)
        audit.record(db, user.id, "application.submission_cancelled",
                     f"Not submitted — {app.job_title} at {app.company_name} is back in Ready to Apply",
                     entity_type="application", entity_id=app.id)
    db.commit()
    return _detail(db, app)


@router.get("/{app_id}/documents/{doc_id}")
def download_document(app_id: int, doc_id: int, user: CurrentUser, db: DB) -> Response:
    app = _get(db, app_id, user)
    doc = next((d for d in app.documents if d.id == doc_id), None)
    if doc is None or not doc.file_key:
        raise NotFound("document")
    try:
        data = get_storage().get(doc.file_key)
    except FileNotFoundError as exc:
        raise AppError("This file is no longer available. Approve the application again to regenerate it.",
                       code="file_missing", status_code=404) from exc
    return attachment(data, doc.file_name, doc.mime_type or "application/octet-stream")
