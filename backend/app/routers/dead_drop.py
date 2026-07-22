"""Self-destructing 'dead drop' encrypted payloads reachable by token."""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import DecryptionError, decrypt, encrypt
from app.core.deps import get_current_user
from app.database import get_db
from app.models import DeadDrop, User
from app.schemas.stego import (
    DeadDropCreate,
    DeadDropCreateResponse,
    DeadDropReadRequest,
    DeadDropReadResponse,
)

router = APIRouter(prefix="/api/dead-drop", tags=["dead-drop"])


@router.post("", response_model=DeadDropCreateResponse, status_code=status.HTTP_201_CREATED)
def create_dead_drop(
    payload: DeadDropCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    token = secrets.token_urlsafe(12)
    expires = datetime.now(UTC) + timedelta(hours=payload.ttl_hours)
    preview = (payload.message[:100] + "…") if len(payload.message) > 100 else payload.message
    drop = DeadDrop(
        token=token,
        owner_id=user.id,
        kind="text",
        encrypted_payload=encrypt(payload.message, payload.password),
        preview=preview,
        burn_after_read=payload.burn_after_read,
        expires_at=expires,
    )
    db.add(drop)
    db.commit()
    return DeadDropCreateResponse(token=token, expires_at=expires)


@router.post("/{token}", response_model=DeadDropReadResponse)
def read_dead_drop(token: str, payload: DeadDropReadRequest, db: Session = Depends(get_db)):
    """Public read (no auth) — knowledge of token + password is the credential."""
    drop = db.query(DeadDrop).filter(DeadDrop.token == token).first()
    now = datetime.now(UTC)
    if not drop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dead drop not found")
    if drop.used and drop.burn_after_read:
        raise HTTPException(status.HTTP_410_GONE, detail="This dead drop has already been opened")
    if _expired(drop, now):
        db.delete(drop)
        db.commit()
        raise HTTPException(status.HTTP_410_GONE, detail="This dead drop has expired")

    if drop.kind == "text":
        try:
            message = decrypt(drop.encrypted_payload or "", payload.password)
        except DecryptionError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Wrong password") from exc
        stego_url = None
    else:
        message = None
        stego_url = f"/api/files/{drop.stego_filename}" if drop.stego_filename else None

    created_at, expires_at = drop.created_at, drop.expires_at
    if drop.burn_after_read:
        db.delete(drop)
    else:
        drop.used = True
    db.commit()

    return DeadDropReadResponse(
        kind=drop.kind,
        message=message,
        stego_url=stego_url,
        created_at=created_at,
        expires_at=expires_at,
    )


@router.get("/{token}/info")
def dead_drop_info(token: str, db: Session = Depends(get_db)):
    """Metadata check without consuming the drop."""
    drop = db.query(DeadDrop).filter(DeadDrop.token == token).first()
    now = datetime.now(UTC)
    if not drop or (drop.used and drop.burn_after_read) or _expired(drop, now):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dead drop unavailable")
    return {
        "kind": drop.kind,
        "requires_password": drop.kind == "text",
        "expires_at": drop.expires_at,
        "burn_after_read": drop.burn_after_read,
    }


def _expired(drop: DeadDrop, now: datetime) -> bool:
    exp = drop.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    return exp < now
