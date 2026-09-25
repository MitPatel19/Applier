#!/usr/bin/env bash
# Starts the API (internal, 127.0.0.1:8765) and the web server (public, $PORT) in one container.
# If either process exits, the container exits so the platform restarts it.
set -euo pipefail

API_PORT=8765
cd /app
uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" --proxy-headers --forwarded-allow-ips 127.0.0.1 &
api_pid=$!

# Wait for the API before accepting traffic (creates tables on first boot).
for _ in $(seq 1 120); do
  if python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:$API_PORT/api/health', timeout=2)" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "API failed to start" >&2
    exit 1
  fi
  sleep 1
done

cd /app/web
HOSTNAME=0.0.0.0 PORT="${PORT:-3000}" node server.js &
web_pid=$!

trap 'kill -TERM "$api_pid" "$web_pid" 2>/dev/null' TERM INT
wait -n "$api_pid" "$web_pid"
status=$?
kill -TERM "$api_pid" "$web_pid" 2>/dev/null || true
exit "$status"
