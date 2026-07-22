"""Authenticated AES-256 encryption with PBKDF2 key derivation.

Envelope layout (before base64):
    MAGIC(4) | VERSION(1) | SALT(16) | NONCE(12) | TAG(16) | CIPHERTEXT(...)

- Key derivation: PBKDF2-HMAC-SHA256, per-message random 16-byte salt.
- Cipher: AES-256-GCM, per-message random 12-byte nonce, providing both
  confidentiality and integrity (the GCM tag detects a wrong password or any
  tampering, so we never silently return garbage plaintext).
"""

from __future__ import annotations

import base64

from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes

MAGIC = b"SGC1"
VERSION = 1
SALT_LEN = 16
NONCE_LEN = 12
TAG_LEN = 16
KEY_LEN = 32  # AES-256
PBKDF2_ITERATIONS = 200_000


class DecryptionError(Exception):
    """Raised when decryption fails (wrong password or corrupted data)."""


def _derive_key(password: str, salt: bytes) -> bytes:
    # PyCryptodome's PBKDF2 accepts bytes at runtime; its type stub only
    # declares str, so narrow the arg-type check here.
    return PBKDF2(
        password.encode("utf-8"),  # type: ignore[arg-type]
        salt,
        dkLen=KEY_LEN,
        count=PBKDF2_ITERATIONS,
        hmac_hash_module=SHA256,
    )


def encrypt(plaintext: str, password: str) -> str:
    """Encrypt text with a password, returning a base64 envelope string."""
    salt = get_random_bytes(SALT_LEN)
    nonce = get_random_bytes(NONCE_LEN)
    key = _derive_key(password, salt)

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode("utf-8"))

    envelope = MAGIC + bytes([VERSION]) + salt + nonce + tag + ciphertext
    return base64.b64encode(envelope).decode("ascii")


def encrypt_bytes(data: bytes, password: str) -> bytes:
    """Encrypt raw bytes, returning the raw binary envelope (not base64)."""
    salt = get_random_bytes(SALT_LEN)
    nonce = get_random_bytes(NONCE_LEN)
    key = _derive_key(password, salt)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(data)
    return MAGIC + bytes([VERSION]) + salt + nonce + tag + ciphertext


def _parse(envelope: bytes) -> tuple[bytes, bytes, bytes, bytes]:
    if len(envelope) < 5 + SALT_LEN + NONCE_LEN + TAG_LEN:
        raise DecryptionError("Ciphertext is truncated or malformed")
    if envelope[:4] != MAGIC:
        raise DecryptionError("Unrecognised ciphertext format")
    offset = 5
    salt = envelope[offset : offset + SALT_LEN]
    offset += SALT_LEN
    nonce = envelope[offset : offset + NONCE_LEN]
    offset += NONCE_LEN
    tag = envelope[offset : offset + TAG_LEN]
    offset += TAG_LEN
    ciphertext = envelope[offset:]
    return salt, nonce, tag, ciphertext


def decrypt(token: str, password: str) -> str:
    """Decrypt a base64 envelope produced by :func:`encrypt`."""
    try:
        envelope = base64.b64decode(token)
    except Exception as exc:  # noqa: BLE001
        raise DecryptionError("Invalid base64 ciphertext") from exc
    return decrypt_bytes(envelope, password).decode("utf-8")


def decrypt_bytes(envelope: bytes, password: str) -> bytes:
    salt, nonce, tag, ciphertext = _parse(envelope)
    key = _derive_key(password, salt)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    try:
        return cipher.decrypt_and_verify(ciphertext, tag)
    except (ValueError, KeyError) as exc:
        raise DecryptionError("Wrong password or corrupted data") from exc
