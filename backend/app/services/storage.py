"""Filesystem storage helpers for stego outputs and uploads validation."""

from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import settings


def ensure_dirs() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.sample_dir.mkdir(parents=True, exist_ok=True)


async def read_image_upload(file: UploadFile) -> bytes:
    """Validate an uploaded image (extension, mimetype, size) and return bytes."""
    ext = Path(file.filename or "").suffix.lower()
    if ext and ext not in settings.allowed_image_extensions:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{ext}'. Allowed: {sorted(settings.allowed_image_extensions)}",
        )
    if file.content_type and file.content_type not in settings.allowed_image_mimetypes:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unexpected content type '{file.content_type}'",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    return data


async def read_any_upload(file: UploadFile, max_bytes: int | None = None) -> bytes:
    limit = max_bytes if max_bytes is not None else settings.max_upload_bytes
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {limit // (1024 * 1024)} MB limit",
        )
    return data


def save_stego(data: bytes, prefix: str = "stego") -> str:
    """Persist bytes to the upload dir under a random name; return the filename."""
    ensure_dirs()
    name = f"{prefix}_{secrets.token_hex(8)}.png"
    (settings.upload_dir / name).write_bytes(data)
    return name


# File extensions we won't hand back with their original suffix, because a
# browser/OS might execute or specially handle them. The carrier keeps its own
# extension so it still opens as the media it appears to be; anything on this
# list is neutralised to ``.bin``.
_UNSAFE_EXTENSIONS = {
    ".exe",
    ".msi",
    ".bat",
    ".cmd",
    ".com",
    ".scr",
    ".ps1",
    ".sh",
    ".js",
    ".jar",
    ".html",
    ".htm",
    ".svg",
    ".php",
    ".apk",
}


def safe_carrier_ext(filename: str | None) -> str:
    """Return a lowercased, safe file extension (with dot) for a carrier file."""
    ext = Path(filename or "").suffix.lower()
    if not ext or len(ext) > 12 or ext in _UNSAFE_EXTENSIONS:
        return ".bin"
    # Only allow simple alphanumeric extensions.
    if not ext[1:].isalnum():
        return ".bin"
    return ext


def save_bytes(data: bytes, prefix: str = "file", ext: str = ".bin") -> str:
    """Persist bytes under a random name that preserves a given extension."""
    ensure_dirs()
    if not ext.startswith("."):
        ext = "." + ext
    name = f"{prefix}_{secrets.token_hex(8)}{ext}"
    (settings.upload_dir / name).write_bytes(data)
    return name


def upload_path(name: str) -> Path:
    # Prevent path traversal — only allow a bare filename.
    safe = Path(name).name
    return settings.upload_dir / safe
