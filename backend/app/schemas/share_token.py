from datetime import datetime

from pydantic import BaseModel, Field


class ShareTokenCreate(BaseModel):
    stego_filename: str = Field(min_length=1, max_length=255)
    label: str | None = Field(default=None, max_length=120)
    access_password: str | None = Field(default=None, max_length=200)
    ttl_hours: int | None = Field(default=None, ge=1, le=8_760)  # up to 1 year
    max_reads: int | None = Field(default=None, ge=1, le=10_000)


class ShareTokenPublic(BaseModel):
    """Owner-facing view of a token, returned by the management endpoints."""

    id: int
    token: str
    share_path: str  # e.g. "/t/<token>"
    label: str | None = None
    protected: bool  # requires an access password to open
    status: str  # active | expired | exhausted | revoked
    read_count: int
    max_reads: int | None = None
    reads_remaining: int | None = None
    expires_at: datetime | None = None
    created_at: datetime


class ShareTokenCreateResponse(BaseModel):
    status: str = "ok"
    token: str
    share_path: str
    protected: bool
    expires_at: datetime | None = None


class RedeemInfo(BaseModel):
    label: str | None = None
    protected: bool
    status: str
    reads_remaining: int | None = None
    expires_at: datetime | None = None


class RedeemRequest(BaseModel):
    # The token's access password, if it was set. The stego password is NOT
    # sent here — that is only used at reveal time.
    access_password: str | None = Field(default=None, max_length=200)


class RedeemResponse(BaseModel):
    status: str = "ok"
    stego_url: str
    filename: str
    label: str | None = None


class RevealRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class RevealResponse(BaseModel):
    status: str = "ok"
    message: str
