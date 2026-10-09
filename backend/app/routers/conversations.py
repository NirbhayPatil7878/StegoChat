"""Direct + group messaging between users, with steganographic image messages."""

# NOTE: intentionally NOT using `from __future__ import annotations` here.
# Stringized annotations break FastAPI's UploadFile/File detection on this
# version, so this router keeps real (evaluated) annotations.
import contextlib
import json
import os
from datetime import UTC, datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from PIL import Image
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.stego import StegoError, embed_message, extract_message
from app.database import get_db
from app.models import (
    ActivityType,
    Conversation,
    ConversationMember,
    DirectMessage,
    MessageKeyEnvelope,
    User,
)
from app.schemas.conversation import (
    ConversationCreate,
    ConversationPublic,
    ConversationUpdate,
    DirectMessagePublic,
    E2EESendInput,
    GroupCreate,
    MarkReadRequest,
    PublicKeyRegistration,
    RevealRequest,
    RevealResponse,
    TextMessageCreate,
    UserBrief,
)
from app.services.activity import log_activity
from app.services.storage import read_image_upload, save_bytes, save_stego, upload_path

router = APIRouter(prefix="/api", tags=["conversations"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _as_utc(dt: datetime | None) -> datetime | None:
    """Ensure a datetime is timezone-aware UTC.

    SQLite returns naive datetimes; without an explicit offset the client
    parses these UTC values as local time, skewing relative timestamps and —
    critically for expiry — the "has this expired?" comparison.
    """
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _message_public(msg: DirectMessage) -> DirectMessagePublic:
    return DirectMessagePublic(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        sender_username=msg.sender.username if msg.sender else "unknown",
        kind=msg.kind,
        is_e2ee=msg.is_e2ee,
        body=msg.body,
        stego_url=f"/api/files/{msg.stego_filename}" if msg.stego_filename else None,
        created_at=_as_utc(msg.created_at),
        expires_at=_as_utc(msg.expires_at),
    )


def _purge_expired(db: Session, messages: list[DirectMessage]) -> list[DirectMessage]:
    """Drop expired messages, deleting their stego files, and return the rest."""
    live: list[DirectMessage] = []
    removed = False
    for m in messages:
        if m.is_expired:
            if m.stego_filename:
                with contextlib.suppress(OSError):
                    upload_path(m.stego_filename).unlink(missing_ok=True)
            db.delete(m)
            removed = True
        else:
            live.append(m)
    if removed:
        db.commit()
    return live


def _conversation_public(db: Session, conv: Conversation, me: User) -> ConversationPublic:
    my_member = next((m for m in conv.members if m.user_id == me.id), None)
    others = [m for m in conv.members if m.user_id != me.id]
    other_user = others[0].user if (not conv.is_group and others) else None

    # Newest still-live message for the list preview (skip expired ones).
    last = next(
        (
            m
            for m in db.query(DirectMessage)
            .options(joinedload(DirectMessage.sender))
            .filter(DirectMessage.conversation_id == conv.id)
            .order_by(DirectMessage.id.desc())
            .limit(20)
            if not m.is_expired
        ),
        None,
    )
    unread = 0
    if my_member is not None:
        unread = (
            db.query(func.count(DirectMessage.id))
            .filter(
                DirectMessage.conversation_id == conv.id,
                DirectMessage.id > my_member.last_read_id,
                DirectMessage.sender_id != me.id,
            )
            .scalar()
            or 0
        )

    return ConversationPublic(
        id=conv.id,
        is_group=conv.is_group,
        name=conv.name
        if conv.is_group
        else (other_user.username if other_user else "Conversation"),
        other_user=UserBrief.model_validate(other_user) if other_user else None,
        members=[UserBrief.model_validate(m.user) for m in conv.members],
        member_count=len(conv.members),
        last_message=_message_public(last) if last else None,
        unread_count=unread,
        is_pinned=my_member.is_pinned if my_member else False,
        is_favorite=my_member.is_favorite if my_member else False,
        other_last_read_id=others[0].last_read_id if (not conv.is_group and others) else 0,
        updated_at=_as_utc(conv.updated_at),
    )


def _get_membership(db: Session, conv_id: int, me: User) -> tuple[Conversation, ConversationMember]:
    member = (
        db.query(ConversationMember)
        .filter(ConversationMember.conversation_id == conv_id, ConversationMember.user_id == me.id)
        .first()
    )
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    conv = (
        db.query(Conversation)
        .options(joinedload(Conversation.members).joinedload(ConversationMember.user))
        .filter(Conversation.id == conv_id)
        .first()
    )
    # A membership row implies its conversation exists (FK cascade).
    assert conv is not None
    return conv, member


# --- Users ---------------------------------------------------------------


@router.get("/users/search", response_model=list[UserBrief])
def search_users(
    q: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(User).filter(User.id != user.id, User.is_active.is_(True))
    if q.strip():
        query = query.filter(User.username.ilike(f"%{q.strip()}%"))
    return [UserBrief.model_validate(u) for u in query.order_by(User.username).limit(20)]


@router.put("/users/e2ee-key")
def register_e2ee_key(payload: PublicKeyRegistration, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Allow a key to be re-created before this account has any encrypted
    # message envelopes. Once history exists, replacing the key would make it
    # impossible to decrypt those messages without a recovery process.
    try:
        from Crypto.PublicKey import RSA

        imported_key = RSA.import_key(payload.public_key)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid public key format") from exc
    if imported_key.has_private() or imported_key.size_in_bits() < 3072:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid public key format")
    updated = (
        db.query(User)
        .filter(
            User.id == user.id,
            (User.e2ee_public_key.is_(None)) | (User.e2ee_public_key == payload.public_key),
        )
        .update({User.e2ee_public_key: payload.public_key}, synchronize_session=False)
    )
    if updated != 1:
        registered_key = db.query(User.e2ee_public_key).filter(User.id == user.id).scalar()
        has_envelope_history = (
            db.query(MessageKeyEnvelope.id)
            .filter(MessageKeyEnvelope.user_id == user.id)
            .first()
            is not None
        )
        if registered_key != payload.public_key and not has_envelope_history:
            updated = (
                db.query(User)
                .filter(User.id == user.id, User.e2ee_public_key == registered_key)
                .update({User.e2ee_public_key: payload.public_key}, synchronize_session=False)
            )
        if updated != 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=(
                    "This account already has encrypted message history; "
                    "key recovery is required before replacing its key"
                ),
            )
    db.commit()
    return {"status": "ok"}


@router.get("/conversations/{conv_id}/e2ee-keys")
def get_conversation_e2ee_keys(conv_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conv, _ = _get_membership(db, conv_id, user)
    if not conv.is_group:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="E2EE is available for group image messages")
    return {
        "keys": [
            {"user_id": m.user_id, "public_key": m.user.e2ee_public_key}
            for m in conv.members
        ]
    }


# --- Conversations -------------------------------------------------------


@router.get("/conversations", response_model=list[ConversationPublic])
def list_conversations(
    q: str = "",
    favorites_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    convs = (
        db.query(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .options(joinedload(Conversation.members).joinedload(ConversationMember.user))
        .filter(ConversationMember.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    out = [_conversation_public(db, c, user) for c in convs]
    if q.strip():
        needle = q.strip().lower()
        out = [c for c in out if needle in c.name.lower()]
    if favorites_only:
        out = [c for c in out if c.is_favorite]
    # Stable sort: pinned first; recency order is preserved within each bucket.
    out.sort(key=lambda c: not c.is_pinned)
    return out


@router.post("/conversations", response_model=ConversationPublic)
def create_dm(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.user_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Cannot start a conversation with yourself"
        )
    other = db.query(User).filter(User.id == payload.user_id, User.is_active.is_(True)).first()
    if other is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Reuse an existing DM between the two users if there is one.
    mine = db.query(ConversationMember.conversation_id).filter(
        ConversationMember.user_id == user.id
    )
    existing = (
        db.query(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .filter(
            Conversation.is_group.is_(False),
            Conversation.id.in_(mine.scalar_subquery()),
            ConversationMember.user_id == other.id,
        )
        .first()
    )
    if existing is None:
        existing = Conversation(is_group=False, created_by=user.id)
        db.add(existing)
        db.flush()
        db.add(ConversationMember(conversation_id=existing.id, user_id=user.id))
        db.add(ConversationMember(conversation_id=existing.id, user_id=other.id))
        db.commit()

    conv, _ = _get_membership(db, existing.id, user)
    return _conversation_public(db, conv, user)


@router.post("/conversations/group", response_model=ConversationPublic)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ids = {i for i in payload.member_ids if i != user.id}
    if not ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Add at least one other member")
    members = db.query(User).filter(User.id.in_(ids), User.is_active.is_(True)).all()
    if len(members) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="One or more users not found")

    conv = Conversation(is_group=True, name=payload.name.strip(), created_by=user.id)
    db.add(conv)
    db.flush()
    db.add(ConversationMember(conversation_id=conv.id, user_id=user.id))
    for m in members:
        db.add(ConversationMember(conversation_id=conv.id, user_id=m.id))
    db.commit()

    conv, _ = _get_membership(db, conv.id, user)
    return _conversation_public(db, conv, user)


@router.patch("/conversations/{conv_id}", response_model=ConversationPublic)
def update_conversation(
    conv_id: int,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv, member = _get_membership(db, conv_id, user)
    if payload.name is not None:
        if not conv.is_group:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Direct messages cannot be renamed"
            )
        conv.name = payload.name.strip()
    if payload.is_pinned is not None:
        member.is_pinned = payload.is_pinned
    if payload.is_favorite is not None:
        member.is_favorite = payload.is_favorite
    db.commit()
    conv, _ = _get_membership(db, conv_id, user)
    return _conversation_public(db, conv, user)


@router.delete("/conversations/{conv_id}")
def delete_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv, member = _get_membership(db, conv_id, user)
    if conv.is_group and conv.created_by != user.id:
        # Members leave; only the creator deletes the group for everyone.
        db.delete(member)
        db.commit()
        return {"status": "ok", "message": "Left the group"}
    db.delete(conv)
    db.commit()
    return {"status": "ok", "message": "Conversation deleted"}


# --- Messages ------------------------------------------------------------


@router.get("/conversations/{conv_id}/messages", response_model=list[DirectMessagePublic])
def list_messages(
    conv_id: int,
    after: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_membership(db, conv_id, user)
    query = (
        db.query(DirectMessage)
        .options(joinedload(DirectMessage.sender))
        .filter(DirectMessage.conversation_id == conv_id)
    )
    if after is not None:
        query = query.filter(DirectMessage.id > after)
    messages = list(query.order_by(DirectMessage.created_at).limit(500))
    return [_message_public(m) for m in _purge_expired(db, messages)]


@router.post("/conversations/{conv_id}/read")
def mark_read(
    conv_id: int,
    payload: MarkReadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _, member = _get_membership(db, conv_id, user)
    if payload.message_id > member.last_read_id:
        member.last_read_id = payload.message_id
        db.commit()
    return {"status": "ok"}


@router.post("/conversations/{conv_id}/messages", response_model=DirectMessagePublic)
def send_text_message(
    conv_id: int,
    payload: TextMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv, member = _get_membership(db, conv_id, user)
    expires_at = (
        datetime.now(UTC) + timedelta(minutes=payload.expire_minutes)
        if payload.expire_minutes
        else None
    )
    msg = DirectMessage(
        conversation_id=conv.id,
        sender_id=user.id,
        kind="text",
        body=payload.body,
        expires_at=expires_at,
    )
    conv.updated_at = datetime.now(UTC)
    db.add(msg)
    db.flush()
    member.last_read_id = max(member.last_read_id, msg.id)  # own messages are read
    db.commit()
    db.refresh(msg)
    return _message_public(msg)


@router.post("/conversations/{conv_id}/stego", response_model=DirectMessagePublic)
@limiter.limit(settings.rate_limit_embed)
async def send_stego_message(
    request: Request,
    conv_id: int,
    message: str = Form(..., max_length=100_000),
    password: str = Form(..., min_length=1),
    image: UploadFile | None = File(default=None),
    sample: str | None = Form(default=None),
    decoy_message: str | None = Form(default=None),
    decoy_password: str | None = Form(default=None),
    expire_minutes: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv, member = _get_membership(db, conv_id, user)

    if image is not None and image.filename:
        cover_bytes = await read_image_upload(image)
    elif sample:
        path = settings.sample_dir / os.path.basename(sample)
        if not path.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Sample image not found")
        cover_bytes = path.read_bytes()
    else:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Provide an image upload or a sample name"
        )

    decoy_msg = (decoy_message or "").strip() or None
    decoy_pw = (decoy_password or "").strip() or None
    if bool(decoy_msg) != bool(decoy_pw):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Decoy message and decoy password must both be set",
        )
    if decoy_pw and decoy_pw == password:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="The decoy password must differ from the real one",
        )
    if expire_minutes is not None and not (1 <= expire_minutes <= 43_200):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid expiry time")

    try:
        stego_png = embed_message(
            cover_bytes,
            message,
            password,
            decoy_message=decoy_msg,
            decoy_password=decoy_pw,
        )
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    stego_name = save_stego(stego_png, prefix="dm")
    expires_at = datetime.now(UTC) + timedelta(minutes=expire_minutes) if expire_minutes else None
    msg = DirectMessage(
        conversation_id=conv.id,
        sender_id=user.id,
        kind="stego",
        stego_filename=stego_name,
        has_decoy=bool(decoy_msg),
        expires_at=expires_at,
    )
    conv.updated_at = datetime.now(UTC)
    db.add(msg)
    db.flush()
    member.last_read_id = max(member.last_read_id, msg.id)
    log_activity(
        db,
        user.id,
        ActivityType.EMBED,
        detail="chat stego message",
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()
    db.refresh(msg)
    return _message_public(msg)


@router.post("/conversations/{conv_id}/e2ee-stego", response_model=DirectMessagePublic)
@limiter.limit(settings.rate_limit_embed)
async def send_e2ee_stego(
    request: Request,
    conv_id: int,
    envelopes: str = Form(...),
    expire_minutes: int | None = Form(default=None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv, member = _get_membership(db, conv_id, user)
    if not conv.is_group:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="E2EE image messages require a group")
    try:
        parsed = E2EESendInput.model_validate({"envelopes": json.loads(envelopes), "expire_minutes": expire_minutes})
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid recipient envelopes") from exc
    current = {m.user_id: m.user for m in conv.members}
    supplied = [e.user_id for e in parsed.envelopes]
    if len(supplied) != len(set(supplied)) or set(supplied) != set(current):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Envelopes must match current group membership")
    if any(not current[i].e2ee_public_key for i in supplied):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Every group member must register an encryption key")
    image_bytes = await read_image_upload(image)
    # Verify this is a valid decodable image without changing its client-generated pixels.
    try:
        Image.open(BytesIO(image_bytes)).verify()
    except Exception as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Invalid image") from exc
    filename = save_bytes(image_bytes, prefix="e2ee", ext=".png")
    msg = DirectMessage(conversation_id=conv.id, sender_id=user.id, kind="stego", stego_filename=filename,
                        has_decoy=False, is_e2ee=True,
                        expires_at=datetime.now(UTC) + timedelta(minutes=parsed.expire_minutes) if parsed.expire_minutes else None)
    db.add(msg)
    db.flush()
    for item in parsed.envelopes:
        db.add(MessageKeyEnvelope(message_id=msg.id, user_id=item.user_id, envelope=item.envelope))
    conv.updated_at = datetime.now(UTC)
    member.last_read_id = max(member.last_read_id, msg.id)
    log_activity(db, user.id, ActivityType.EMBED, detail="chat e2ee image", ip_address=_client_ip(request), commit=False)
    db.commit()
    db.refresh(msg)
    return _message_public(msg)


@router.get("/messages/{message_id}/e2ee-envelope")
def get_e2ee_envelope(message_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    msg = db.query(DirectMessage).filter(DirectMessage.id == message_id, DirectMessage.is_e2ee.is_(True)).first()
    if msg is None or msg.kind != "stego":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Message not found")
    _get_membership(db, msg.conversation_id, user)
    if msg.is_expired:
        _purge_expired(db, [msg])
        raise HTTPException(status.HTTP_410_GONE, detail="This message has expired")
    entry = db.query(MessageKeyEnvelope).filter_by(message_id=msg.id, user_id=user.id).first()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No key envelope for this account")
    return {"envelope": entry.envelope, "stego_url": f"/api/files/{msg.stego_filename}"}


@router.post("/messages/{message_id}/reveal", response_model=RevealResponse)
def reveal_message(
    message_id: int,
    payload: RevealRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    msg = db.query(DirectMessage).filter(DirectMessage.id == message_id).first()
    if msg is None or msg.kind != "stego" or not msg.stego_filename:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Message not found")
    _get_membership(db, msg.conversation_id, user)

    if msg.is_expired:
        _purge_expired(db, [msg])
        raise HTTPException(status.HTTP_410_GONE, detail="This message has expired")

    path = upload_path(msg.stego_filename)
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, detail="Stego image no longer available")

    try:
        text = extract_message(path.read_bytes(), payload.password)
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    log_activity(
        db,
        user.id,
        ActivityType.EXTRACT,
        detail="chat stego reveal",
        ip_address=_client_ip(request),
    )
    return RevealResponse(message=text)
