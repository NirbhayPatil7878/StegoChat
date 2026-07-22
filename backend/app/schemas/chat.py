from datetime import datetime

from pydantic import BaseModel, Field


class MessagePublic(BaseModel):
    id: int
    chat_id: int
    kind: str
    preview: str | None = None
    original_filename: str | None = None
    stego_filename: str | None = None
    has_decoy: bool
    size_bytes: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatCreate(BaseModel):
    title: str = Field(default="New conversation", max_length=120)
    folder: str | None = Field(default=None, max_length=80)


class ChatUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    is_pinned: bool | None = None
    is_favorite: bool | None = None
    folder: str | None = Field(default=None, max_length=80)


class ChatPublic(BaseModel):
    id: int
    title: str
    is_pinned: bool
    is_favorite: bool
    folder: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_preview: str | None = None

    model_config = {"from_attributes": True}


class ChatDetail(ChatPublic):
    messages: list[MessagePublic] = []
