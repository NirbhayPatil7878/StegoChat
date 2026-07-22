"""Chat & message history: list, search, detail, delete, organise."""

import contextlib

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import ActivityType, Chat, Message, User
from app.schemas.chat import (
    ChatCreate,
    ChatDetail,
    ChatPublic,
    ChatUpdate,
    MessagePublic,
)
from app.services.activity import log_activity
from app.services.storage import upload_path

router = APIRouter(prefix="/api", tags=["history"])


def _to_public(db: Session, chat: Chat) -> ChatPublic:
    count = db.query(func.count(Message.id)).filter(Message.chat_id == chat.id).scalar() or 0
    last = (
        db.query(Message.preview)
        .filter(Message.chat_id == chat.id)
        .order_by(Message.created_at.desc())
        .first()
    )
    pub = ChatPublic.model_validate(chat)
    pub.message_count = count
    pub.last_preview = last[0] if last else None
    return pub


@router.get("/history", response_model=list[ChatPublic])
def list_history(
    q: str | None = Query(default=None, description="Search chats by title/message preview"),
    folder: str | None = Query(default=None),
    favorites_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Chat).filter(Chat.owner_id == user.id)
    if favorites_only:
        query = query.filter(Chat.is_favorite.is_(True))
    if folder:
        query = query.filter(Chat.folder == folder)
    if q:
        like = f"%{q}%"
        matching_chat_ids = (
            db.query(Message.chat_id).filter(Message.preview.ilike(like)).scalar_subquery()
        )
        query = query.filter((Chat.title.ilike(like)) | (Chat.id.in_(matching_chat_ids)))

    chats = (
        query.order_by(Chat.is_pinned.desc(), Chat.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_to_public(db, c) for c in chats]


@router.post("/history", response_model=ChatPublic, status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: ChatCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = Chat(owner_id=user.id, title=payload.title, folder=payload.folder)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _to_public(db, chat)


@router.get("/history/{chat_id}", response_model=ChatDetail)
def get_chat(chat_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    chat = _owned_chat(db, user, chat_id)
    detail = ChatDetail.model_validate(chat)
    detail.messages = [MessagePublic.model_validate(m) for m in chat.messages]
    detail.message_count = len(chat.messages)
    detail.last_preview = chat.messages[-1].preview if chat.messages else None
    return detail


@router.patch("/history/{chat_id}", response_model=ChatPublic)
def update_chat(
    chat_id: int,
    payload: ChatUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = _owned_chat(db, user, chat_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(chat, key, value)
    db.commit()
    db.refresh(chat)
    return _to_public(db, chat)


@router.delete("/history/{chat_id}", status_code=status.HTTP_200_OK)
def delete_chat(
    chat_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    chat = _owned_chat(db, user, chat_id)
    # Best-effort cleanup of stego files on disk.
    for msg in chat.messages:
        if msg.stego_filename:
            path = upload_path(msg.stego_filename)
            if path.exists():
                with contextlib.suppress(OSError):
                    path.unlink()
    db.delete(chat)
    log_activity(db, user.id, ActivityType.DELETE, detail=f"chat:{chat_id}", commit=False)
    db.commit()
    return {"status": "ok", "message": "Conversation deleted"}


@router.delete("/history", status_code=status.HTTP_200_OK)
def clear_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    chats = db.query(Chat).filter(Chat.owner_id == user.id).all()
    for chat in chats:
        db.delete(chat)
    log_activity(db, user.id, ActivityType.DELETE, detail="all_history", commit=False)
    db.commit()
    return {"status": "ok", "message": f"Deleted {len(chats)} conversations"}


def _owned_chat(db: Session, user: User, chat_id: int) -> Chat:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.owner_id == user.id).first()
    if chat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return chat
