# --- StegoChat backend (FastAPI) ---
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for Pillow/numpy wheels are already covered by manylinux wheels,
# but keep build tooling minimal.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Build metadata: pass with `docker build --build-arg GIT_SHA=$(git rev-parse HEAD)`.
ARG GIT_SHA=unknown
ENV STEGOCHAT_GIT_SHA=${GIT_SHA}

# Non-root user
RUN useradd -m appuser && mkdir -p /data/uploads /data/samples \
    && chown -R appuser:appuser /app /data
USER appuser

ENV STEGOCHAT_HOST=0.0.0.0 \
    STEGOCHAT_PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
