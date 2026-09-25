# Deploying Applier on Railway

Applier deploys to Railway as **one service + one PostgreSQL database**. Everything else is
already configured in the repository:

- `Dockerfile` (repo root) builds the web app and the API into one container.
- `railway.json` (repo root) tells Railway to use it, health-check `/api/health`, run a
  single replica and restart on failure.
- `scripts/start.sh` starts the API internally and the web server on Railway's `$PORT`.
- The public URL, secure cookies and OAuth redirect URLs are detected automatically from
  Railway's `RAILWAY_PUBLIC_DOMAIN`.
- Uploaded resumes and generated documents are stored **encrypted in PostgreSQL**, so no
  volume is needed and nothing is lost on redeploys.
- Database tables are created automatically on first start.

## Steps

1. **New Project → Deploy from GitHub repo →** choose your Applier repository (and the
   branch that contains this code).
2. In the project: **+ Create → Database → Add PostgreSQL** (keep the name `Postgres`).
3. Open the **Applier service → Variables → Raw Editor**, paste:

   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APPLIER_SECRET_KEY=<paste>
   APPLIER_ENCRYPTION_KEY=<paste>
   ```

   Generate the two values with `python3 scripts/generate-secrets.py`. Keep them safe and
   never change `APPLIER_ENCRYPTION_KEY` later (stored documents are encrypted with it).
4. **Applier service → Settings → Networking → Generate Domain** (if Railway asks for a
   port, enter the port shown in the deploy logs' "Local:" line — Railway's `PORT`, usually
   `8080`).
5. **Deploy** (apply the staged changes). The first build takes a few minutes.
6. Open `https://<your-domain>/api/health` → `{"status":"ok"}`, then open
   `https://<your-domain>`, create your account, and upload your resume or choose
   **Explore with sample data**.

## Optional variables

Add to the same service, then redeploy.

| Feature | Variables |
|---|---|
| AI-assisted writing (Claude) | `APPLIER_ANTHROPIC_API_KEY=sk-ant-...` |
| Turn off sample data / demo sources | `APPLIER_DEMO_MODE=false` |
| Real employer job boards | `APPLIER_EMPLOYER_BOARDS={"greenhouse":["companyslug"],"lever":["companyslug"]}` |
| Gmail + Google Calendar | `APPLIER_GOOGLE_CLIENT_ID`, `APPLIER_GOOGLE_CLIENT_SECRET` |
| Outlook + Microsoft Calendar | `APPLIER_MICROSOFT_CLIENT_ID`, `APPLIER_MICROSOFT_CLIENT_SECRET` |
| LinkedIn sign-in | `APPLIER_LINKEDIN_CLIENT_ID`, `APPLIER_LINKEDIN_CLIENT_SECRET` |
| Custom domain | `APPLIER_FRONTEND_URL=https://jobs.yourdomain.com` (after adding it under Networking → Custom Domain) |

OAuth redirect URI to register with each provider (`<provider>` = `gmail`,
`google_calendar`, `outlook`, `microsoft_calendar`, `linkedin` or `indeed`):
`https://<your-domain>/api/integrations/<provider>/callback`.

LinkedIn and Indeed **job search** APIs require partner approval; until then those sources
show "not connected" (and labelled sample jobs while demo mode is on).

## Good to know

- Keep **one replica** — scheduled searches and reminders run inside the service.
- Back up the Postgres database (Railway → Postgres → Backups); it holds all data and documents.
- Every push to the deployed branch redeploys automatically.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy fails, logs say *"APPLIER_SECRET_KEY must be set in production"* | Add both secret variables and redeploy. |
| Logs show a database connection error | Check `DATABASE_URL=${{Postgres.DATABASE_URL}}` and that the database is named `Postgres` (or change the reference). |
| Health check keeps failing | Open the deploy logs: the API must print "Application startup complete" before the web server starts. |
| Signed out right after signing in | Use the `https://` domain, not `http://`. |
| OAuth "redirect_uri mismatch" | Register exactly `https://<your-domain>/api/integrations/<provider>/callback`. |

## Advanced: separate web and API services

`backend/railway.json` and `frontend/railway.json` support running the API and web app as
two Railway services (Root Directory `/backend` and `/frontend`, config paths
`/backend/railway.json` and `/frontend/railway.json`). When generating the web service's
domain, use the port its deploy log shows ("Local: http://localhost:8080" → `8080`; Railway
assigns it). The web service then needs
`BACKEND_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000` and the API `PORT=8000`. The
single-service setup above is simpler and recommended.
