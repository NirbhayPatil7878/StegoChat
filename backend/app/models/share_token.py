from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ShareToken(Base):
    """A short, unguessable token that lets anyone fetch a stego image.

    Created from the Studio after an embed. The token is the capability:
    knowing it (plus an optional access password) grants the carrier image,
    and the hidden message is still protected by its own stego password.
    Tokens can expire on a timer and/or after a fixed number of reads.
    """

    __tablename__ = "share_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String(48), unique=True, index=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    stego_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Optional password gating access to the image itself (separate from the
    # stego password that reveals the hidden message).
    access_password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    max_reads: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = unlimited
    read_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        exp = self.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        return exp <= datetime.now(UTC)

    @property
    def is_exhausted(self) -> bool:
        return self.max_reads is not None and self.read_count >= self.max_reads

    @property
    def status(self) -> str:
        if self.revoked:
            return "revoked"
        if self.is_expired:
            return "expired"
        if self.is_exhausted:
            return "exhausted"
        return "active"

    @property
    def reads_remaining(self) -> int | None:
        if self.max_reads is None:
            return None
        return max(0, self.max_reads - self.read_count)
