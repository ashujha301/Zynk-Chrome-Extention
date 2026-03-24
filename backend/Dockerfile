# Stage 1 — build deps
FROM python:3.11-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m venv /build/venv && \
    /build/venv/bin/pip install --upgrade pip && \
    /build/venv/bin/pip install --no-cache-dir -r requirements.txt
 
# Stage 2 — runtime only
FROM python:3.11-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libpq5 curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/venv /venv
COPY . .
ENV PATH="/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/model_cache
RUN mkdir -p /app/model_cache
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
CMD ["/venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
