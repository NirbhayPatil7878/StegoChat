# StegoChat Requirements and Dependencies Inventory

## 1. Complete Dependency Manifest Inventory

### 1.1 Backend Runtime Dependencies (`backend/requirements.txt`)

The production backend runs on Python 3.11+ (tested on Python 3.11 and 3.12). All packages are pinned with semantic versioning ranges:

| Package | Version Specifier | Category / Purpose | Architectural Justification |
|---|---|---|---|
| **`fastapi`** | `==0.115.*` | Web Framework | Core ASGI application framework offering high-performance asynchronous request handling, dependency injection, and automatic OpenAPI generation. |
| **`uvicorn[standard]`** | `==0.32.*` | ASGI Web Server | Production ASGI web server bundled with `uvloop` and `httptools` for optimized concurrency. |
| **`python-multipart`** | `==0.0.*` | Form Data Parser | Required by FastAPI to process multipart/form-data payloads (file uploads, image covers, form parameters). |
| **`sqlalchemy`** | `==2.0.*` | ORM & DB Toolkit | Next-generation declarative ORM managing schema mapping, database sessions, connection pooling, and cross-engine portability (SQLite / PostgreSQL). |
| **`pydantic`** | `==2.*` | Validation & Schema | High-performance schema validation, serialization, and type-safety across API requests and responses. |
| **`pydantic-settings`** | `==2.*` | Configuration Engine | Handles type-safe, environment-variable-driven configuration parsing prefixed with `STEGOCHAT_`. |
| **`email-validator`** | `==2.*` | Email Validation | Enforces strict RFC 5322 email syntax validation on user registration and account updates. |
| **`python-jose[cryptography]`** | `==3.3.*` | JWT Security | Generates and verifies cryptographic JSON Web Tokens (`HS256`) for stateless user session management. |
| **`bcrypt`** | `==5.*` | Password Hashing | Industrial-standard adaptive password hashing using blowfish-based cipher with configurable work factors. |
| **`pycryptodome`** | `==3.23.*` | Cryptographic Suite | Provides low-level primitives: AES-256-GCM authenticated cipher, PBKDF2-HMAC-SHA256 key derivation, SHA-256 hashing, and secure PRNG random bytes. |
| **`pyotp`** | `==2.9.*` | Two-Factor Auth (2FA) | Implements RFC 6238 Time-Based One-Time Password (TOTP) algorithms for authenticator app enrollment and verification. |
| **`slowapi`** | `==0.1.*` | Rate Limiting | In-memory and Redis-capable rate limiting middleware guarding against brute-force attacks on auth and stego endpoints. |
| **`pillow`** | `==11.*` | Image Processing | Python Imaging Library handling pixel arrays, lossless PNG compression, image format validation, and dimension metadata. |
| **`numpy`** | `==2.*` | Numeric Processing | Vectorized array operations for rapid bit extraction, bit packing, matrix permutation, and 2D Discrete Cosine Transforms. |
| **`psycopg[binary]`** | `==3.2.*` | PostgreSQL Driver | High-performance modern PostgreSQL database adapter utilizing binary wheels for production database connectivity. |
| **`google-auth`** | `>=2.0` | Authentication Library | Google identity token verification and credential management. |
| **`google-auth-oauthlib`** | `>=1.0` | OAuth2 Flow Library | Manages the authorization code grant and refresh token workflow for Google API access. |
| **`google-api-python-client`** | `>=2.0` | Google API Client | Programmatic interface to the Gmail API for sending transactional emails (OTP, password reset) via OAuth2. |

---

### 1.2 Backend Development & CI Tooling (`backend/requirements-dev.txt` & `pyproject.toml`)

| Package | Version Specifier | Category / Purpose | Architectural Justification |
|---|---|---|---|
| **`ruff`** | `==0.6.*` | Linter & Formatter | Extremely fast Rust-based Python linter and code formatter configured to enforce PEP 8, Pyflakes, isort, pyupgrade, and flake8 rules. |
| **`mypy`** | `==1.11.*` | Static Type Checker | Enforces strict static typing across backend services with Pydantic plugin integration. |
| **`pytest`** | `==8.*` | Test Automation | Modern unit and integration test runner covering cryptography, steganography algorithms, auth, and API routes. |
| **`httpx`** | `==0.27.*` | Asynchronous HTTP Client | Provides the test client (`httpx.AsyncClient` / `TestClient`) for simulating end-to-end API requests during pytest runs. |
| **`pip-audit`** | `==2.*` | Security Scanner | Automated vulnerability scanner checking Python dependencies against the Open Source Vulnerabilities (OSV) database in CI. |
| **`pre-commit`** | `==3.*` | Git Hook Framework | Manages client-side git hooks to run linting, formatting, and secret checking prior to committing code. |
| **`alembic`** | `==1.13.*` | Database Migrations | Schema revision and migration tracking system linked to SQLAlchemy model metadata. |

