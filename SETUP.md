# StegoChat Setup & Installation Guide

This guide provides step-by-step instructions for installing, configuring, and running StegoChat on a native **Windows host** (PowerShell and Command Prompt), as well as via **Docker Desktop**.

---

## 1. Prerequisites for Windows

Before starting, ensure the following software is installed on your Windows machine:

1. **Python 3.11+** (Python 3.11 or 3.12 recommended)
   - Download from [python.org](https://www.python.org/downloads/).
   - ⚠️ **Important**: During installation, check the box **"Add python.exe to PATH"**.
2. **Node.js 18+ LTS** (Node.js 20 LTS recommended)
   - Download from [nodejs.org](https://nodejs.org/).
3. **Git for Windows**
   - Download from [git-scm.com](https://git-scm.com/).
4. **PowerShell Execution Policy**:
   - Windows restricts running unsigned PowerShell scripts by default. Open Windows PowerShell and run:
     ```powershell
     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
     ```
   - Alternatively, you can set it for the CurrentUser:
     ```powershell
     Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
     ```

Verify your installed versions in PowerShell:
```powershell
python --version
node --version
npm --version
git --version
```

---

## 2. Native Windows Setup (Dual-Terminal Workflow)

StegoChat's development environment runs the FastAPI backend on port `8000` and the Vite/React frontend on port `5173`.

### 2.1 Backend Setup (Terminal 1 - Windows PowerShell)

1. **Open PowerShell and navigate to the `backend` directory**:
   ```powershell
   cd backend
   ```

2. **Create a virtual environment**:
   ```powershell
   python -m venv .venv
   ```

3. **Activate the virtual environment**:
   - In **PowerShell**:
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - *(If using classic **Command Prompt (cmd.exe)**)*:
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
   *(Your terminal prompt should now display `(.venv)`).*

4. **Install runtime and development dependencies**:
   ```powershell
   python -m pip install --upgrade pip
   pip install -r requirements.txt -r requirements-dev.txt
   ```

5. **Create the environment configuration file**:
   ```powershell
   Copy-Item .env.example .env
   ```
   *(The default `.env` configuration uses zero-config SQLite (`sqlite:///./stegochat.db`), which is created automatically).*

6. **Apply database schema migrations using Alembic**:
   ```powershell
   alembic upgrade head
   ```

7. **Launch the Uvicorn development server with live reload**:
   ```powershell
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

The backend is now live:
- **API Base**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/api/docs`
- **Health Check**: `http://127.0.0.1:8000/api/health`

---

### 2.2 Frontend Setup (Terminal 2 - Windows PowerShell)

1. **Open a second PowerShell window and navigate to `frontend`**:
   ```powershell
   cd frontend
   ```

2. **Install Node packages**:
   ```powershell
   npm install
   ```

3. **Configure the environment file**:
   ```powershell
   Copy-Item .env.example .env
   ```
   Verify that `frontend/.env` contains the backend proxy target:
   ```ini
   VITE_API_TARGET=http://localhost:8000
   ```

4. **Launch the Vite development server**:
   ```powershell
   npm run dev
   ```

The frontend will start at:
- **Web App**: `http://localhost:5173`

The Vite dev server automatically proxies all `/api/*` network calls to the backend on `http://localhost:8000`. Open your browser to `http://localhost:5173` to start using StegoChat.

---

## 3. Docker Desktop on Windows (One-Command Stack)

If you prefer containerized deployment using **Docker Desktop for Windows**:

1. **Prerequisites**:
   - Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) with WSL2 backend enabled.
   - Start Docker Desktop and ensure the engine is running.

2. **Configure root environment file**:
   In PowerShell at the project root:
   ```powershell
   Copy-Item .env.example .env
   ```

3. **Generate a secure secret key**:
   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
   Open `.env` in Notepad or VS Code and set `STEGOCHAT_SECRET_KEY` to the generated string.

4. **Build and launch containers**:
   ```powershell
   docker compose up --build -d
   ```

5. **Verify running containers**:
   ```powershell
   docker compose ps
   ```
   Services launched:
   - `db`: PostgreSQL 16 (internal port 5432)
   - `backend`: FastAPI / Uvicorn (internal port 8000)
   - `frontend`: Nginx serving built React SPA & reverse-proxying `/api` on `http://localhost:8080`

6. **Apply Alembic migrations inside the container**:
   ```powershell
   docker compose exec backend alembic upgrade head
   ```

7. **Access the application**:
   - Web App: `http://localhost:8080`
   - Health Probe: `http://localhost:8080/api/health`

To stop the containers:
```powershell
docker compose down
```

---

## 4. Testing & Quality Verification on Windows

Run automated test suites and linters from PowerShell:

### Run Backend Tests
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -v
```

### Type Checking & Linting
```powershell
# Backend lint & typecheck
cd backend
ruff check .
mypy app

# Frontend typecheck & build test
cd ../frontend
npm run typecheck
npm run build
```

---

## 5. Common Windows Troubleshooting

### 1. PowerShell Script Execution Restriction
- **Error**: `.\.venv\Scripts\Activate.ps1 cannot be loaded because running scripts is disabled on this system.`
- **Fix**: Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in the current PowerShell terminal, then re-run `.\.venv\Scripts\Activate.ps1`.

### 2. Port Conflict (Port 8000 or 5173 Already in Use)
- **Check occupying process**:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 | Select-Object OwningProcess
  ```
- **Stop process by PID**:
  ```powershell
  Stop-Process -Id <PID> -Force
  ```
- Or run Uvicorn on another port:
  ```powershell
  uvicorn app.main:app --reload --port 8001
  ```
  *(Update `VITE_API_TARGET=http://localhost:8001` in `frontend/.env`).*

### 3. Missing C++ Build Tools (Wheel Compilation)
- If `pip install` fails with `Microsoft Visual C++ 14.0 or greater is required`:
  - Upgrade pip first: `python -m pip install --upgrade pip setuptools wheel`.
  - Up-to-date pip will download pre-compiled binary wheels for `bcrypt`, `pycryptodome`, and `numpy` without needing a local C++ compiler.
