"""Append-after-EOF file hiding.

An arbitrary file (any type) is encrypted and appended after a cover image's
data stream, preceded by a marker. Image viewers ignore trailing bytes, so the
carrier still displays normally, but the payload can be recovered with the
password. Unlike LSB this preserves the payload exactly and has no capacity
limit, at the cost of a larger output file.
"""

from __future__ import annotations

import base64
import json

from app.core.crypto import DecryptionError, decrypt_bytes, encrypt_bytes

EOF_MARKER = b"\x00\x00STEGOCHAT_EOF\x00\x00"


class EofError(Exception):
    pass


def eof_embed(
    cover_bytes: bytes, payload_bytes: bytes, filename: str, mime: str, password: str
) -> bytes:
    envelope = {
        "filename": filename,
        "mime": mime,
        "data": base64.b64encode(payload_bytes).decode("ascii"),
    }
    plaintext = json.dumps(envelope).encode("utf-8")
    encrypted = encrypt_bytes(plaintext, password)
    return cover_bytes + EOF_MARKER + encrypted


def eof_extract(stego_bytes: bytes, password: str) -> tuple[bytes, str, str]:
    """Return (payload_bytes, filename, mime)."""
    idx = stego_bytes.rfind(EOF_MARKER)
    if idx == -1:
        raise EofError("No appended payload found in this file")
    encrypted = stego_bytes[idx + len(EOF_MARKER) :]
    try:
        plaintext = decrypt_bytes(encrypted, password)
    except DecryptionError as exc:
        raise EofError("Wrong password or corrupted payload") from exc
    try:
        envelope = json.loads(plaintext.decode("utf-8"))
        return (
            base64.b64decode(envelope["data"]),
            envelope.get("filename", "payload.bin"),
            envelope.get("mime", "application/octet-stream"),
        )
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise EofError("Malformed payload envelope") from exc
