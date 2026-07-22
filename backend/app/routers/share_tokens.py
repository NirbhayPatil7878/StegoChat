"""Share tokens: fetch a stego image by an unguessable token.

An owner mints a token for a stego image they produced; anyone holding the
token (and the optional access password) can fetch the carrier image, and can
reveal the hidden message with its stego password. Tokens may expire on a timer
and/or after a fixed number of reads, and can be revoked.
"""

import os
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.core.stego import StegoError, extract_message
from app.database import get_db
from app.models import ActivityType, Chat, Message, ShareToken, User
from app.schemas.share_token import (
    RedeemInfo,
    RedeemRequest,
    RedeemResponse,
    RevealRequest,
    RevealResponse,
    ShareTokenCreate,
    ShareTokenCreateResponse,
    ShareTokenPublic,
)
from app.services.activity import log_activity
from app.services.storage import upload_path

router = APIRouter(prefix="/api/tokens", tags=["tokens"])


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _public(t: ShareToken) -> ShareTokenPublic:
    return ShareTokenPublic(
        id=t.id,
        token=t.token,
        share_path=f"/t/{t.token}",
        label=t.label,
        protected=t.access_password_hash is not None,
        status=t.status,
        read_count=t.read_count,
        max_reads=t.max_reads,
        reads_remaining=t.reads_remaining,
        expires_at=_utc(t.expires_at),
        created_at=_utc(t.created_at),
    )


def _owns_stego(db: Session, user: User, stego_filename: str) -> bool:
    """The user may tokenize a stego file only if their own embed produced it."""
    return (
        db.query(Message.id)
        .join(Chat, Chat.id == Message.chat_id)
        .filter(Chat.owner_id == user.id, Message.stego_filename == stego_filename)
        .first()
        is not None
    )


# --- Owner endpoints ---------------------------------------------------------


@router.post("", response_model=ShareTokenCreateResponse, status_code=status.HTTP_201_CREATED)
def create_token(
    payload: ShareTokenCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    filename = os.path.basename(payload.stego_filename)
    if not _owns_stego(db, user, filename) or not upload_path(filename).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stego image not found")

    expires_at = (
        datetime.now(UTC) + timedelta(hours=payload.ttl_hours) if payload.ttl_hours else None
    )
    access_pw = (payload.access_password or "").strip() or None
    token = ShareToken(
        token=secrets.token_urlsafe(12),
        owner_id=user.id,
        stego_filename=filename,
        label=(payload.label or "").strip() or None,
        access_password_hash=hash_password(access_pw) if access_pw else None,
        max_reads=payload.max_reads,
        expires_at=expires_at,
    )
    db.add(token)
    log_activity(db, user.id, ActivityType.SHARE_CREATE, detail="share token", commit=False)
    db.commit()
    db.refresh(token)
    return ShareTokenCreateResponse(
        token=token.token,
        share_path=f"/t/{token.token}",
        protected=token.access_password_hash is not None,
        expires_at=_utc(token.expires_at),
    )


@router.get("", response_model=list[ShareTokenPublic])
def list_tokens(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tokens = (
        db.query(ShareToken)
        .filter(ShareToken.owner_id == user.id)
        .order_by(ShareToken.id.desc())
        .all()
    )
    return [_public(t) for t in tokens]


@router.delete("/{token_id}")
def revoke_token(
    token_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    token = (
        db.query(ShareToken)
        .filter(ShareToken.id == token_id, ShareToken.owner_id == user.id)
        .first()
    )
    if token is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Token not found")
    token.revoked = True
    db.commit()
    return {"status": "ok", "message": "Token revoked"}


# --- Public redeem endpoints -------------------------------------------------


def _load_live(db: Session, token: str) -> ShareToken:
    t = db.query(ShareToken).filter(ShareToken.token == token).first()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Link not found")
    if t.status != "active":
        raise HTTPException(status.HTTP_410_GONE, detail=f"This link is {t.status}")
    return t


@router.get("/redeem/{token}", response_model=RedeemInfo)
def redeem_info(token: str, db: Session = Depends(get_db)):
    """Metadata for the redeem page — does not consume a read."""
    t = _load_live(db, token)
    return RedeemInfo(
        label=t.label,
        protected=t.access_password_hash is not None,
        status=t.status,
        reads_remaining=t.reads_remaining,
        expires_at=_utc(t.expires_at),
    )


@router.post("/redeem/{token}", response_model=RedeemResponse)
def redeem(token: str, payload: RedeemRequest, db: Session = Depends(get_db)):
    """Consume one read and return the carrier image URL."""
    t = _load_live(db, token)
    if t.access_password_hash is not None:
        supplied = (payload.access_password or "").strip()
        if not supplied or not verify_password(supplied, t.access_password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Wrong access password")

    if not upload_path(t.stego_filename).exists():
        raise HTTPException(status.HTTP_410_GONE, detail="The image is no longer available")

    t.read_count += 1
    db.commit()
    return RedeemResponse(
        stego_url=f"/api/files/{t.stego_filename}",
        filename=t.stego_filename,
        label=t.label,
    )


@router.post("/redeem/{token}/reveal", response_model=RevealResponse)
def reveal(token: str, payload: RevealRequest, db: Session = Depends(get_db)):
    """Extract the hidden message from the carrier using its stego password.

    Does not consume a read; it operates on an already-redeemed image.
    """
    t = db.query(ShareToken).filter(ShareToken.token == token).first()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Link not found")
    # Allow reveal on exhausted tokens (the image was already fetched) but not
    # on revoked ones.
    if t.revoked:
        raise HTTPException(status.HTTP_410_GONE, detail="This link is revoked")

    path = upload_path(t.stego_filename)
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, detail="The image is no longer available")

    try:
        message = extract_message(path.read_bytes(), payload.password)
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return RevealResponse(message=message)
