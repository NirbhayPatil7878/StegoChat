"""Time-based one-time password (TOTP) 2FA helpers and recovery codes."""

from __future__ import annotations

import hashlib
import json
import secrets

import pyotp

from app.config import settings

_ISSUER = "StegoChat"
_RECOVERY_CODE_COUNT = 10


def generate_secret() -> str:
    """A fresh base32 TOTP secret."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, account: str) -> str:
    """otpauth:// URI to render as a QR for authenticator apps."""
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=_ISSUER)


def verify_code(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code, allowing one step of clock drift."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


# --- Recovery codes ----------------------------------------------------------


def _hash_code(code: str) -> str:
    # Recovery codes are high-entropy; a fast SHA-256 is sufficient and lets us
    # match without storing the plaintext.
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_recovery_codes() -> tuple[list[str], str]:
    """Return (plaintext_codes, serialized_hashes).

    Plaintext is shown to the user exactly once; only the hashes are stored.
    """
    codes = [
        f"{secrets.token_hex(2)}-{secrets.token_hex(2)}-{secrets.token_hex(2)}"
        for _ in range(_RECOVERY_CODE_COUNT)
    ]
    serialized = json.dumps([_hash_code(c) for c in codes])
    return codes, serialized


def consume_recovery_code(serialized: str | None, code: str) -> str | None:
    """If ``code`` matches a stored hash, return the updated JSON with it removed.

    Returns ``None`` when the code does not match (no change).
    """
    if not serialized:
        return None
    try:
        hashes = json.loads(serialized)
    except (json.JSONDecodeError, TypeError):
        return None
    target = _hash_code(code.strip())
    if target not in hashes:
        return None
    hashes.remove(target)
    return json.dumps(hashes)


def recovery_codes_remaining(serialized: str | None) -> int:
    if not serialized:
        return 0
    try:
        return len(json.loads(serialized))
    except (json.JSONDecodeError, TypeError):
        return 0


# --- Short-lived 2FA challenge token -----------------------------------------
# Issued after a correct password when 2FA is on; exchanged for real tokens once
# the user provides a valid TOTP/recovery code. Signed with the app secret.

_CHALLENGE_TTL_SECONDS = 300


def create_challenge_token(user_id: int) -> str:
    from datetime import UTC, datetime, timedelta

    from jose import jwt

    payload = {
        "sub": str(user_id),
        "type": "2fa_challenge",
        "exp": datetime.now(UTC) + timedelta(seconds=_CHALLENGE_TTL_SECONDS),
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_challenge_token(token: str) -> int:
    from jose import JWTError, jwt

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired challenge") from exc
    if payload.get("type") != "2fa_challenge":
        raise ValueError("Wrong token type")
    return int(payload["sub"])
