# Architecture

## Overview

StegoChat is a two-tier application: a **FastAPI** JSON API and a **React SPA**.
In development the SPA's Vite dev server proxies `/api` to the backend; in
production nginx serves the built SPA and reverse-proxies `/api` to the backend
container.

```
┌─────────────┐     /api/*      ┌──────────────┐      ┌────────────┐
│  React SPA  │ ──────────────▶ │   FastAPI    │ ───▶ │  Database  │
│ (nginx/vite)│ ◀────────────── │  (uvicorn)   │      │ SQLite/PG  │
└─────────────┘   JSON + files  └──────┬───────┘      └────────────┘
                                       │
                                 ┌─────▼──────┐
                                 │  uploads/  │  generated stego images
                                 └────────────┘
```

## Backend layers

| Layer        | Responsibility |
|--------------|----------------|
| `routers/`   | HTTP endpoints, request/response shaping, auth dependency wiring |
| `schemas/`   | Pydantic validation + serialization contracts |
| `services/`  | Cross-cutting helpers (activity logging, file storage/validation) |
| `core/`      | Pure domain logic: `crypto`, `stego`, `eof`, `forensics`, `security`, `deps` |
| `models/`    | SQLAlchemy ORM entities |
| `config.py`  | Environment-driven settings with safe dev defaults |

The `core/` modules are deliberately framework-free and independently unit-tested.

## Cryptography

- **Key derivation:** PBKDF2-HMAC-SHA256, 200k iterations, per-message 16-byte salt.
- **Cipher:** AES-256-GCM with a per-message 12-byte nonce. The GCM tag provides
  integrity, so a wrong password or tampered ciphertext fails verification
  instead of returning garbage.
- **Envelope:** `MAGIC(4) | VERSION(1) | SALT(16) | NONCE(12) | TAG(16) | CT`.

## Steganography

- **LSB text mode** (`core/stego.py`): the base64 ciphertext is turned into a bit
  stream, prefixed with a 4-byte length header, and written into the
  least-significant bit of one colour channel. Bit positions follow a
  password-seeded NumPy permutation, so without the password the payload can't
  even be located. Real payload → blue channel; decoy → red channel.
- **EOF file mode** (`core/eof.py`): an arbitrary file is encrypted and appended
  after a marker at the end of the image bytes. Viewers ignore trailing bytes, so
  the carrier still renders, and there's no capacity limit.

Output is always PNG (lossless); JPEG recompression would destroy LSB data.

## Authentication

- **Access tokens:** short-lived JWTs (`HS256`), 30 min default.
- **Refresh tokens:** high-entropy random strings; only their SHA-256 hash is
  stored. Each use **rotates** the token (old one revoked), limiting replay.
- **Passwords:** bcrypt with automatic SHA-256 pre-hash for >72-byte inputs.
- The Axios client transparently refreshes the access token on a 401 and retries.

## Data model

```
User 1───* Chat 1───* Message
 │           
 ├─1 Setting            (theme, accent, animations, language, …)
 ├─* ActivityLog        (login, embed, extract, delete, …)
 ├─* RefreshToken       (hashed, rotating)
 └─* DeadDrop           (one-time-read encrypted payloads)
```

- `Message.encrypted_message` stores **ciphertext only** — plaintext is never
  persisted, and passwords are never stored.

## Request lifecycle (embed)

1. `POST /api/embed` (multipart) → auth dependency resolves the user from the JWT.
2. Cover image validated (type, size) by `services/storage`.
3. `core/stego.embed_message` encrypts + hides the message, returns PNG bytes.
4. PNG saved to `uploads/`; a `Message` row records ciphertext + preview.
5. Optional dead-drop token created; `ActivityLog` entry written.
6. Response returns the stego URL and any dead-drop token.
