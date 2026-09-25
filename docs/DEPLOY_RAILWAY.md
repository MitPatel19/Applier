# Deploying Applier on Railway

You'll create **one Railway project with three services**:

```
            Internet (HTTPS)
                  │
          ┌───────▼────────┐   private network   ┌──────────────┐        ┌────────────┐
          │  web (Next.js) │ ──── /api/* ──────▶ │ api (FastAPI)│ ─────▶ │  Postgres  │
          │  public domain │                     │ no public URL│        │ (Railway)  │
          └────────────────┘                     │ + volume     │        └────────────┘
                                                 └──────────────┘
```

The browser only ever talks to **web**. Web forwards `/api/*` to **api** over Railway's
private network, so the session cookie stays first-party and the API needs no public URL.

> Service names matter: the variable references below use `api`, `web` and `Postgres`.
> If you name the services differently, change the references to match.

---

## 0. Before you start

1. **Push the code to GitHub.** Railway deploys from a GitHub repository, so the branch
   with this code (e.g. `claude/adoring-hypatia-xge32u`, or `main` after you merge it) must
   be on GitHub.
2. **Generate your two production secrets** (keep them somewhere safe — changing them later
   signs everyone out, and losing the encryption key makes stored documents and OAuth
   tokens unreadable):

   ```bash
   python3 scripts/generate-secrets.py
   ```

   It prints `APPLIER_SECRET_KEY=...` and `APPLIER_ENCRYPTION_KEY=...`.

---

## 1. Create the project and the database

1. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**
   → pick your `Applier` repository. Railway creates a first service from it; you'll turn
   that into the `api` service in step 2.
2. In the project canvas click **+ Create** (or **New**) → **Database** → **Add PostgreSQL**.
   Leave its name as **`Postgres`**.

---

## 2. The `api` service (FastAPI backend)

Open the service created from your repo → **Settings**:

| Setting | Value |
|---|---|
| Service name (top of settings) | `api` |
| Source → **Branch** | the branch you pushed |
| Source → **Root Directory** | `/backend` |
| **Config-as-code file path** | `/backend/railway.json` |
| Build → Watch Paths (optional) | `/backend/**` |
| Networking | **Do not** generate a public domain (web reaches it privately) |

`backend/railway.json` already tells Railway to build `backend/Dockerfile`, run one
replica, restart on failure and health-check `GET /api/health`.

### Add a volume (uploaded resumes and generated documents)

Right-click the `api` service (or **+ Create → Volume**) → **Attach volume to `api`** →
**Mount path: `/app/data`**. Without a volume, uploaded files disappear on every deploy.

### Variables (`api` → Variables → Raw Editor), paste and fill in:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
APPLIER_SECRET_KEY=<from scripts/generate-secrets.py>
APPLIER_ENCRYPTION_KEY=<from scripts/generate-secrets.py>
APPLIER_COOKIE_SECURE=true
APPLIER_FRONTEND_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
APPLIER_CORS_ORIGINS=["https://${{web.RAILWAY_PUBLIC_DOMAIN}}"]
APPLIER_DEMO_MODE=true
PORT=8000
RAILWAY_RUN_UID=0
```

What each one does:

- `DATABASE_URL` — links the Railway Postgres. The app converts `postgresql://` to the
  psycopg driver automatically and creates all tables on first start.
- `APPLIER_SECRET_KEY` / `APPLIER_ENCRYPTION_KEY` — **required**; the API refuses to start
  in production without them.
- `APPLIER_COOKIE_SECURE=true` — Railway serves HTTPS, so session cookies are marked Secure.
- `APPLIER_FRONTEND_URL` / `APPLIER_CORS_ORIGINS` — your public web address (used for OAuth
  redirects and CORS). The `${{web...}}` reference resolves once `web` has a domain (step 3).
- `APPLIER_DEMO_MODE=true` — keeps "Explore with sample data" and labelled sample job
  sources available. Set `false` once you've connected real sources.
- `PORT=8000` — pins the internal port so `web` can reach it at a known address.
- `RAILWAY_RUN_UID=0` — the image runs as a non-root user, but Railway volumes are
  owned by root; this lets the service write to the volume.

---

## 3. The `web` service (Next.js frontend)

In the project canvas: **+ Create → GitHub Repo** → the same repository again. Then open
its **Settings**:

| Setting | Value |
|---|---|
| Service name | `web` |
| Source → **Branch** | the same branch |
| Source → **Root Directory** | `/frontend` |
| **Config-as-code file path** | `/frontend/railway.json` |
| Build → Watch Paths (optional) | `/frontend/**` |
| Networking → **Generate Domain** | yes — **target port `3000`** |

