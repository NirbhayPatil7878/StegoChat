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
# Group image E2EE

Group steganographic images use a browser-only E2EE path. The browser encrypts
the message with AES-256-GCM using a fresh key and nonce, and embeds the
ciphertext in a PNG. The content key and independent random carrier password
are each wrapped for every current group member using RSA-OAEP with SHA-256.
The API stores the opaque image and one envelope per recipient; it never receives
the message text, content key, carrier password, or private key. Legacy direct
messages and older group images continue to use the existing server-side
password-protected stego path.

The E2EE carrier uses a browser canvas LSB layout specific to this E2EE flow.
The existing Python steganography algorithms remain in place for legacy
messages. E2EE images need lossless PNG handling; converting them to JPEG or
otherwise recompressing them destroys the embedded ciphertext.

Private RSA keys are non-extractable Web Crypto keys stored in IndexedDB on one
browser profile. Clearing site data, losing the device, or changing browsers
loses access to prior envelopes. The current release does not support multiple
devices or secure key recovery. A user with a missing local key cannot replace
the registered public key automatically; key replacement requires an explicit
recovery process. Newly added members receive envelopes only for messages sent
after they join. Removed members cannot fetch envelopes afterward, but removal
cannot revoke keys or plaintext already obtained on their devices.

Public key registration is first-write-only. The server can deny service and
can present a substituted key before registration; members currently have no
out-of-band fingerprint verification or key transparency. Therefore this
design does not protect against a malicious server that replaces keys. Verify
public-key fingerprints through a trusted independent channel before relying
on protection from server compromise. Encrypted messages still expose ordinary
metadata such as participants, timing, image size, and expiry.
