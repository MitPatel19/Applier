FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    APPLIER_ENVIRONMENT=production \
    APPLIER_STORAGE_DIR=/app/data/storage
WORKDIR /app
RUN useradd --create-home --uid 10001 applier
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN mkdir -p /app/data/storage && chown -R applier /app/data
USER applier
EXPOSE 8000
# $PORT is provided by the platform (Railway). HOST defaults to "::" (IPv4 + IPv6) so private
# networking works. Proxy headers are trusted because the API is only reached through the web app.
CMD ["sh", "-c", "exec uvicorn app.main:app --host ${HOST:-::} --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