### Variables (`web` → Variables → Raw Editor):

```env
BACKEND_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000
```

`BACKEND_URL` is baked in when the frontend is **built** (the `/api` forwarding rule is
compiled into the app), so **redeploy `web` whenever you change it**.

---

## 4. Deploy and check

1. Click **Deploy** (or **Apply changes**) for the staged changes. Railway builds both
   Docker images; the first build takes a few minutes.
2. After `web` has its domain, **redeploy `api` once** so `APPLIER_FRONTEND_URL` picks up
   the resolved domain.
3. Check the stack end to end — this goes browser → web → private network → api → Postgres:

   ```
   https://<your-web-domain>/api/health   →   {"status":"ok"}
   ```

4. Open `https://<your-web-domain>`, click **Get started**, create your account, and either
   upload your resume or choose **Explore with sample data** on the first onboarding step.

---

## 5. Optional features

Add these to the **`api`** service variables, then redeploy `api`.

| Feature | Variables |
|---|---|
| AI-assisted writing (Claude) | `APPLIER_ANTHROPIC_API_KEY=sk-ant-...` |
| Real employer job boards | `APPLIER_EMPLOYER_BOARDS={"greenhouse":["companyslug"],"lever":["companyslug"],"ashby":["companyslug"]}` |
| Gmail + Google Calendar | `APPLIER_GOOGLE_CLIENT_ID`, `APPLIER_GOOGLE_CLIENT_SECRET` |
| Outlook + Microsoft Calendar | `APPLIER_MICROSOFT_CLIENT_ID`, `APPLIER_MICROSOFT_CLIENT_SECRET` |
| LinkedIn sign-in | `APPLIER_LINKEDIN_CLIENT_ID`, `APPLIER_LINKEDIN_CLIENT_SECRET` |

For every OAuth app, register this **redirect URI** in the provider's developer console
(replace `<provider>` with `gmail`, `google_calendar`, `outlook`, `microsoft_calendar`,
`linkedin` or `indeed`):

```
https://<your-web-domain>/api/integrations/<provider>/callback
```

LinkedIn and Indeed **job search** APIs are only available to approved partners. Without
partner access those sources show "not connected" (and sample jobs in demo mode).

### Custom domain

`web` → Settings → Networking → **Custom Domain**, add the DNS record Railway shows, then
update `APPLIER_FRONTEND_URL` / `APPLIER_CORS_ORIGINS` on `api` and any OAuth redirect URIs.

---

## 6. Keep it healthy

- **Keep one replica of `api`.** The job-search scheduler, reminders and login rate-limiter
  run inside the API process; several replicas would duplicate scheduled searches.
- **Backups:** Railway Postgres → Backups; also back up the `api` volume if documents matter.
- **Secrets:** never change `APPLIER_ENCRYPTION_KEY` after users upload documents or
  connect accounts (existing encrypted data could no longer be read).
- **Updates:** push to the branch → Railway rebuilds the service whose watch paths changed.
  Tables are created automatically; a future schema *change* to existing tables needs a
  migration (see "Database migrations" in `docs/ARCHITECTURE.md`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `api` crashes: *"APPLIER_SECRET_KEY must be set in production"* | Add both secrets (step 2), redeploy. |
| `https://<web>/api/health` returns 500/502/504 | `web` can't reach `api`: check `BACKEND_URL` is exactly `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000`, `api` has `PORT=8000` and is running, then **redeploy `web`** (build-time value). If your project uses an older IPv6-only private network and it still fails, see the `HOST` note below. |
| `PermissionError` under `/app/data` in `api` logs | Add `RAILWAY_RUN_UID=0` to `api`, redeploy. |
| Signing in works but you're immediately signed out | `APPLIER_COOKIE_SECURE=true` requires HTTPS — use the `https://` Railway domain. |
| Uploaded resumes disappear after a deploy | Attach the volume at `/app/data` (step 2). |
| OAuth "redirect_uri mismatch" | The redirect URI in the provider console must match `https://<web-domain>/api/integrations/<provider>/callback` exactly. |

**`HOST` note:** the API listens on `::` (IPv6 + IPv4), which is what Railway's private
network needs. If a health check ever fails because nothing answers on IPv4, set
`HOST=0.0.0.0` on `api` — but on IPv6-only private networks `web` then can't reach it,
so only change this if you see that specific failure.
