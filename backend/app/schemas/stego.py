from datetime import datetime

from pydantic import BaseModel, Field


class EmbedResponse(BaseModel):
    status: str = "ok"
    stego_url: str
    stego_filename: str
    message_id: int | None = None
    chat_id: int | None = None
    decoy_enabled: bool = False


class ExtractResponse(BaseModel):
    status: str = "ok"
    kind: str = "text"
    message: str | None = None
    filename: str | None = None
    mime: str | None = None
    payload_url: str | None = None


class SplitPart(BaseModel):
    index: int
    stego_url: str
    stego_filename: str


class SplitEmbedResponse(BaseModel):
    status: str = "ok"
    total: int
    parts: list[SplitPart]


class RiskScanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)


class RiskScanResponse(BaseModel):
    level: str
    findings: list[str]
    should_hide: bool


class ForensicResponse(BaseModel):
    level: str
    malformed: bool
    reasons: list[str]
    entropy: float
    lsb_anomaly_score: float
    lsb_density: float
    size_bytes: int
    image: dict


class DeadDropCreate(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    password: str = Field(min_length=1, max_length=200)
    ttl_hours: int = Field(default=24, ge=1, le=168)
    burn_after_read: bool = True


class DeadDropCreateResponse(BaseModel):
    status: str = "ok"
    token: str
    expires_at: datetime


class DeadDropReadRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class DeadDropReadResponse(BaseModel):
    status: str = "ok"
    kind: str
    message: str | None = None
    stego_url: str | None = None
    created_at: datetime
    expires_at: datetime
