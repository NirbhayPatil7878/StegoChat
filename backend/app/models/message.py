from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.chat import Chat


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Message(Base):
    """A steganography record: one embed or extract event tied to a chat.

    ``encrypted_message`` stores the AES-256 ciphertext of the hidden text so
    that history is never persisted in plaintext. The originating password is
    never stored server-side.
    """

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), index=True)

    kind: Mapped[str] = mapped_column(
        String(16), default="embed", nullable=False
    )  # embed | extract
    encrypted_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview: Mapped[str | None] = mapped_column(String(140), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stego_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_decoy: Mapped[bool] = mapped_column(default=False, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )

    chat: Mapped["Chat"] = relationship(back_populates="messages")
