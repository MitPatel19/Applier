# Architecture

Applier is a human-in-the-loop career agent. The agent does the repetitive work —
searching, deduplicating, analyzing, scoring, tailoring, preparing — and the user makes
every consequential decision. This document explains how the system is put together and
why.

```
┌──────────────────────────── Browser ────────────────────────────┐
│ Next.js 16 (App Router, React 19, Tailwind v4, React Query)      │
│  /api/* ──(same-origin rewrite, httpOnly session cookie)──┐      │
└───────────────────────────────────────────────────────────┼──────┘
                                                            ▼
┌──────────────────────────── FastAPI ─────────────────────────────┐
│ routers/ (REST, Pydantic validation, friendly error envelope)     │
│    │                                                              │
│ services/                                                         │
│   sources/ ── LinkedIn · Indeed · Employer ATS/JSON-LD · Demo     │
│   jobs_ingest → dedup → jd_extract → quality → matching           │
│   resume_parser · resume_builder · resume_tailor · documents      │
│   cover_letter · answers · readiness · application_prep           │
│   application_status · submission/ (external link | browser assist)│
│   interview_prep · followups · networking · reminders · analytics │
│   agent/runner (steps, audit, notifications) · agent/scheduler    │
│   llm (optional Claude, integrity guard) · audit · notifications  │
│    │                                                              │
│ SQLAlchemy 2 ── PostgreSQL (SQLite in dev)   Encrypted file store │
└──────────────────────────────────────────────────────────────────┘
```

## The core journey

`Discover → Analyze → Customize → Review → Confirm → Apply → Track → Follow Up → Interview`

| Stage | Where | What happens |
|---|---|---|
| Discover | `agent/runner.py`, `sources/*`, `jobs_ingest.py` | The agent queries each enabled source, normalizes postings and merges duplicates into one `Job` with several `JobSource` rows ("Found on LinkedIn + Indeed + Company Website"). |
| Analyze | `jd_extract.py`, `quality.py`, `company_research.py` | Requirements, skills, education, experience, certifications, salary and work arrangement are extracted; quality rules hide or flag postings; company facts are collected and labelled *verified*, *opinion* or *inferred*. |
| Score | `matching.py` | A weighted, per-category score with human-readable reasons, matched and missing items. Categories without data are excluded rather than guessed. Users can change the weights. |
| Customize | `resume_tailor.py`, `cover_letter.py`, `answers.py` | Tailoring only reorders, emphasizes and rewords facts that exist in the user's profile. Every change is a reviewable item the user can accept or reject. |
| Review | `readiness.py`, `/applications/{id}/preview` | A readiness checklist (✅ / ⚠️ / ❌) and a full application preview. Blocking items must be resolved first. |
| Confirm | `/applications/{id}/approve` | Explicit, per-application approval. Answers with legal weight (work authorization, sponsorship, salary) must be confirmed individually. The exact approved documents are stored. |
| Apply | `/applications/{id}/submit`, `submission/*` | Only within 30 minutes of approval. Default: hand-off to the employer's site with everything prepared; status becomes *Applied* only after the user confirms they submitted. Browser assistance (opt-in) fills forms and **stops before the final submit**; CAPTCHA/MFA pause for the user. |
| Track | `application_status.py`, `/applications/board` | 14-stage Kanban with history; email sync can detect confirmations, interviews, rejections and offers (high-confidence only). |
| Follow up | `followups.py`, `reminders.py` | Suggested follow-up dates, reminders, and generated follow-up messages. |
| Interview | `interview_prep.py`, `practice.py` | An Interview Preparation Center built from the job, the company and the user's real experience (STAR stories never invent outcomes), plus mock-interview feedback. |

## Integrity guarantees (enforced in code)

1. **No fabricated facts.** `services/profile_bundle.py` is the single source of user
   facts. Tailoring can only add a skill keyword the profile already contains; job
   keywords the user lacks are reported as *not added*. When Claude is used for wording,
   `llm.unsupported_claims` rejects output that mentions skills outside the profile and
   rewrites that introduce new numbers are discarded.
2. **No submission without approval.** `approve` and `submit` are separate calls; `submit`
   fails without a recent approval, and `auto_submit` is hard-wired to `false` in the
   agent settings schema.
3. **No false "Applied".** External-link submissions stay in `pending_user` until the user
   confirms.
4. **No security bypass.** Sources use official APIs, authorized integrations or public
   machine-readable endpoints (Greenhouse/Lever/Ashby job-board APIs, schema.org
   `JobPosting` JSON-LD where robots.txt allows). LinkedIn and Indeed search require
   partner access; without it those sources report *not connected* (and demo mode serves
   clearly-labelled sample data instead).
5. **Transparency.** Every agent step is persisted on `AgentTask.steps` and every
   meaningful action on `AuditLog`.

## Data model

27 tables, all user-owned rows cascade on account deletion. Key relationships:

