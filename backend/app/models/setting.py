from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )

    theme: Mapped[str] = mapped_column(
        String(16), default="dark", nullable=False
    )  # dark | light | system
    accent: Mapped[str] = mapped_column(String(16), default="violet", nullable=False)
    animations_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    auto_delete_messages: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_encryption: Mapped[str] = mapped_column(String(24), default="AES-256", nullable=False)
    stego_method: Mapped[str] = mapped_column(String(16), default="lsb", nullable=False)

    user: Mapped["User"] = relationship(back_populates="settings")
