# StegoChat Local Environment Setup & Configuration Guide

This guide provides end-to-end instructions for establishing, configuring, running, and verifying the StegoChat development environment across Windows, macOS, and Linux platforms.

---

## 1. Quick Reference & Architecture Topology

StegoChat operates in two primary development configurations:

1. **Native Local Development (Split Tier)**:
   - Backend API: FastAPI / Uvicorn running on `http://localhost:8000` (SQLite database created automatically).
   - Frontend SPA: Vite dev server running on `http://localhost:5173` (proxies `/api` to port 8000).
2. **Containerized Production Replica (Docker Compose)**:
   - PostgreSQL 16 on port 5432.
   - FastAPI backend container running on internal port 8000.
   - Nginx reverse proxy serving the built SPA and routing `/api` on `http://localhost:8080`.

---

## 2. Option A: Native Local Development (Recommended for Development)

### 2.1 Prerequisites Verification

Open a terminal (PowerShell on Windows, Bash/Zsh on Linux/macOS) and verify runtime versions:

```bash
# Verify Python version (Requires 3.11+)
python --version   # or python3 --version

# Verify Node.js version (Requires 18+)
node --version

# Verify npm
npm --version

# Verify Git
git --version
```

---

### 2.2 Backend Setup (Terminal 1)

#### Step 1: Navigate to the backend directory
```bash
cd backend
```

#### Step 2: Create a virtual environment
```bash
# Windows (PowerShell or Command Prompt)
python -m venv .venv

# macOS / Linux
python3 -m venv .venv
```

#### Step 3: Activate the virtual environment
```bash
# Windows (PowerShell)
# If script execution is restricted, run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

# Windows (Command Prompt)
.\.venv\Scripts\activate.bat

# macOS / Linux (Bash/Zsh)
source .venv/bin/activate
```

#### Step 4: Upgrade pip and install dependencies
```bash
python -m pip install --upgrade pip
pip install -r requirements.txt -r requirements-dev.txt
```

#### Step 5: Configure backend environment variables
Copy the template `.env.example` to `.env`:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `backend/.env` in your editor. For local development, the default values work out of the box with zero configuration:
- `STEGOCHAT_ENVIRONMENT=development`
- `STEGOCHAT_DEBUG=true`
- `STEGOCHAT_DATABASE_URL=sqlite:///./stegochat.db`
- `STEGOCHAT_SECRET_KEY=dev-insecure-change-me-in-production-000000000000`

#### Step 6: Initialize the database and run migrations
```bash
alembic upgrade head
```
*(Note: On initial boot, FastAPI also executes `init_db()` automatically to guarantee table and column availability).*

#### Step 7: Launch the backend server with Hot Reload
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify backend health:
- Swagger Interactive Docs: `http://localhost:8000/api/docs`
- Health Probe: `http://localhost:8000/api/health`
- Readiness Probe: `http://localhost:8000/api/ready`

---

### 2.3 Frontend Setup (Terminal 2)

#### Step 1: Open a new terminal and navigate to `frontend`
```bash
cd frontend
```

#### Step 2: Install Node dependencies
```bash
npm install
```

#### Step 3: Configure frontend environment variables
Copy the template `.env.example` to `.env`:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Ensure `frontend/.env` contains:
```ini
# Where Vite proxies /api requests during local development
VITE_API_TARGET=http://localhost:8000
```

#### Step 4: Launch the Vite development server
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`. 
Open the browser, register a new account, and explore the Stego Studio and Chat interfaces.

---

## 3. Option B: Full-Stack Docker Compose Deployment

Docker Compose launches the complete production stack (PostgreSQL, FastAPI backend, and Nginx reverse proxy) with a single command.

### Step 1: Configure Root Environment File
From the repository root:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

### Step 2: Generate a Cryptographically Strong Secret Key
Run this Python one-liner to generate a 48-byte URL-safe secret token:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the resulting string into the root `.env` file for `STEGOCHAT_SECRET_KEY`:

```ini
STEGOCHAT_SECRET_KEY=paste_your_generated_secret_here_3u9a8df...
POSTGRES_USER=stego
POSTGRES_PASSWORD=stego
POSTGRES_DB=stegochat
WEB_PORT=8080
```

### Step 3: Build and Start Containers
```bash
docker compose up --build -d
```

### Step 4: Verify Container Health
```bash
docker compose ps
```

All three services (`db`, `backend`, `frontend`) should display `healthy` status.

### Step 5: Apply Database Migrations inside the Container
```bash
docker compose exec backend alembic upgrade head
```

### Step 6: Access the Application
- Web Application: `http://localhost:8080`
- API Health Status: `http://localhost:8080/api/health`
- Backend Direct Readiness: `http://localhost:8080/api/ready`

