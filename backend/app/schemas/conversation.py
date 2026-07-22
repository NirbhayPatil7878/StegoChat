from datetime import datetime

from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    id: int
    username: str
    avatar: str | None = None

    model_config = {"from_attributes": True}


class ConversationCreate(BaseModel):
    user_id: int


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    member_ids: list[int] = Field(..., min_length=1, max_length=50)


class ConversationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    is_pinned: bool | None = None
    is_favorite: bool | None = None


class DirectMessagePublic(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_username: str
    kind: str
    body: str | None = None
    stego_url: str | None = None
    created_at: datetime
    # Present only for self-destructing messages; drives the client countdown.
    # A decoy, if any, is intentionally NOT surfaced here.
    expires_at: datetime | None = None


class ConversationPublic(BaseModel):
    id: int
    is_group: bool
    name: str  # group name, or the other participant's username for DMs
    other_user: UserBrief | None = None  # DMs only
    members: list[UserBrief] = []
    member_count: int
    last_message: DirectMessagePublic | None = None
    unread_count: int = 0
    is_pinned: bool = False
    is_favorite: bool = False
    other_last_read_id: int = 0  # DMs: the peer's read cursor, for ✓✓ status
    updated_at: datetime


class MarkReadRequest(BaseModel):
    message_id: int


class TextMessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10_000)
    # Optional self-destruct timer in minutes (max 30 days). None = never.
    expire_minutes: int | None = Field(default=None, ge=1, le=43_200)


class RevealRequest(BaseModel):
    password: str = Field(..., min_length=1)


class RevealResponse(BaseModel):
    message: str
