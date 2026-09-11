# StegoChat Architecture and Data/Control Flows

## 1. Executive Architectural Summary

StegoChat is an enterprise-grade, defense-in-depth secure steganography and covert communications platform. It combines modern authenticated symmetric cryptography (**AES-256-GCM**) with advanced media steganography (spatial domain **LSB**, **LSB-RGB**, **LSB-2Bit**, **Pixel Value Differencing (PVD)**, transform domain **Discrete Cosine Transform (DCT)**, and **Universal EOF File Concealment**). 

The platform is designed around zero-knowledge server persistence for plaintexts: **the server never persists plaintext messages or message encryption passwords**. All message histories, database records, and carrier payloads store ciphertext exclusively, derived through password-authenticated key derivation functions with high iteration counts.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT TIERS                                         │
│  ┌─────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │     React 18 SPA (Vite + TypeScript)    │  │       External Token Readers        │  │
│  │   Zustand · React Query · Tailwind CSS  │  │  Anonymous / Public Redeem Clients │  │
│  └────────────────────┬────────────────────┘  └──────────────────┬──────────────────┘  │
└───────────────────────┼──────────────────────────────────────────┼─────────────────────┘
                        │ HTTPS / WSS / REST API                   │ HTTP GET/POST
                        ▼                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              REVERSE PROXY & GATEWAY                                   │
│                        Nginx 1.27 (Alpine) Reverse Proxy                               │
│      - Rate Limiting Shield         - TLS / HSTS Termination                           │
│      - Static Asset Caching         - Security Headers (CSP, X-Frame-Options: DENY)    │
│      - Reverse Proxy `/api/*`       - SPA Fallback (`try_files $uri /index.html`)      │
└───────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │ Forwarded HTTP Requests
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION BACKEND ENGINE                                │
│                     FastAPI 0.115+ / Uvicorn ASGI Server                               │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Middleware: SlowAPI (Rate Limiter) · SecurityHeaders · CORSMiddleware             │  │
│  └────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                           │                                            │
│  ┌──────────────────┐  ┌──────────────────┴─┐  ┌─────────────────┐  ┌────────────────┐ │
│  │  Routers / APIs  │  │   Core Domain Logic│  │ Services Layer  │  │ Data / Models  │ │
│  │  - auth          │  │   - crypto (GCM)   │  │ - storage.py    │  │ - User         │ │
│  │  - stego         │  │   - stego (5 algs) │  │ - mail.py (API) │  │ - Chat/Message │ │
│  │  - conversations │  │   - eof            │  │ - activity.py   │  │ - Conversation │ │
│  │  - tokens        │  │   - forensics      │  │                 │  │ - ShareToken   │ │
│  │  - dead_drop     │  │   - totp / pwned   │  │                 │  │ - DeadDrop     │ │
│  └────────┬─────────┘  └────────────────────┘  └─────────────────┘  └────────┬───────┘ │
└───────────┼──────────────────────────────────────────────────────────────────┼─────────┘
            │                                                                  │
            ▼                                                                  ▼