To stop the containers:
```bash
docker compose down
```

---

## 4. Environment Variables Reference Matrix

All backend configuration variables are prefixed with `STEGOCHAT_` and processed through Pydantic (`backend/app/config.py`).

| Variable Name | Defined In | Default Value | Description / Scope | Production Security Requirement |
|---|---|---|---|---|
| `STEGOCHAT_SECRET_KEY` | Backend / Docker | `dev-insecure-change-me-...` | Secret signing key for JWT access tokens and 2FA challenge tokens. | **CRITICAL**: Must be a high-entropy 64+ char random string. |
| `STEGOCHAT_ENVIRONMENT` | Backend / Docker | `development` | Environment mode (`development` vs `production`). Enables HSTS headers when set to `production`. | Set to `production` in live environments. |
| `STEGOCHAT_DEBUG` | Backend / Docker | `true` | Enables verbose stack traces and debug logging level. | Set to `false` in production. |
| `STEGOCHAT_HOST` | Backend | `0.0.0.0` | Host binding address for Uvicorn server. | Bind to `127.0.0.1` if behind local proxy, or `0.0.0.0` in Docker. |
| `STEGOCHAT_PORT` | Backend | `8000` | Port for the backend API. | Set to desired port. |
| `STEGOCHAT_ACCESS_TOKEN_EXPIRE_MINUTES` | Backend | `30` | Lifespan of JWT access tokens in minutes before automatic refresh. | 15 to 60 minutes recommended. |
| `STEGOCHAT_REFRESH_TOKEN_EXPIRE_DAYS` | Backend | `14` | Lifespan of rotating refresh tokens in days. | 7 to 30 days recommended. |
| `STEGOCHAT_DATABASE_URL` | Backend / Docker | `sqlite:///./stegochat.db` | SQLAlchemy database connection URI. | Use `postgresql+psycopg://user:pass@host:5432/dbname` in production. |
| `STEGOCHAT_CORS_ORIGINS` | Backend / Docker | `["http://localhost:5173", ...]` | JSON-serialized array of permitted HTTP origins for CORS. | **IMPORTANT**: Restrict strictly to trusted frontend domain(s). |
| `STEGOCHAT_UPLOAD_DIR` | Backend / Docker | `<repo>/uploads` | Filesystem directory storing generated stego images and payloads. | Mount to persistent, backed-up storage volume. |
| `STEGOCHAT_SAMPLE_DIR` | Backend / Docker | `<repo>/sample_images`| Directory containing built-in cover image samples. | Read-only access recommended. |
| `STEGOCHAT_MAX_UPLOAD_BYTES` | Backend | `10485760` (10 MB) | Maximum permitted size for uploaded cover images. | Adjust to align with server memory. |
| `STEGOCHAT_MAX_CARRIER_BYTES` | Backend | `67108864` (64 MB) | Maximum size for universal EOF carrier media (videos, PDFs, etc.). | Adjust to bandwidth limits. |
| `STEGOCHAT_PWNED_CHECK_ENABLED` | Backend | `true` | Enables HaveIBeenPwned k-anonymity check during password changes. | Keep `true` for security; fails open if API unreachable. |
| `STEGOCHAT_RATE_LIMIT_AUTH` | Backend | `10/minute` | Rate limit for sensitive auth endpoints (login, register). | Enforces anti-brute-force defense. |
| `STEGOCHAT_RATE_LIMIT_EMBED` | Backend | `30/minute` | Rate limit for compute-heavy steganography endpoints. | Prevents CPU exhaustion. |
| `STEGOCHAT_RATE_LIMIT_DEFAULT` | Backend | `120/minute` | Default rate limit per client IP across all endpoints. | Adjust based on traffic profile. |
| `STEGOCHAT_FRONTEND_URL` | Backend | `http://localhost:5173` | Base URL used to formulate email verification and password reset links. | Point to public production URL. |
| `VITE_API_TARGET` | Frontend | `http://localhost:8000` | Dev proxy destination for `/api` requests in Vite server. | Used exclusively during `npm run dev`. |
| `VITE_API_BASE` | Frontend | `""` (Empty / relative) | Base URL for Axios client. Leave empty for same-origin `/api`. | Set only if API hosted on separate domain. |
| `POSTGRES_USER` | Root Docker | `stego` | Username for containerized PostgreSQL instance. | Change in production. |
| `POSTGRES_PASSWORD` | Root Docker | `stego` | Password for containerized PostgreSQL instance. | Change in production. |
| `POSTGRES_DB` | Root Docker | `stegochat` | Database name for containerized PostgreSQL. | Configurable. |
| `WEB_PORT` | Root Docker | `8080` | Host port exposing Nginx frontend in Docker Compose. | Map to port 80 or 443. |

