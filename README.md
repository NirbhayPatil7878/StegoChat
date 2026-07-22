<div align="center">

<img src="frontend/public/logo.svg" width="96" alt="StegoChat" />

# StegoChat

**Hide AES-256 encrypted messages inside ordinary images.**

Secure steganographic messaging — a production-grade rebuild with FastAPI, React, and real cryptography.

</div>

---

## What it does

StegoChat lets you **encrypt a message and weave it into an image's pixels**, so the result looks completely ordinary but only the password can reveal what's inside.

- 🔐 **Real crypto** — AES-256-GCM (authenticated) with PBKDF2 key derivation, a random salt and IV per message. Wrong passwords are *rejected*, never silently decrypted to garbage.
- 🖼️ **LSB steganography** — ciphertext is scattered across pixels in a password-seeded pseudo-random order, so the payload is both hidden and statistically hard to detect.
- 🕵️ **Decoy messages** — embed a second message under a *different* password. Hand over the harmless one under duress.
- ⏱️ **Dead drops** — share self-destructing, one-time-read links that burn on open or expire on a timer.
- 📎 **Universal file hiding** — conceal *any* file inside *any* carrier (image, video, audio, PDF, zip…); the carrier still opens normally.
- 🧩 **Multi-image split** — spread one message across several images and reassemble from any order (beats any single image's capacity limit).
- 🔗 **QR share links** — every share link comes with a scannable, downloadable QR, generated entirely client-side.
- 🔬 **Forensic analyzer** — scan any image for entropy anomalies and hidden-data fingerprints.
- 👤 **Full auth** — JWT access + rotating refresh tokens, bcrypt hashing, **TOTP two-factor auth** (with recovery codes), and breached-password rejection (HaveIBeenPwned k-anonymity).
- 🎨 **Premium UI** — React + Tailwind + Framer Motion, glassmorphism, dark/light themes, 5 accent colors, fully responsive.

## Tech stack

| Layer     | Choice |
|-----------|--------|
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, React Query, Zustand, React Router, Recharts |
| Backend   | FastAPI, SQLAlchemy 2, Pydantic v2, slowapi (rate limiting) |
| Crypto    | PyCryptodome (AES-256-GCM, PBKDF2), bcrypt, python-jose (JWT) |
| Imaging   | Pillow, NumPy |
| Database  | SQLite by default · PostgreSQL in production (one env var) |
| Infra     | Docker + docker-compose, nginx |

---

## Quick start (local dev)

**Prerequisites:** Python 3.11+, Node 18+.

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or use the repo's ../venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000` — interactive docs at **http://localhost:8000/api/docs**.
It creates a local `stegochat.db` SQLite file automatically. No database server needed.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` to the backend automatically.

---

## Quick start (Docker — one command)

```bash
cp .env.example .env          # then edit STEGOCHAT_SECRET_KEY
docker compose up --build
```

- Web UI: **http://localhost:8080**
- Runs Postgres + FastAPI + nginx-served frontend together.

Generate a strong secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Project structure

```
StegoChat/
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── main.py         # app wiring, middleware, security headers
│   │   ├── config.py       # env-driven settings (pydantic-settings)
│   │   ├── database.py     # SQLAlchemy engine + session
│   │   ├── core/           # crypto, security(JWT), stego, eof, forensics, deps
│   │   ├── models/         # ORM: User, Chat, Message, Setting, ActivityLog, ...
│   │   ├── schemas/        # Pydantic request/response models
│   │   ├── routers/        # auth, users, stego, history, dashboard, dead_drop, files
│   │   └── services/       # activity logging, storage helpers
│   ├── tests/              # pytest suite (crypto, stego, auth, API)
│   └── requirements.txt
├── frontend/               # React + Vite + TS
│   └── src/
│       ├── api/            # axios client (+ refresh rotation), typed services
│       ├── store/          # Zustand: auth, theme
│       ├── components/     # ui/ + layout/
│       ├── pages/          # Landing, Dashboard, Chat, Studio, History, Forensics, static/, ...
│       └── styles/         # design-system CSS (theme tokens)
├── sample_images/          # built-in cover images
├── uploads/                # generated stego files (gitignored)
├── docker-compose.yml
└── docs/                   # architecture, API, deployment guides
```

---

## How the crypto works

```
plaintext ──PBKDF2(pw, salt, 200k)──▶ AES-256-GCM(key, nonce) ──▶ ciphertext+tag
                                                                       │
   envelope = MAGIC | VERSION | SALT(16) | NONCE(12) | TAG(16) | CIPHERTEXT
                                                                       │
                                    base64 ──▶ bits ──▶ scattered into pixel LSBs
                                             (password-seeded permutation)
```

- The **GCM tag** authenticates the data: a wrong password or any tampering fails cleanly.
- The **real** payload lives in the blue channel; the optional **decoy** lives in the red channel under its own password.
- Output is always **PNG** — JPEG recompression would destroy the hidden bits.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and [`docs/API.md`](docs/API.md) for the endpoint reference.

---

## Testing

```bash
cd backend
pip install pytest httpx
pytest            # crypto, steganography, auth, and API integration tests
```

```bash
cd frontend
npm run build     # type-checks (tsc) and production-builds
```

---

## Security notes

- Passwords are **never stored** — they only derive keys in-memory per request.
- Message history persists **ciphertext only**, never plaintext.
- Refresh tokens are stored as SHA-256 hashes and **rotated** on every use.
- Rate limiting, strict upload validation (type/size), and security headers are enabled by default.
- **Always** set a strong `STEGOCHAT_SECRET_KEY` in production.

## License

MIT — see [LICENSE](LICENSE).