- `User` 1–1 `UserProfile`, `UserPreference` (search profile, scoring weights, quality
  filters, agent/notification/UI settings as validated JSON).
- `User` 1–n `Education`, `Experience`, `Skill`, `Project`.
- `Resume` 1–n `ResumeVersion` (job-specific tailored copy with `changes` + `base_content`).
- `Company` 1–n `Job` 1–n `JobSource`; `Job` 1–1 `JobMatch`.
- `Application` (unique per user+job) 1–n `ApplicationAnswer`, `ApplicationDocument`,
  `ApplicationStatusChange`, `Interview`, `FollowUp`; n–1 `ResumeVersion`, `CoverLetter`,
  `Recruiter`.
- `JobSearch` (saved/scheduled searches), `AgentTask`, `AuditLog`, `Notification`,
  `Integration` (encrypted tokens), `EmailMessage` (job-related only), `Template`.

Indexes cover the hot paths: job dedup keys, per-user job listing, application status,
notification unread counts and audit timelines.

## Security

| Concern | Implementation |
|---|---|
| Passwords | Argon2id (`argon2-cffi`); never logged or exported. |
| Sessions | Short-lived HS256 JWT in an httpOnly, SameSite=Lax cookie (Secure in production); `token_version` revokes all sessions. Bearer tokens supported for API clients. |
| CSRF | Cookie-authenticated mutations require `X-Requested-With`, which cross-site forms cannot set. |
| Authorization | Every query is scoped by `user_id` (`get_owned`); foreign ids return 404. `role` supports admin-only endpoints. |
| Encryption at rest | Uploaded documents and OAuth tokens are encrypted with Fernet (`APPLIER_ENCRYPTION_KEY`); use disk/DB encryption as well in production. |
| Encryption in transit | Deploy behind TLS; `APPLIER_COOKIE_SECURE=true` enables Secure cookies and HSTS. |
| Integrations | OAuth with `state` validation and minimum scopes; tokens deleted on disconnect. |
| Rate limiting | Login throttling per email + IP. |
| Headers | `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, permissions policy, `no-store` on API responses. |
| Privacy | Full JSON export, account deletion (rows + files), privacy summary endpoint, audit log. |
| Secrets | Loaded from environment only; production refuses to start without `APPLIER_SECRET_KEY` and `APPLIER_ENCRYPTION_KEY`. |

## Background work

`agent/runner.py` runs agent tasks in worker threads with their own DB sessions and
commits after each step so the UI can poll live progress. `agent/scheduler.py` is an
asyncio loop that starts due saved searches, preference-based searches and reminders.
The runner is deliberately isolated behind `start_search_task(...)`, so moving to a
dedicated queue (Celery, RQ, Arq, Cloud Tasks) only changes that function.

## Frontend

- **Routing**: `src/app/(app)/*` is the authenticated app (auth guard + shell),
  `src/app/(auth)/*` sign-in/up, `src/app/onboarding`, public `src/app/page.tsx` and
  `src/app/security`.
- **Data**: React Query hooks per domain in `src/lib/queries/*`; a typed client in
  `src/lib/api.ts` normalizes every error into a user-safe `ApiError`.
- **Design system**: semantic tokens in `globals.css` (light, dark, high contrast), a
  typography scale (display / h1 / h2 / h3 / body / caption), radius and shadow scales, and
  components in `src/components/ui` (buttons, cards, inputs, dialogs, tabs, switches,
  sliders, tooltips, menus, badges, progress, score ring/bars, skeletons, empty/error
  states, tag inputs). Domain components live in `src/components/<area>`.
- **Accessibility**: skip link, landmarks, labelled fields with error wiring, visible focus
  rings, keyboard alternatives for drag-and-drop, `aria-live` agent progress, reduced
  motion (OS setting or in-app), high-contrast mode, responsive typography.

## Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| Domain services | pytest | Extraction, matching explanations, dedup, query parsing, quality rules, tailoring integrity, cover letter guardrails, email classification, analytics math. |
| API | pytest + FastAPI TestClient (fresh SQLite per test) | Auth/CSRF/rate limits, ownership isolation, the full prepare → approve → submit → confirm flow, privacy export/deletion. |
| Frontend units | Vitest | API client error normalization, CSRF header, formatting helpers. |
| End-to-end | Playwright (Chromium) | Critical journeys: onboarding, search, prepare & approve, pipeline drag-and-drop. |
| Static | `tsc --noEmit`, ESLint, Ruff | Type safety and lint on every change. |

## Database migrations

Tables are created with `Base.metadata.create_all` on startup, which is enough for a new
database and for adding new tables. Changing columns of existing tables in a live database
needs a migration: add Alembic (`alembic init`, point `target_metadata` at
`app.db.Base.metadata`, generate revisions with `--autogenerate`) and run
`alembic upgrade head` before starting the API (e.g. as the Railway pre-deploy command).