---

### 1.3 Frontend Runtime Dependencies (`frontend/package.json`)

The client SPA is built with React 18, Vite 5, and TypeScript:

| Package | Version Range | Category / Purpose | Architectural Justification |
|---|---|---|---|
| **`react`** | `^18.3.1` | Core UI Library | Component-based view rendering engine utilizing modern hooks (`useMemo`, `useState`, `useRef`, `useEffect`). |
| **`react-dom`** | `^18.3.1` | DOM Renderer | React renderer for the web browser DOM. |
| **`react-router-dom`** | `^6.27.0` | Client-side Routing | Declarative routing managing nested layouts, authenticated routes (`Protected`), and guest-only redirects. |
| **`@tanstack/react-query`** | `^5.59.0` | Server State Management | Asynchronous state management handling caching, revalidation, background polling, and optimistic UI updates. |
| **`axios`** | `^1.7.7` | HTTP Client | Promise-based HTTP client equipped with custom request/response interceptors for automatic JWT refresh token rotation. |
| **`zustand`** | `^5.0.0` | Client State Store | Minimalist, unopinionated client state management with `persist` middleware storing auth tokens and theme settings. |
| **`framer-motion`** | `^11.11.0` | UI Animation Engine | Production-ready declarative animations, micro-interactions, modal transitions, and accordion expansions. |
| **`lucide-react`** | `^0.451.0` | Iconography Suite | Crisp, lightweight, tree-shakeable SVG icons. |
| **`qrcode.react`** | `^4.2.0` | QR Code Generator | Client-side canvas/SVG QR code generator for instant mobile sharing of stego tokens. |
| **`recharts`** | `^2.13.0` | Data Visualization | Composable charting library used in Forensics and Dashboard for Shannon entropy and weekly embed trends. |
| **`sonner`** | `^1.5.0` | Toast Notifications | Modern, accessible, customizable toast notification system. |

---

### 1.4 Frontend Build & Development Tooling (`frontend/package.json`)

| Package | Version Range | Category / Purpose | Architectural Justification |
|---|---|---|---|
| **`vite`** | `^5.4.8` | Build Tool & Dev Server | Lightning-fast ESM dev server with Hot Module Replacement (HMR) and optimized Rollup-based production bundling. |
| **`typescript`** | `^5.6.2` | Language & Compiler | Enforces static type safety, compile-time interfaces, and refactoring integrity. |
| **`tailwindcss`** | `^3.4.13` | Styling Framework | Utility-first CSS framework providing responsive layouts, dark/light theme CSS variables, and design tokens. |
| **`postcss`** | `^8.4.47` | CSS Processing | CSS transformer powering Tailwind CSS compilation and autoprefixing. |
| **`autoprefixer`** | `^10.4.20` | CSS Vendor Prefixing | Automatically injects vendor prefixes to ensure cross-browser CSS compatibility. |
| **`@vitejs/plugin-react`** | `^4.3.2` | Vite React Plugin | Provides Fast Refresh support and Babel transform optimizations for Vite. |
| **`puppeteer-core`** | `^25.3.0` | Headless Browser Testing | Powers automated responsive viewport checks (`scripts/responsive-check.mjs`). |
| **`@types/*`** | Various | TypeScript Definitions | Type definitions for Node.js, React, and React-DOM. |

---

### 1.5 Infrastructure & Container Images (`docker-compose.yml`)

| Service | Base Image | Version / Tag | Architectural Responsibility |
|---|---|---|---|
| **`db`** | `postgres` | `16-alpine` | Production ACID-compliant relational database engine. Persists all users, chats, messages, tokens, and audit logs to persistent volume `db_data`. |
| **`backend`** | `python` | `3.12-slim` | Debian-based lightweight Python runtime container executing Uvicorn ASGI server as unprivileged user `appuser`. |
| **`frontend` (Build)** | `node` | `20-alpine` | Alpine Node.js build stage compiling TypeScript and bundling static assets into `dist/`. |
| **`frontend` (Runtime)**| `nginx` | `1.27-alpine` | Ultra-lightweight web server serving compiled SPA assets, applying security headers, and reverse-proxying `/api/*` to the backend. |

