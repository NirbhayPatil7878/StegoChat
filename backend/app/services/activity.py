"""Audit-log helper."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import ActivityLog, ActivityType


def log_activity(
    db: Session,
    user_id: int,
    action: ActivityType | str,
    detail: str | None = None,
    ip_address: str | None = None,
    *,
    commit: bool = True,
) -> ActivityLog:
    entry = ActivityLog(
        user_id=user_id,
        action=action.value if isinstance(action, ActivityType) else str(action),
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry
