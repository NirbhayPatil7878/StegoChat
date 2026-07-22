"""Application configuration loaded from environment variables.

All settings have sensible development defaults so the app runs with zero
configuration, while every value can be overridden via environment variables
(or a local ``.env`` file) for production.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
PROJECT_ROOT = BASE_DIR.parent  # repo root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_prefix="STEGOCHAT_",
        extra="ignore",
    )

    # --- Core ---
    app_name: str = "StegoChat"
    environment: str = "development"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000

    # --- Security / JWT ---
    # In production ALWAYS override this. A fixed dev default keeps local
    # tokens valid across reloads without leaking a real secret.
    secret_key: str = "dev-insecure-change-me-in-production-000000000000"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # --- Database ---
    # Defaults to a local SQLite file. Point at Postgres in production, e.g.:
    #   STEGOCHAT_DATABASE_URL=postgresql+psycopg://user:pass@host:5432/stegochat
    database_url: str = f"sqlite:///{BASE_DIR / 'stegochat.db'}"

    # --- CORS ---
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]

    # --- Uploads / storage ---
    upload_dir: Path = PROJECT_ROOT / "uploads"
    sample_dir: Path = PROJECT_ROOT / "sample_images"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB (images / LSB covers)
    # Carrier files for universal append-hiding (video/audio/etc.) can be larger.
    max_carrier_bytes: int = 64 * 1024 * 1024  # 64 MB
    allowed_image_extensions: set[str] = {".png", ".jpg", ".jpeg", ".bmp"}
    allowed_image_mimetypes: set[str] = {"image/png", "image/jpeg", "image/bmp"}

    # --- Compromised-password check (HaveIBeenPwned, k-anonymity) ---
    # When enabled, registration and password changes reject passwords found in
    # public breach corpora. Fails open if the HIBP API is unreachable.
    pwned_check_enabled: bool = True

    # --- Rate limiting ---
    rate_limit_auth: str = "10/minute"
    rate_limit_default: str = "120/minute"
    rate_limit_embed: str = "30/minute"

    # --- Email (OTP / password reset / verification) ---
    # Option A — Gmail API (recommended, no App Password needed):
    #   Set STEGOCHAT_GMAIL_CLIENT_ID, STEGOCHAT_GMAIL_CLIENT_SECRET,
    #   STEGOCHAT_GMAIL_REFRESH_TOKEN, STEGOCHAT_MAIL_FROM.
    #   Run scripts/get_gmail_token.py once to obtain the refresh token.
    # Option B — Generic SMTP (e.g. Gmail App Password, Mailgun, etc.):
    #   Set STEGOCHAT_SMTP_HOST, STEGOCHAT_SMTP_USER, STEGOCHAT_SMTP_PASSWORD.
    # Option C — Dev mode: leave everything blank; tokens are logged + echoed.
    gmail_client_id: str | None = None
    gmail_client_secret: str | None = None
    gmail_refresh_token: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_use_ssl: bool = False
    smtp_user: str | None = None
    smtp_password: str | None = None
    mail_from: str = "stegochat232@gmail.com"
    frontend_url: str = "http://localhost:5173"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
