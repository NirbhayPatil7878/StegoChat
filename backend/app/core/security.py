"""Password hashing (bcrypt) and JWT access/refresh token handling."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.config import settings

# bcrypt has a hard 72-byte input limit; longer passwords are pre-hashed.
_BCRYPT_MAX_BYTES = 72


def _prepare_password(password: str) -> bytes:
    raw = password.encode("utf-8")
    if len(raw) > _BCRYPT_MAX_BYTES:
        # Pre-hash to a fixed length so arbitrarily long passwords are supported
        # without silently truncating entropy.
        raw = hashlib.sha256(raw).digest()
    return raw


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare_password(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare_password(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --- JWT ---------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC)


def create_access_token(subject: str | int, extra: dict | None = None) -> str:
    expire = _now() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(subject), "type": "access", "exp": expire, "iat": _now()}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token() -> tuple[str, str, datetime]:
    """Return (raw_token, token_hash, expires_at).

    The raw token is a high-entropy random string returned to the client; only
    its SHA-256 hash is persisted server-side.
    """
    raw = secrets.token_urlsafe(48)
    token_hash = hash_token(raw)
    expires_at = _now() + timedelta(days=settings.refresh_token_expire_days)
    return raw, token_hash, expires_at


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
    if payload.get("type") != "access":
        raise ValueError("Wrong token type")
    return payload
