"""Dashboard aggregates and statistics."""

import os
from collections import Counter
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import ActivityLog, Chat, Message, ShareToken, User
from app.schemas.dashboard import (
    ActivityPublic,
    DashboardResponse,
    DashboardStats,
)

router = APIRouter(prefix="/api", tags=["dashboard"])


def _chat_ids(db: Session, user_id: int):
    return db.query(Chat.id).filter(Chat.owner_id == user_id).scalar_subquery()


def _compute_stats(db: Session, user: User) -> DashboardStats:
    chat_ids = _chat_ids(db, user.id)
    base = db.query(func.count(Message.id)).filter(Message.chat_id.in_(chat_ids))
    total_embeds = base.filter(Message.kind == "embed").scalar() or 0
    total_extracts = base.filter(Message.kind == "extract").scalar() or 0
    total_chats = db.query(func.count(Chat.id)).filter(Chat.owner_id == user.id).scalar() or 0
    total_messages = (
        db.query(func.count(Message.id)).filter(Message.chat_id.in_(chat_ids)).scalar() or 0
    )
    now = datetime.now(UTC)
    # Active share tokens: not revoked, not past their expiry, not read-exhausted.
    active_tokens = 0
    for t in db.query(ShareToken).filter(
        ShareToken.owner_id == user.id, ShareToken.revoked.is_(False)
    ):
        exp = (
            t.expires_at.replace(tzinfo=UTC)
            if (t.expires_at and t.expires_at.tzinfo is None)
            else t.expires_at
        )
        if exp is not None and exp <= now:
            continue
        if t.max_reads is not None and t.read_count >= t.max_reads:
            continue
        active_tokens += 1

    storage_bytes = 0
    storage_files = 0
    if settings.upload_dir.exists():
        for f in os.scandir(settings.upload_dir):
            if f.is_file():
                storage_files += 1
                storage_bytes += f.stat().st_size

    return DashboardStats(
        total_embeds=total_embeds,
        total_extracts=total_extracts,
        total_chats=total_chats,
        total_messages=total_messages,
        active_share_tokens=active_tokens,
        storage_bytes=storage_bytes,
        storage_files=storage_files,
        security_score=_security_score(user, total_embeds),
    )


def _security_score(user: User, total_embeds: int) -> int:
    """Simple 0–100 heuristic surfaced in the UI as a 'security posture'."""
    score = 55
    if user.settings and user.settings.auto_delete_messages:
        score += 15
    if user.settings and user.settings.default_encryption == "AES-256":
        score += 15
    if total_embeds > 0:
        score += 10
    if user.email and "@" in user.email:
        score += 5
    return min(score, 100)


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stats = _compute_stats(db, user)
    recent = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(12)
        .all()
    )

    # Embeds per day for the last 7 days (for the dashboard chart).
    chat_ids = _chat_ids(db, user.id)
    since = datetime.now(UTC) - timedelta(days=6)
    rows = (
        db.query(Message.created_at)
        .filter(Message.chat_id.in_(chat_ids), Message.kind == "embed", Message.created_at >= since)
        .all()
    )
    counter = Counter(r[0].date().isoformat() for r in rows)
    series = []
    for i in range(7):
        day = (since + timedelta(days=i)).date().isoformat()
        series.append({"date": day, "count": counter.get(day, 0)})

    return DashboardResponse(
        stats=stats,
        recent_activity=[ActivityPublic.model_validate(a) for a in recent],
        embeds_over_time=series,
    )


@router.get("/stats", response_model=DashboardStats)
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _compute_stats(db, user)
