# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Two-factor authentication (TOTP)** — enroll via QR code with 10 single-use
  recovery codes; login requires an authenticator code. New `/auth/2fa/*`
  endpoints and a Settings panel.
- **Universal file hiding** — hide *any* file inside *any* carrier (image, video,
  audio, PDF, zip…) via encrypted append; the carrier still opens normally.
  New `/hide-file` and `/reveal-file` endpoints and a Studio "Hide any file" tab.
- **Multi-image split embedding** — spread one message across several cover
  images and reassemble from any order. New `/embed-split` / `/extract-split`
  endpoints and a Studio "Split across images" tab.
- **QR codes for share links** — scannable, downloadable QR for every share link
  (Studio and Tokens page); generated fully client-side.
- **Breached-password check** — registration and password changes reject
  passwords found in HaveIBeenPwned via k-anonymity (stdlib only; fails open).
- One-click **Auto-generate** for decoy messages (plausible text + distinct
  password, and a random cover image if none chosen) in Studio and Chat.
- Industrial-readiness foundation:
  - GitHub Actions CI (backend lint/type/test, frontend type/build, dependency
    audit, Docker image builds) and Dependabot.
  - `SECURITY.md` threat model and responsible-disclosure policy.
  - `CONTRIBUTING.md`, issue/PR templates, `CODEOWNERS`.
  - Ruff + Mypy config, `requirements-dev.txt`, pre-commit hooks, root `Makefile`.
  - Alembic database migrations wired to the ORM metadata.
  - DB-backed readiness probe (`/api/ready`) and build metadata on `/api/health`.

### Changed
- `requirements.txt` now installs the PostgreSQL driver (`psycopg[binary]`) by
  default so the production Docker image matches `docker-compose.yml`.

## [2.0.0] - 2026-07-16

### Added
- Production rebuild: FastAPI + React + real AES-256-GCM crypto, LSB
  steganography, decoy messages, dead drops, EOF file hiding, forensic analyzer,
  JWT auth with rotating refresh tokens, Docker deployment.
