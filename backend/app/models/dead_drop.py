from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class DeadDrop(Base):
    """Self-destructing, one-time-read encrypted payload reachable by token.

    Supports both plain encrypted text drops and stego-file drops. A drop is
    consumed on first successful read and auto-expires after its TTL.
    """

    __tablename__ = "dead_drops"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    kind: Mapped[str] = mapped_column(
        String(16), default="text", nullable=False
    )  # text | stego_file
    encrypted_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    stego_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preview: Mapped[str | None] = mapped_column(String(140), nullable=True)

    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    burn_after_read: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
