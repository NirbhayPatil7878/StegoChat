# Contributing to StegoChat

Thanks for your interest in improving StegoChat. This guide covers local setup,
the quality gates, and how to propose changes.

## Development setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Or run everything with `make dev` from the repo root (see `make help`).

## Quality gates

Every change must pass what CI enforces. Run them locally before pushing:

```bash
# Backend
cd backend
ruff check . && ruff format --check .
mypy app
pytest -q

# Frontend
cd frontend
npm run typecheck
npm run build
```

`pre-commit` runs the fast checks automatically:

```bash
pip install pre-commit && pre-commit install
```

## Database migrations

The schema is managed with Alembic. When you change a model:

```bash
cd backend
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

Commit the generated migration. Do **not** rely on `create_all` for schema
changes in anything beyond throwaway local databases.

## Pull requests

- Branch from `main`; keep PRs focused and reasonably small.
- Add or update tests for behavior changes.
- Update `CHANGELOG.md` under the _Unreleased_ heading.
- Fill out the PR template, including the security-considerations section.
- Never commit secrets, `.env` files, databases, or real user data.

## Security-sensitive changes

Changes to `app/core/` (crypto, stego, security), auth, or upload handling get
extra scrutiny. Explain the threat-model impact in your PR. If you've found a
vulnerability, follow [`SECURITY.md`](SECURITY.md) instead of opening a public
issue.

## Commit style

Use clear, imperative commit subjects (e.g. "Add readiness probe"). Group
logically related changes into a single commit where practical.
