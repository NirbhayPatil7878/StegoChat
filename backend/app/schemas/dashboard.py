from datetime import datetime

from pydantic import BaseModel


class ActivityPublic(BaseModel):
    id: int
    action: str
    detail: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    total_embeds: int
    total_extracts: int
    total_chats: int
    total_messages: int
    active_share_tokens: int
    storage_bytes: int
    storage_files: int
    security_score: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    recent_activity: list[ActivityPublic]
    embeds_over_time: list[dict]
