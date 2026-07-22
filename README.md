<div align="center">

<img src="frontend/public/logo.svg" width="96" alt="StegoChat" />

# StegoChat

**Hide AES-256 encrypted messages inside ordinary images.**

Secure steganographic messaging built with FastAPI, React, and real cryptography.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

</div>

---

## What it does

StegoChat lets you **encrypt a message and hide it inside an image's pixels** — the result looks completely ordinary, but only the correct password can reveal what's inside.

| Feature | Description |
|---|---|
| 🔐 **Real crypto** | AES-256-GCM with PBKDF2 key derivation, random salt + IV per message. Wrong passwords are rejected cleanly, never silently misread. |
| 🖼️ **LSB steganography** | Ciphertext is scattered across pixels in a password-seeded random order — hidden and statistically hard to detect. |
| 🕵️ **Decoy messages** | Embed a second innocent message under a different password. Hand it over under duress. |
| ⏱️ **Dead drops** | Self-destructing one-time links that burn on open or expire on a timer. |
| 📎 **Universal file hiding** | Conceal any file inside any carrier — image, video, audio, PDF, zip. The carrier still opens normally. |
| 🧩 **Multi-image split** | Spread one message across several images; reassemble in any order. Bypasses single-image capacity limits. |
| 🔗 **QR share links** | Every share link includes a scannable, downloadable QR code — generated entirely client-side. |
| 🔬 **Forensic analyzer** | Scan any image for entropy anomalies and hidden-data fingerprints. |
| 👤 **Full auth** | JWT + rotating refresh tokens, bcrypt, TOTP 2FA with recovery codes, and breached-password rejection via HaveIBeenPwned. |
| 🎨 **Premium UI** | React + Tailwind + Framer Motion, glassmorphism, dark/light themes, 5 accent colors, fully responsive. |

---

## Tech stack

| Layer | Choice |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, React Query, Zustand, Recharts |
| **Backend** | FastAPI, SQLAlchemy 2, Pydantic v2, slowapi |
| **Crypto** | PyCryptodome (AES-256-GCM, PBKDF2), bcrypt, python-jose (JWT) |
| **Imaging** | Pillow, NumPy |
| **Database** | SQLite (dev) · PostgreSQL (production, one env var) |
| **Infra** | Docker, docker-compose, nginx |

---

## Quick start

### Option A — Local dev

**Prerequisites:** Python 3.11+, Node 18+

**1. Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API: `http://localhost:8000` · Docs: `http://localhost:8000/api/docs`
SQLite database is created automatically — no database server needed.

**2. Frontend**
```bash
cd frontend
npm install
npm run dev
```
App: `http://localhost:5173` · The dev server proxies `/api` to the backend automatically.

---

### Option B — Docker (one command)

```bash
cp .env.example .env    # set STEGOCHAT_SECRET_KEY
docker compose up --build
```

App: `http://localhost:8080` — runs Postgres + FastAPI + nginx-served frontend together.

Generate a strong secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## How the crypto works

```
plaintext ──PBKDF2(pw, salt, 200k iters)──▶ AES-256-GCM(key, nonce) ──▶ ciphertext + tag
                                                                                │
              envelope = MAGIC | VERSION | SALT(16) | NONCE(12) | TAG(16) | CIPHERTEXT
                                                                                │
                                         base64 ──▶ bits ──▶ scattered into pixel LSBs
                                                         (password-seeded permutation)
```

- The **GCM authentication tag** ensures a wrong password or any bit-flip fails loudly — never silently.
- The **real** payload is encoded in the blue channel; an optional **decoy** lives in the red channel under its own independent password.
- Output is always **PNG** — JPEG recompression would destroy the LSB payload.

Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · API reference: [`docs/API.md`](docs/API.md)

---

## Project structure

```
StegoChat/
├── backend/
│   ├── app/
│   │   ├── main.py         # app wiring, middleware, security headers
│   │   ├── config.py       # env-driven settings (pydantic-settings)
│   │   ├── database.py     # SQLAlchemy engine + session
│   │   ├── core/           # crypto, JWT, stego, EOF hiding, forensics, deps
│   │   ├── models/         # ORM: User, Chat, Message, Setting, ActivityLog
│   │   ├── schemas/        # Pydantic request/response models
│   │   ├── routers/        # auth, users, stego, history, dashboard, dead_drop, files
│   │   └── services/       # activity logging, storage helpers
│   ├── tests/              # pytest suite: crypto, stego, auth, API
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/            # axios client with refresh rotation, typed services
│       ├── store/          # Zustand: auth, theme
│       ├── components/     # ui/ + layout/
│       ├── pages/          # Landing, Dashboard, Chat, Studio, History, Forensics
│       └── styles/         # design-system CSS (theme tokens)
├── sample_images/          # built-in cover images
├── uploads/                # generated stego files (gitignored)
├── docker-compose.yml
└── docs/                   # architecture, API, and deployment guides
```

---

## Testing

```bash
# Backend — crypto, steganography, auth, and API integration tests
cd backend
pip install pytest httpx
pytest

# Frontend — TypeScript type check + production build
cd frontend
npm run build
```

---

## Security notes

- Passwords are **never stored** — they derive keys in-memory per request only.
- Message history stores **ciphertext only** — plaintext never touches the database.
- Refresh tokens are stored as **SHA-256 hashes** and rotated on every use.
- Rate limiting, strict file upload validation, and security headers are on by default.
- **Always** set a strong `STEGOCHAT_SECRET_KEY` in production.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Found a vulnerability? Check [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
