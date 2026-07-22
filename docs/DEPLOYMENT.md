# Deployment Guide

## Option A — Docker Compose (self-hosted, recommended)

```bash
cp .env.example .env
# Edit .env: set a strong STEGOCHAT_SECRET_KEY and Postgres credentials.
docker compose up --build -d
```

Services:
- `db` — Postgres 16 with a persistent volume.
- `backend` — FastAPI/uvicorn, waits for a healthy DB, uses the `psycopg` driver.
- `frontend` — nginx serving the built SPA and proxying `/api` to `backend`.

The UI is exposed on `WEB_PORT` (default 8080). Put a TLS-terminating reverse
proxy (Caddy, Traefik, or nginx) in front for HTTPS.

Generate a secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Database migrations

The schema is managed with Alembic. On a fresh database or after upgrading,
apply migrations before serving traffic:

```bash
cd backend
alembic upgrade head            # local / venv
# or inside the running container:
docker compose exec backend alembic upgrade head
```

The app also calls `create_all` on startup as a convenience for local SQLite,
but production deploys should treat `alembic upgrade head` as the source of
truth for schema changes.

### Health & readiness probes

- `GET /api/health` — liveness + build metadata (version, commit, uptime). Cheap;
  never touches the database. Use for container liveness checks.
- `GET /api/ready` — readiness: verifies the database is reachable and returns
  `503` when it is not. Use for load-balancer / orchestrator readiness gates.
  The compose `backend` service already health-checks this endpoint, and the
  `frontend` waits for it to pass.

Pass the build commit through at image build time so it shows up on `/api/health`:

```bash
GIT_SHA=$(git rev-parse --short HEAD) docker compose build backend
```

## Option B — Split hosting

### Frontend → Vercel / Netlify / any static host
```bash
cd frontend
npm ci && npm run build      # outputs dist/
```
Set `VITE_API_BASE` to your backend URL (e.g. `https://api.example.com/api`) at
build time, or keep same-origin `/api` behind a proxy.

### Backend → Railway / Render / Fly.io
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Install: `pip install -r requirements.txt` plus `psycopg[binary]` for Postgres.
- Required env vars:

| Variable | Example |
|----------|---------|
| `STEGOCHAT_SECRET_KEY` | long random string |
| `STEGOCHAT_DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/db` |
| `STEGOCHAT_ENVIRONMENT` | `production` |
| `STEGOCHAT_DEBUG` | `false` |
| `STEGOCHAT_CORS_ORIGINS` | `["https://app.example.com"]` |

## Database

- **Dev:** SQLite (`sqlite:///./stegochat.db`), created automatically.
- **Prod:** PostgreSQL via `STEGOCHAT_DATABASE_URL`. Tables are created on
  startup (`init_db`). For managed schema changes, introduce Alembic migrations.

## Production checklist

- [ ] Strong, unique `STEGOCHAT_SECRET_KEY`.
- [ ] `STEGOCHAT_ENVIRONMENT=production` (enables HSTS header).
- [ ] HTTPS terminated by a reverse proxy.
- [ ] `STEGOCHAT_CORS_ORIGINS` restricted to your real frontend origin.
- [ ] Persistent volume for `uploads/` (or migrate to S3).
- [ ] Backups configured for the Postgres volume.
- [ ] Consider tightening `rate_limit_*` values for your traffic.

## Storage

Generated stego files live in `STEGOCHAT_UPLOAD_DIR` (`/data/uploads` in Docker).
The code centralizes storage in `services/storage.py`, so swapping to S3 later is
a localized change.
