# Applier — your personal AI career agent

Applier is a human-in-the-loop job application agent. It does the repetitive work of a job
search: finding postings, merging duplicates, reading job descriptions, scoring fit,
tailoring your resume, drafting cover letters and preparing answers. **You make every
decision that matters.** Nothing is ever submitted without your explicit approval for that
specific application, and Applier never invents experience you don't have.

```
Discover → Analyze → Customize → Review → Confirm → Apply → Track → Follow Up → Interview
```

## What's inside

| Area | Highlights |
|---|---|
| **Job discovery** | LinkedIn, Indeed and employer career sites (public Greenhouse / Lever / Ashby job boards and schema.org `JobPosting` pages where robots.txt allows). Duplicate postings across sources become one job: *Found on LinkedIn + Indeed + Company Website*. |
| **Natural-language search** | "Find junior Python and Java developer jobs in Thunder Bay and remote Canada, posted within the last 7 days, paying at least $55,000." is turned into filters you can check and edit before it runs. Searches can be saved and scheduled. |
| **Transparent matching** | Scores in 9 weighted categories (skills, experience, education, location, salary, work arrangement, employment type, career alignment, required qualifications). Each category lists its reasons, what you have and what's missing. You can change the weights. |
| **Quality filters** | Automatically hide postings you can't or won't apply to. Flag unclear salary, suspicious postings, approaching deadlines and old postings. |
| **Resume Center** | Upload PDF/DOCX resumes (they're parsed into a structured profile) or build one from your profile. Tailored versions come with a change list you can accept or reject, and job keywords you *don't* have are reported, never added. |
| **Cover letters** | Professional, short and personalized versions built from your real experience and verified company facts. |
| **Ready to Apply** | Readiness checklist (✅ / ⚠️ / ❌) with inline fixes, editable answers, a full preview and an explicit *Confirm Application* step. You finish on the employer's site, and the application is marked *Applied* only after you confirm you submitted it. |
| **Tracking** | 14-stage Kanban pipeline with drag-and-drop (keyboard accessible), history table, application timeline, follow-up reminders and message generator, networking contacts. |
| **Interviews** | Interview Preparation Center: likely technical topics, behavioral questions, STAR stories built from your own experience, questions to ask, and mock-interview feedback. |
| **Career Agent** | Live step-by-step view of what the agent is doing, run history, sources status and controls for each automatic action. Automatic submission is locked off. |
| **Analytics** | Funnel, response and interview rates, best sources and titles, and resume performance, labelled as observed patterns rather than proof of what works. |
| **Trust & privacy** | Audit log of every action, notifications, OAuth integrations with plain-language scopes, encrypted documents and tokens, data export and full account deletion. |

## Quick start

Requirements: Python 3.11+, Node.js 20.9+.

```bash
./scripts/dev.sh          # creates the venv, installs dependencies, runs API :8000 + web :3000
```

Or run each side yourself:

```bash
# API
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env      # optional: adjust settings
.venv/bin/uvicorn app.main:app --reload --port 8000     # docs at http://localhost:8000/api/docs

# Web
cd frontend
npm install
npm run dev               # http://localhost:3000
```

Create an account at http://localhost:3000/register. On the onboarding's first step,
choose **Explore with sample data** to load a realistic profile, resumes, jobs,
applications and interviews. Sample data is clearly labelled and can be removed from
*Settings → Sample data*.

### Deploy on Railway

One service + PostgreSQL; the root `Dockerfile` and `railway.json` are picked up
automatically. You only add three variables (`DATABASE_URL=${{Postgres.DATABASE_URL}}`,
`APPLIER_SECRET_KEY`, `APPLIER_ENCRYPTION_KEY`; generate the secrets with
`python3 scripts/generate-secrets.py`). Full guide: [`docs/DEPLOY_RAILWAY.md`](docs/DEPLOY_RAILWAY.md).

### Production (Docker)

```bash
export POSTGRES_PASSWORD=... APPLIER_SECRET_KEY=... APPLIER_ENCRYPTION_KEY=...
docker compose up --build   # PostgreSQL + API + web on http://localhost:3000
```

Run it behind TLS and keep `APPLIER_COOKIE_SECURE=true`. See `backend/.env.example` for
every setting.

## Job sources and integrations

- **Employer websites** need no account. Configure public ATS boards with
  `APPLIER_EMPLOYER_BOARDS`. Company career pages are read only when robots.txt allows it.
- **LinkedIn and Indeed** job search APIs are only available to approved partners. Until a
  deployment has partner access (`APPLIER_LINKEDIN_PARTNER_ACCESS` /
  `APPLIER_INDEED_PARTNER_ACCESS` plus a partner client), those sources show as
  *not connected*. In demo mode they are replaced by clearly-labelled sample postings.
  Applier never scrapes behind a login, bypasses CAPTCHA or evades anti-bot protections.
- **Email (Gmail/Outlook) and calendars** connect through OAuth once the matching
  `APPLIER_*_CLIENT_ID/SECRET` values are set. Email sync only queries job-related
  messages (confirmations, interview invitations, recruiter messages, rejections, offers).
- **AI writing** (optional): set `APPLIER_ANTHROPIC_API_KEY` to have Claude polish cover
  letters, resume bullets and messages. Every AI output passes an integrity check and is
  discarded if it mentions skills or numbers that aren't in your profile. Without a key,
  deterministic templates are used.

## Tests

```bash
cd backend && .venv/bin/pytest                  # 225 API + service tests
cd frontend && npm test                         # unit tests (Vitest)
cd frontend && npm run typecheck && npx eslint src
cd frontend && npx playwright test              # end-to-end journeys (starts both servers if needed)
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system design, the journey stage by stage,
  integrity guarantees, data model, security, background work, frontend structure and
  testing strategy.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md): every endpoint, request and response.
- [`docs/DEPLOY_RAILWAY.md`](docs/DEPLOY_RAILWAY.md): deploying on Railway.

## Project layout

```
backend/
  app/
    api/routers/        REST endpoints (auth, profile, resumes, jobs, applications, agent, ...)
    services/           domain logic: sources, dedup, matching, tailoring, prep, analytics, ...
    models.py           SQLAlchemy data model
    schemas/            Pydantic API contract
  tests/                pytest suite
frontend/
  src/app/              Next.js routes: marketing, auth, onboarding and the (app) group
  src/components/       ui/ design system + one folder per product area
  src/lib/              typed API client, types, React Query hooks
  e2e/                  Playwright journeys
docs/                   architecture and API contract
```