---

## 5. Transactional Email Setup (Optional)

StegoChat supports sending transactional emails (signup verification OTPs and password reset links) via three selectable modes in `backend/app/services/mail.py`:

### Mode 1: Development / Mock Mode (Default)
If no email credentials are set, the system automatically logs email contents and authentication tokens to the console output. Signup OTP tokens are also conveniently returned directly in the registration API response during local development.

### Mode 2: Google Gmail API via OAuth2 (Recommended)
This mode does not require enabling insecure app passwords on your Google account:
1. Create a project in Google Cloud Console and enable the **Gmail API**.
2. Create **OAuth 2.0 Client ID** credentials (Application type: Desktop App).
3. Set in `backend/.env`:
   ```ini
   STEGOCHAT_GMAIL_CLIENT_ID=your_client_id.apps.googleusercontent.com
   STEGOCHAT_GMAIL_CLIENT_SECRET=your_client_secret
   STEGOCHAT_MAIL_FROM=your_email@gmail.com
   ```
4. Run the helper script once to authorize and obtain your refresh token:
   ```bash
   python backend/scripts/get_gmail_token.py
   ```
5. Add the printed refresh token to `backend/.env`:
   ```ini
   STEGOCHAT_GMAIL_REFRESH_TOKEN=1//0g...
   ```

### Mode 3: Generic SMTP Provider
For Mailgun, SendGrid, Amazon SES, or standard SMTP:
```ini
STEGOCHAT_SMTP_HOST=smtp.mailgun.org
STEGOCHAT_SMTP_PORT=587
STEGOCHAT_SMTP_USER=postmaster@yourdomain.com
STEGOCHAT_SMTP_PASSWORD=your_smtp_password
STEGOCHAT_SMTP_USE_SSL=false
STEGOCHAT_MAIL_FROM=no-reply@yourdomain.com
```

---

## 6. Testing, Quality Assurance & Verification

The project includes an extensive test suite and strict static analysis pipelines. Run these checks to verify the integrity of your installation:

### 6.1 Backend Test Automation (Pytest)
```bash
cd backend

# Run all unit and integration tests
pytest

# Run tests with detailed verbose output
pytest -v

# Target specific modules
pytest tests/test_crypto.py
pytest tests/test_stego.py
pytest tests/test_split.py
pytest tests/test_hide_file.py
pytest tests/test_2fa.py
```

### 6.2 Code Quality & Static Analysis
```bash
# Backend Linting and Formatting (Ruff)
cd backend
ruff check .
ruff format --check .

# Backend Static Type Checking (Mypy)
mypy app

# Frontend Static Type Checking (TypeScript)
cd ../frontend
npm run typecheck

# Frontend Production Build Test
npm run build
```

### 6.3 Root Makefile Tasks (Linux / macOS / WSL)
If `make` is installed on your system:
```bash
make help          # Show available commands
make install       # Install both backend and frontend dependencies
make test          # Run backend pytest suite
make lint          # Run ruff check and eslint
make typecheck     # Run mypy and tsc
make check         # Run all quality gates (lint + typecheck + test + build)
make docker-up     # Start Docker Compose stack
```

---

## 7. Common Troubleshooting & FAQs

### Q1: `ModuleNotFoundError: No module named 'app'` when running pytest
**Solution**: Ensure your virtual environment is active and you are inside the `backend` directory. `backend/pyproject.toml` is configured with `pythonpath = ["."]`, making `app` discoverable when running `pytest` inside `backend`.

### Q2: PowerShell says `Execution of scripts is disabled on this system`
**Solution**: On Windows, PowerShell restricts unsigned script execution by default. Run:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
Then rerun `.\.venv\Scripts\Activate.ps1`.

### Q3: `Port 8000 or 5173 is already in use`
**Solution**:
- On Windows: Check occupying process via `netstat -ano | findstr :8000` and terminate it via `Stop-Process -Id <PID> -Force`.
- On Linux/macOS: Check via `lsof -i :8000` and kill with `kill -9 <PID>`.
- Alternatively, launch Uvicorn on an alternate port: `uvicorn app.main:app --port 8001`, and update `VITE_API_TARGET=http://localhost:8001` in `frontend/.env`.

### Q4: CORS errors when calling backend from frontend
**Solution**: Ensure `STEGOCHAT_CORS_ORIGINS` in `backend/.env` includes your exact frontend origin (e.g. `["http://localhost:5173", "http://127.0.0.1:5173"]`). Note that origins must not have trailing slashes.
