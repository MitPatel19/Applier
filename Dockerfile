# Single-container build: Next.js web app + FastAPI API in one service.
# The web server listens on $PORT (public) and proxies /api/* to the API on 127.0.0.1:8765.
# Used by Railway (root railway.json). docker-compose.yml builds the two services separately.

# ---- web: install + build --------------------------------------------------------------
FROM node:22-bookworm-slim AS web-deps
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS web-build
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1 BACKEND_URL=http://127.0.0.1:8765
COPY --from=web-deps /web/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

# ---- runtime: Python API + Node web server -----------------------------------------------
FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    APPLIER_ENVIRONMENT=production APPLIER_STORAGE_DIR=/app/data/storage
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web-build /web/.next/standalone ./web
COPY --from=web-build /web/.next/static ./web/.next/static
COPY --from=web-build /web/public ./web/public
COPY scripts/start.sh ./start.sh
RUN useradd --create-home --uid 10001 applier && mkdir -p /app/data/storage && chown -R applier /app/data \
    && chmod +x ./start.sh
USER applier
EXPOSE 3000
CMD ["./start.sh"]