┌─────────────────────────┐                                        ┌─────────────────────┐
│  PERSISTENT FILE STORE  │                                        │  RELATIONAL DATABASE│
│     `/data/uploads`     │                                        │  PostgreSQL 16 /    │
│  - Stego PNGs           │                                        │  SQLite (Dev)       │
│  - Extracted Payloads   │                                        │  - SQLAlchemy 2 ORM │
│  - Carrier Files        │                                        │  - Alembic Migr.    │
└─────────────────────────┘                                        └─────────────────────┘
```

### 1.1 Architectural Evolution: Legacy (v1) vs Modern (v2)

The repository reflects a clean architectural progression from an initial prototype to a hardened, production-grade microservice architecture:

| Dimension | Legacy Prototype (v1) | Modern Production Architecture (v2) |
|---|---|---|
| **Backend Framework** | Flask 2.x monolithic (`backend/app.py`) | FastAPI 0.115+ ASGI (`backend/app/main.py`) |
| **Frontend Framework** | Static vanilla JS + HTML (`frontend/*.html`) | React 18 SPA + Vite + TypeScript (`frontend/src/`) |
| **Cryptography** | AES-CBC with simple SHA-256 key (`backend/encryption.py`) | Authenticated AES-256-GCM + PBKDF2-HMAC-SHA256 (200k iters) (`backend/app/core/crypto.py`) |
| **Steganography** | Unoptimized Python loops (`backend/stego_engine.py`) | Vectorized NumPy array transforms, 5 embedding algorithms (`backend/app/core/stego.py`) |
| **Data Persistence** | Flat JSON file (`backend/data.json`) | SQLAlchemy 2.0 ORM + SQLite (dev) / PostgreSQL 16 (prod) + Alembic migrations |
| **Session & Auth** | Client-side cookies & plaintext fallback | JWT access tokens (HS256) + SHA-256 rotating refresh tokens + TOTP 2FA |
| **Email Subsystem** | Basic SMTP | Google OAuth2 Gmail API transport with SMTP fallback (`backend/app/services/mail.py`) |

---

## 2. Component Structure & Module Breakdown

### 2.1 Backend Modules (`backend/app/`)

The backend codebase adheres strictly to clean architecture and separation of concerns:

- **`main.py`**: The application composition root. Coordinates the FastAPI lifespan, configures structured logging, mounts SlowAPI rate limiting, registers custom security header middleware (`nosniff`, `DENY` frames, `HSTS`), configures CORS, handles global HTTP exceptions (422, 429, 500), and wires the API router hierarchy.
- **`config.py`**: Centralized configuration management utilizing `pydantic-settings`. Loads environment variables prefixed with `STEGOCHAT_` from `.env` files or the container environment, enforcing type validation and safe fallback defaults.
- **`database.py`**: SQLAlchemy 2.0 database engine and session factory (`SessionLocal`). Provides the scoped session dependency `get_db()` and executes automatic non-destructive column backfills for developer SQLite databases while supporting managed Alembic schema migrations for PostgreSQL.
- **`core/` (Domain Logic Layer - Framework Agnostic)**:
  - **`crypto.py`**: Low-level cryptographic primitive suite. Implements authenticated AES-256-GCM encryption/decryption, PBKDF2-HMAC-SHA256 key derivation with 200,000 iterations, and packing into binary/base64 cryptographic envelopes (`MAGIC: SGC1`, version byte, 16-byte salt, 12-byte nonce, 16-byte authentication tag).
  - **`stego.py`**: Core steganography engine. Houses five discrete spatial and frequency embedding implementations, decoy red-channel multiplexing, payload bit packing, seeded pseudo-random permutations, and multi-image split/merge pipelines.
  - **`eof.py`**: Universal append-after-EOF steganography handler. Injects arbitrary files behind carrier image/media bytes using a signature delimiter (`\x00\x00STEGOCHAT_EOF\x00\x00`) and an AES-256-GCM encrypted JSON metadata manifest.
  - **`forensics.py`**: Steganalysis and forensic inspection suite. Computes Shannon entropy over byte distributions, analyzes least-significant-bit density deviations from natural 0.5 uniformity, detects EOF markers, and runs regex heuristics for credential leak prevention.
  - **`security.py`**: Password hashing via Bcrypt with 72-byte pre-hashing via SHA-256, access token creation/verification via `python-jose`, and refresh token SHA-256 hashing.
  - **`totp.py`**: Time-based one-time password engine based on `pyotp`. Handles RFC 6238 secret generation, QR provisioning URIs, clock-drift verification, single-use recovery code hashing, and challenge token exchange.
  - **`pwned.py`**: Client for the HaveIBeenPwned k-anonymity SHA-1 API. Blocks compromised passwords during registration and password change requests.
  - **`rate_limit.py`**: Rate-limiting definitions powered by `slowapi` and `limits`.
  - **`deps.py`**: FastAPI dependency injection functions (`get_current_user`, `get_current_admin`).
- **`models/` (Data Persistence Layer)**:
  - `User`: Accounts, credentials, roles, email verification status, TOTP/2FA secrets, and recovery code hashes.
  - `Setting`: Per-user visual and behavioral preferences (theme, accent, encryption algorithm, preferred stego method).
  - `Chat` & `Message`: Historical steganography sessions (storing ciphertext and generated stego filenames).
  - `Conversation`, `ConversationMember`, `DirectMessage`: Peer-to-peer and group messaging threads with optional stego attachments and ephemeral auto-expiration timers.
  - `ShareToken`: Capability-based URLs with unguessable keys, download quotas, access password hashes, and expiration timestamps.
  - `DeadDrop`: One-time burn-after-read secret storage with TTL expiration.
  - `RefreshToken` & `OneTimeToken`: Cryptographic session persistence and single-use verification tokens.
  - `ActivityLog`: Comprehensive audit trail tracking user events, timestamps, and client IP addresses.
- **`routers/` (HTTP API Layer)**:
  - `auth.py`: User registration, login, token refresh with rotation, logout, 2FA challenge resolution, password reset, and email OTP verification.
  - `stego.py`: Image embedding (`/embed`), image extraction (`/extract`), multi-image splitting (`/embed-split`, `/extract-split`), universal file hiding (`/hide-file`, `/reveal-file`), message scanning (`/scan-risk`), forensic analysis (`/forensics`), and capacity calculation (`/capacity`).
  - `conversations.py`: Direct messaging, group creation, member management, read-state cursors, stego message attachments, and ephemeral message auto-purging.
  - `share_tokens.py`: Token creation, metadata lookup, password verification, file redemption, and revocation.
  - `dead_drop.py`: Anonymous and authenticated dead drop creation, metadata inspection, and burn-on-read access.
  - `history.py`: Retrieval, search, folder organization, and deletion of personal embed/extract logs.
  - `dashboard.py`: User metrics, daily activity aggregation, and storage usage summaries.
  - `files.py`: Secure static file streaming for generated stego assets and sample cover images with path-traversal prevention.
- **`services/` (Infrastructure Integrations)**:
  - `storage.py`: File storage abstraction, disk directory verification, MIME-type and extension validation, and filename sanitization.
  - `mail.py`: Multi-provider transactional email service utilizing the Google Gmail API (OAuth2) with graceful fallback to standard SMTP or local mock logging.
  - `activity.py`: Asynchronous audit log emitter.

### 2.2 Frontend Architecture (`frontend/src/`)

- **State Management (`src/store/`)**:
  - `auth.ts`: Zustand store with `persist` middleware storing the authenticated `User`, JWT access token, and refresh token in `localStorage`.
  - `theme.ts`: UI theme selection (`dark`, `light`, `system`) and accent color palette switching.
  - `ui.ts`: Global modal, sidebar, and notification UI states.
- **Networking & API Client (`src/api/client.ts` & `src/api/services.ts`)**:
  - Centralized Axios instance with authorization header injection.
  - Transparent 401 response interceptor implementing queue-safe refresh token rotation: automatically pauses failing queries, calls `/api/auth/refresh`, updates tokens, and replays pending HTTP requests without user interruption.
- **View Hierarchy (`src/pages/` & `src/components/`)**:
  - `Chat.tsx`: Direct and group messaging UI with inline encrypted stego message composer, sample picker, password input, inline message decryptor, and self-destruct timers.
  - `Studio.tsx`: Steganography workspace supporting single-image embed/extract, multi-image split/merge, universal file concealment, live capacity bars, and QR code share modal.
  - `Forensics.tsx`: Visual forensic inspection tool displaying Shannon entropy, LSB anomaly graphs, file metadata, and risk warnings.
  - `Tokens.tsx` & `ShareRedeem.tsx`: Token management table and public-facing anonymous redemption page.
  - `Dashboard.tsx`, `History.tsx`, `Settings.tsx`: Analytics, message archives, and account/2FA configuration.

---

## 3. End-to-End Data & Control Flowsheets

### 3.1 Carrier Media Ingestion, Encryption, and Embedding

The following diagram illustrates the complete pipeline when a user submits plaintext, a secret password, and an image to create a steganographic carrier.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Browser
    participant API as FastAPI Router (/api/embed)
    participant Auth as Auth Dependency (deps.py)
    participant Store as Storage Service (storage.py)
    participant Crypto as Crypto Engine (crypto.py)
    participant Stego as Stego Engine (stego.py)
    participant Disk as Local File Store (/uploads)
    participant DB as Relational Database (SQLAlchemy)

    User->>API: POST /api/embed (multipart: image, message, password, decoy_opts)
    API->>Auth: Validate Bearer JWT Access Token
    Auth-->>API: Authenticated User Object
    
    API->>Store: read_image_upload(image)
    Store->>Store: Verify file size <= 10MB, extension & MIME type (PNG/JPEG/BMP)
    Store-->>API: Raw cover image bytes
    
    API->>Crypto: encrypt(message, password)
    Crypto->>Crypto: Generate random 16-byte salt & 12-byte IV nonce
    Crypto->>Crypto: PBKDF2-HMAC-SHA256(password, salt, 200k iters) -> 256-bit Key
    Crypto->>Crypto: AES-256-GCM Encrypt & Generate 16-byte Auth Tag
    Crypto->>Crypto: Assemble Envelope: [SGC1 | v1 | Salt | Nonce | Tag | Ciphertext]
    Crypto-->>API: Base64 Encoded Envelope String
    
    opt Decoy Message Provided
        API->>Crypto: encrypt(decoy_message, decoy_password)
        Crypto-->>API: Base64 Decoy Envelope String
    end

    API->>Stego: embed_message(cover_bytes, ciphertext, password, method)
    Stego->>Stego: Convert cover bytes to RGB NumPy uint8 array
    Stego->>Stego: Derive deterministic PRNG seed: SHA256(password)[:8]
    Stego->>Stego: Generate random pixel index permutation
    Stego->>Stego: Embed real ciphertext into Blue Channel LSBs
    
    opt Decoy Message Present
        Stego->>Stego: Embed decoy ciphertext into Red Channel LSBs
    end
    
    Stego->>Stego: Compress NumPy array into lossless PNG stream
    Stego-->>API: Stego PNG bytes
    
    API->>Store: save_stego(stego_png)
    Store->>Disk: Write file to /uploads/stego_<hex>.png
    Store-->>API: stego_filename
    
    API->>DB: Insert Message(kind="embed", encrypted_message, preview, stego_filename)
    API->>DB: Insert ActivityLog(action="embed")
    DB-->>API: Commit Transaction
    
    API-->>User: 200 OK (stego_url, stego_filename, message_id, decoy_enabled)
```

---

### 3.2 Steganographic Extraction and Decryption Flow

The extraction pipeline recovers hidden payloads while defending against corrupted data or incorrect passwords via GCM tag authentication.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Browser
    participant API as FastAPI Router (/api/extract)
    participant Auth as Auth Dependency (deps.py)
    participant Store as Storage Service (storage.py)
    participant Stego as Stego Engine (stego.py)
    participant EOF as EOF Engine (eof.py)
    participant Crypto as Crypto Engine (crypto.py)

    User->>API: POST /api/extract (image, password)
    API->>Auth: Validate Bearer JWT Token
    Auth-->>API: Authenticated User
    
    API->>Store: read_any_upload(image)
    Store-->>API: Raw stego file bytes
    
    critical Check for Appended EOF Payload First
        API->>EOF: eof_extract(raw_bytes, password)
        alt EOF Marker Found & Decrypted
            EOF->>Crypto: decrypt_bytes(encrypted_payload, password)
            Crypto-->>EOF: Recovered JSON envelope + payload bytes
            EOF-->>API: Return extracted file payload, filename, MIME
            API-->>User: 200 OK (kind="file", filename, payload_url)
        else Marker Absent or Corrupted
            EOF-->>API: EofError (Fall through to spatial stego)
        end
    end

    API->>Stego: extract_message(raw_bytes, password, method_hint)
    Stego->>Stego: Convert to RGB NumPy array
    
    loop Try Embedding Algorithms (User hint -> LSB -> LSB-RGB -> LSB-2Bit -> PVD -> DCT)
        Stego->>Stego: Generate permutation from SHA256(password)
        Stego->>Stego: Read 32-bit length header from permuted bits
        Stego->>Stego: Extract N bytes of Base64 ciphertext
        Stego->>Crypto: decrypt(ciphertext, password)
        alt AES-GCM Tag Verification Success
            Crypto-->>Stego: Plaintext message string
            Stego-->>API: Extracted Plaintext
        else Tag Mismatch / Corrupted / Wrong Password
            Crypto-->>Stego: DecryptionError
            Note over Stego: Continue to next candidate algorithm
        end
    end
    
    opt Check Decoy Channel (Red LSB)
        Stego->>Stego: Extract from Red channel using password permutation
        Stego->>Crypto: decrypt(decoy_ciphertext, password)
        Crypto-->>Stego: Decoy Plaintext
    end
    
    alt Plaintext Recovered
        API-->>User: 200 OK (kind="text", message=plaintext)
    else All Methods Failed
        API-->>User: 422 Unprocessable Entity ("No hidden message found for this password")
    end
```

---

### 3.3 Peer-to-Peer & Group Chat Steganography Lifecycle

In direct messaging, StegoChat integrates cover images directly into the chat flow, maintaining sender confidentiality and supporting message expiration and burn-on-read mechanics.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Sender (Alice)
    participant Gateway as FastAPI Router (/api/conversations)
    participant Storage as File System (/uploads)
    participant DB as Database (Postgres/SQLite)
    actor Bob as Recipient (Bob)

    Alice->>Gateway: POST /api/conversations/{id}/messages/stego<br/>(cover_image, secret_msg, stego_password, expires_in)
    Gateway->>Gateway: Encrypt message & embed into cover image (LSB PNG)
    Gateway->>Storage: Save stego_<token>.png
    Gateway->>DB: Insert DirectMessage(kind="stego", stego_filename, expires_at)
    Gateway-->>Alice: 201 Created (DirectMessagePublic with stego_url)

    Note over Bob: Bob polls or refetches conversation thread
    Bob->>Gateway: GET /api/conversations/{id}/messages
    Gateway->>DB: Query DirectMessage where conversation_id = {id}
    Gateway->>Gateway: Filter & purge expired messages (unlink stego files from disk)
    Gateway-->>Bob: 200 OK [DirectMessage(kind="stego", stego_url, body=null)]

    Note over Bob: Bob inspects the incoming image in chat UI
    Bob->>Bob: Inputs shared stego_password into reveal input
    Bob->>Gateway: POST /api/conversations/{id}/messages/{msg_id}/reveal (password)
    Gateway->>Storage: Read stego_<token>.png bytes
    Gateway->>Gateway: Extract payload bits & decrypt via AES-256-GCM
    
    alt Correct Password
        Gateway-->>Bob: 200 OK (message="Secret Plaintext Revealed", is_decoy=false)
    else Coercion / Decoy Password Entered
        Gateway-->>Bob: 200 OK (message="Innocent Decoy Message", is_decoy=true)
    else Invalid Password
        Gateway-->>Bob: 422 Unprocessable Entity ("Wrong password or corrupted image")
    end

    opt Message Expiry Reached (TTL)
        Note over Gateway,DB: Background query or next request triggers _purge_expired()
        Gateway->>Storage: Delete stego_<token>.png
        Gateway->>DB: Delete DirectMessage record
    end
```

---

### 3.4 Multi-Image Split Embedding & Shard Reassembly Workflow

When secret payloads exceed the bit capacity of a single cover image, StegoChat splits the payload across multiple carrier images using a sharded envelope protocol.

```mermaid
flowchart TD
    subgraph SENDER_SPLIT ["1. Multi-Image Split Embedding Pipeline (/api/embed-split)"]
        M1[Secret Plaintext] --> B1[Base64 Encode Message]
        B1 --> G1[Generate Random 8-char Group ID: SGSPLIT1]
        C_IN[N Cover Images Uploaded] --> CHUNK[Compute Shard Size: ceil len / N]
        CHUNK --> SHARDS["Split Base64 into N Shards: S_0, S_1 ... S_N-1"]
        
        SHARDS --> FORMAT["Format Shard Payload: SGSPLIT1 | GroupID | Index | Total | ShardData"]
        FORMAT --> ENC["AES-256-GCM Encrypt Each Shard with Shared Password"]
        ENC --> EMBED["Embed Shard_i into Cover_i via LSB Engine"]
        EMBED --> OUT_FILES["N Individual Stego PNG Files Generated & Downloaded"]
    end

    subgraph RECIPIENT_JOIN ["2. Multi-Image Shard Reassembly Pipeline (/api/extract-split)"]
        IN_FILES["Upload N Stego Images in Any Order + Password"] --> EXTRACT_EACH["For Each Image: Run LSB Extraction & AES-256-GCM Decrypt"]
        EXTRACT_EACH --> PARSE{"Verify Header Prefix: SGSPLIT1"}
        
        PARSE -- No --> ERR1[Reject: Not a split image]
        PARSE -- Yes --> VALIDATE{"Verify Matching GroupID & Collect Shard Indices"}
        
        VALIDATE -- Group Mismatch --> ERR2[Reject: Images belong to different messages]
        VALIDATE -- Missing Shards --> ERR3["Reject: Incomplete Set e.g. 2/3 Present"]
        VALIDATE -- All Present --> SORT[Sort Shards by Index 0 .. Total-1]
        
        SORT --> CONCAT[Concatenate Base64 String]
        CONCAT --> B64_DEC[Base64 Decode Plaintext]
        B64_DEC --> SUCCESS[Display Reassembled Secret Message]
    end

    SENDER_SPLIT -.->|Transport Sharded Images| RECIPIENT_JOIN
```

---

### 3.5 Universal Carrier File Hiding (EOF Injection Pipeline)

StegoChat supports hiding *any* arbitrary file type (ZIP, PDF, MP4, EXE) inside *any* valid media carrier using append-after-EOF steganography.

```mermaid
flowchart LR
    subgraph INGESTION ["Carrier & Payload Ingestion"]
        CARRIER["Carrier Media File (e.g. cover.jpg, video.mp4, doc.pdf)"]
        PAYLOAD["Secret Payload File (e.g. sensitive.zip, keys.dat)"]
        PW["User Password"]
    end

    subgraph PACKING ["Envelope Preparation & Encryption"]
        PAYLOAD --> JSON["Create JSON Envelope: {filename, mime, data: base64(payload)}"]
        JSON --> RAW_JSON["Serialize to UTF-8 Bytes"]
        RAW_JSON & PW --> CRYPTO["AES-256-GCM Encrypt Bytes -> [SGC1|v1|Salt|Nonce|Tag|Ciphertext]"]
    end

    subgraph INJECTION ["Stream Concatenation"]
        CARRIER --> C_BYTES["Read Complete Carrier Bytes"]
        MARKER["EOF Delimiter: \x00\x00STEGOCHAT_EOF\x00\x00"]
        C_BYTES --> CONCAT["Concatenate: Carrier Bytes + EOF Marker + Encrypted Envelope"]
        MARKER --> CONCAT
        CRYPTO --> CONCAT
    end

    subgraph OUTPUT ["Distribution & Recovery"]
        CONCAT --> FILE_OUT["Output File (Preserves Carrier Extension e.g. carrier.jpg)"]
        FILE_OUT -.-> REVEAL["/api/reveal-file or /api/extract"]
        REVEAL --> FIND_MARKER["Scan from Tail for \x00\x00STEGOCHAT_EOF\x00\x00"]
        FIND_MARKER --> DECRYPT["AES-256-GCM Decrypt with Password"]
        DECRYPT --> UNPACK["Unpack JSON & Decode Base64 Binary Stream"]
        UNPACK --> RESTORED["Restored Original File: sensitive.zip"]
    end
```

---

### 3.6 Authentication Lifecycle, Token Rotation & Multi-Factor Auth

StegoChat uses JWT access tokens, database-backed SHA-256 rotating refresh tokens, and optional two-factor authentication (TOTP or Email OTP).

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App (SPA / Axios)
    participant AuthRouter as Auth Router (/api/auth)
    participant HIBP as HaveIBeenPwned API
    participant DB as Database
    participant TOTP as TOTP Engine (pyotp)

    Note over Client,AuthRouter: Step 1: Registration with Compromised Password Guard
    Client->>AuthRouter: POST /api/auth/register (username, email, password)
    AuthRouter->>HIBP: Check SHA-1 Prefix (k-anonymity API)
    HIBP-->>AuthRouter: Range Response (Pass/Fail)
    AuthRouter->>AuthRouter: Bcrypt Hash Password (cost 12, SHA-256 pre-hash)
    AuthRouter->>DB: Insert User record
    AuthRouter-->>Client: 201 Created

    Note over Client,AuthRouter: Step 2: Login with 2FA Challenge
    Client->>AuthRouter: POST /api/auth/login (identifier, password)
    AuthRouter->>DB: Look up User by username or email
    AuthRouter->>AuthRouter: Verify Bcrypt password hash
    
    alt User Has TOTP Enabled
        AuthRouter->>AuthRouter: Generate short-lived (300s) 2FA challenge JWT
        AuthRouter-->>Client: 200 OK (requires_2fa=true, challenge_token="...")
        Client->>AuthRouter: POST /api/auth/2fa/verify (challenge_token, code)
        AuthRouter->>TOTP: Validate 6-digit code or consume single-use recovery code
        TOTP-->>AuthRouter: Verification Valid
    end

    AuthRouter->>AuthRouter: Create JWT Access Token (HS256, 30m TTL)
    AuthRouter->>AuthRouter: Generate Random 48-char Refresh Token
    AuthRouter->>DB: Save SHA-256(RefreshToken), expires_at (14 days)
    AuthRouter-->>Client: 200 OK {access_token, refresh_token, user}

    Note over Client,AuthRouter: Step 3: Transparent Token Rotation on 401 Expiry
    Client->>AuthRouter: GET /api/user (with expired access token)
    AuthRouter-->>Client: 401 Unauthorized
    
    Note over Client: Axios interceptor traps 401 & invokes refreshAccessToken()
    Client->>AuthRouter: POST /api/auth/refresh {refresh_token: "old_token"}
    AuthRouter->>DB: Find RefreshToken by SHA-256(old_token)
    AuthRouter->>DB: Revoke old RefreshToken (prevent replay attacks)
    AuthRouter->>AuthRouter: Mint new Access Token + new Refresh Token
    AuthRouter->>DB: Persist SHA-256(new_token)
    AuthRouter-->>Client: 200 OK {access_token: "new_jwt", refresh_token: "new_token"}
    Client->>AuthRouter: Replay original GET /api/user with new JWT
    AuthRouter-->>Client: 200 OK (User profile)
```

---

## 4. Steganography Algorithms & Cryptographic Specifications

### 4.1 Cryptographic Protocol Matrix

| Property | Implementation Detail |
|---|---|
| **Cipher Algorithm** | AES-256-GCM (Galois/Counter Mode) via `PyCryptodome` |
| **Confidentiality Key Length** | 256 bits (32 bytes) |
| **Authentication Tag** | 128 bits (16 bytes) appended to ciphertext |
| **Initialization Vector (Nonce)** | 96 bits (12 bytes) cryptographically random per message via `get_random_bytes(12)` |
| **Key Derivation Function (KDF)** | PBKDF2-HMAC-SHA256 with 200,000 iterations |
| **Salt** | 128 bits (16 bytes) cryptographically random per message |
| **Cryptographic Envelope Layout** | `MAGIC` (4 bytes: `b"SGC1"`) \| `VERSION` (1 byte: `0x01`) \| `SALT` (16 bytes) \| `NONCE` (12 bytes) \| `TAG` (16 bytes) \| `CIPHERTEXT` (variable) |
| **Integrity Guarantee** | AEAD authentication tag guarantees that bitflips, password mismatches, or truncated data trigger explicit errors rather than silent corruption. |

### 4.2 Steganography Methods Comparison

```
+---------------------------------------------------------------------------------------+
| METHOD 1: LSB (Least Significant Bit - Blue Channel Permuted)                         |
| Bit Capacity: (Width * Height * 1) / 8 - 4 bytes                                      |
| Mechanics: Ciphertext bits overwrite bit 0 of the Blue channel across a pseudo-random |
|            pixel permutation seeded by SHA256(password). Decoy message resides in Red.|
+---------------------------------------------------------------------------------------+
| METHOD 2: LSB-RGB (All Channels Permuted)                                             |
| Bit Capacity: (Width * Height * 3) / 8 - 4 bytes  [3x Capacity Boost]                 |
| Mechanics: Flattens image to (N * 3) stream (R0, G0, B0, R1, G1, B1...). Overwrites    |
|            bit 0 of all channels along a permutation seeded by SHA256(password + ":rgb").|
+---------------------------------------------------------------------------------------+
| METHOD 3: LSB-2BIT (2 Bits Per Pixel - Blue Channel)                                  |
| Bit Capacity: (Width * Height * 2) / 8 - 4 bytes  [2x Capacity Boost]                 |
| Mechanics: Replaces bits 0 and 1 (mask 0xFC) in Blue channel. Pairs of bits packed   |
|            into 2-bit values (0-3). Permutation seeded by SHA256(password + ":2bit"). |
+---------------------------------------------------------------------------------------+
| METHOD 4: PVD (Pixel Value Differencing)                                              |
| Bit Capacity: (NumPairs * 3) / 8 - 4 bytes                                            |
| Mechanics: Considers adjacent pixel pairs (p1, p2). Encodes 3 secret bits into the     |
|            difference |p2 - p1| & ~7 | secret_bits. Adjusts boundary pixels cleanly.   |
+---------------------------------------------------------------------------------------+
| METHOD 5: DCT (Discrete Cosine Transform - Frequency Domain)                          |
| Bit Capacity: (8x8 Blocks * 16 mid-freq positions) / 8 - 4 bytes                      |
| Mechanics: Computes 2D orthonormal 8x8 DCT-II on Blue blocks. Modifies mid-frequency  |
|            zigzag coefficients (bands 4-7) with quant step Q=20. Survives minor noise.|
+---------------------------------------------------------------------------------------+
| METHOD 6: UNIVERSAL EOF (Append-After-EOF File Injection)                             |
| Bit Capacity: Arbitrary (Bounded only by system max_carrier_bytes = 64MB)              |
| Mechanics: Appends delimiter \x00\x00STEGOCHAT_EOF\x00\x00 followed by AES-256-GCM   |
|            encrypted JSON envelope. Carrier renders normally in media viewers.        |
+---------------------------------------------------------------------------------------+
```

---

## 5. Security Architecture & Threat Boundaries

1. **Zero Plaintext Persistence**: Plaintext messages and passwords exist exclusively in volatile process memory during request processing. Only AES-256-GCM ciphertext is saved to disk and database.
2. **Database Leak Resilience**:
   - Passwords stored as Bcrypt hashes (with 72-byte SHA-256 pre-hash to avoid truncation attacks).
   - Refresh tokens stored as SHA-256 hashes (`token_hash`), preventing stolen database dumps from being used directly against the `/api/auth/refresh` endpoint.
   - TOTP recovery codes stored as SHA-256 hash arrays.
3. **Plausible Deniability (Deniable Encryption)**: The dual-channel LSB embedding isolates the real payload in the Blue channel and the decoy payload in the Red channel. An adversary possessing the decoy password can only locate and decrypt the Red channel payload, with no mathematical proof of the Blue channel payload's existence.
4. **Transport & Network Hardening**:
   - Strict HTTP security headers configured in `main.py` and `nginx.conf`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
   - Rate limiting via `slowapi` enforces strict throughput quotas: 10 requests/min on auth endpoints, 30 requests/min on steganography endpoints, and 120 requests/min globally.