---

## 2. Minimum Hardware, OS, and Environment Requirements

### 2.1 Hardware Sizing Guidelines

| Parameter | Development / Evaluation | Small Production (1-50 users) | Enterprise Production (500+ users) |
|---|---|---|---|
| **CPU Architecture** | x86_64, aarch64 (ARM64), Apple Silicon (M1/M2/M3/M4) | x86_64 or aarch64 (2+ vCPUs) | x86_64 or aarch64 (4+ vCPUs) |
| **RAM (Memory)** | **2 GB minimum** (4 GB recommended for Docker Compose) | **4 GB minimum** | **8 GB - 16 GB** |
| **Storage Capacity** | 2 GB free disk space (codebase, node_modules, .venv) | 20 GB SSD (uploads volume, postgres data) | 100 GB+ NVMe SSD (persistent media volume) |
| **Network** | Local loopback (`127.0.0.1`) | 100 Mbps uplink, public IP/domain, valid TLS cert | 1 Gbps redundant uplink, CDN/Reverse proxy |

> [!NOTE]
> StegoChat's PBKDF2 key derivation function performs 200,000 SHA-256 iterations per message encryption/decryption. This intentional cryptographic work factor requires reasonable CPU throughput to maintain low latency (typically 50-150ms on modern CPUs).

### 2.2 Supported Operating Systems

- **Linux**: Ubuntu 20.04+, Debian 11+, RHEL/Rocky/Alma 8+, Alpine Linux 3.18+.
- **macOS**: macOS 12 (Monterey), macOS 13 (Ventura), macOS 14 (Sonoma), macOS 15 (Sequoia) on Intel and Apple Silicon.
- **Windows**: Windows 10 (Build 19041+) and Windows 11. Supported natively via PowerShell and cmd, or within WSL2 (Windows Subsystem for Linux - recommended for containerized dev).

### 2.3 Required Language Runtimes

- **Python**: **3.11.0 or higher** (Python 3.12 recommended).
- **Node.js**: **18.18.0 or higher** (Node.js 20 LTS recommended).
- **Package Managers**: `pip` >= 23.0, `npm` >= 9.0.
- **Docker**: Docker Engine 24.0+ and Docker Compose v2.20+ (when running containerized).

---

## 3. System-Level Binaries & Cryptographic Libraries

### 3.1 System Packages and Tooling

For environments where binary pre-compiled wheels are not supported by the platform, the host OS requires standard C build toolchains:

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y \
    build-essential \
    python3-dev \
    libssl-dev \
    libffi-dev \
    zlib1g-dev \
    libjpeg-dev \
    curl \
    git

# RHEL / Rocky Linux / Fedora
sudo dnf groupinstall "Development Tools"
sudo dnf install -y python3-devel openssl-devel libffi-devel libjpeg-turbo-devel zlib-devel curl git

# macOS (via Homebrew)
xcode-select --install
brew install openssl zlib libjpeg curl
```

### 3.2 Cryptographic Libraries & OpenSSL

- **OpenSSL 1.1.1+ / 3.0+**: Essential for host TLS termination and used under the hood by Python's `ssl` module, `python-jose`, and `pycryptodome`.
- **PyCryptodome Native C-Extensions**: `pycryptodome` compiles optimized C routines for AES-NI hardware acceleration when available on the host processor, dramatically speeding up AES-256-GCM encryption and decryption.

### 3.3 Status of Multimedia Libraries (FFmpeg / OpenCV)

- **FFmpeg**: **Not strictly required as a hard runtime dependency**.
  - *Technical Rationale*: StegoChat handles raster images (PNG, JPEG, BMP) strictly via **Pillow** and **NumPy**. Universal file hiding (`/api/hide-file` and `/api/reveal-file`) handles arbitrary carrier formats—including video (MP4, MKV) and audio (MP3, WAV)—at the binary byte level using append-after-EOF steganography. Because re-encoding or transcoding video via FFmpeg would destroy the appended ciphertext, StegoChat deliberately avoids recompression pipelines.
- **OpenCV**: **Not required**.
  - *Technical Rationale*: All spatial image transformations, 2D array manipulations, and discrete cosine transforms are implemented natively using NumPy vectorization and Pillow, eliminating the heavy footprint and native C++ dependency overhead of OpenCV.
