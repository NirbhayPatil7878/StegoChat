from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username")
    @classmethod
    def strip_username(cls, v: str) -> str:
        return v.strip()


class LoginRequest(BaseModel):
    # Accepts username OR email in the same field.
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class UserPublic(BaseModel):
    id: int
    username: str
    email: EmailStr
    avatar: str | None = None
    bio: str | None = None
    is_admin: bool
    email_verified: bool = False
    totp_enabled: bool = False
    email_otp_enabled: bool = False
    created_at: datetime
    last_login: datetime | None = None

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user: UserPublic
    tokens: TokenPair


class TwoFactorChallenge(BaseModel):
    """Returned by /login when the account has TOTP 2FA enabled."""

    two_factor_required: bool = True
    challenge_token: str


class OtpEmailChallenge(BaseModel):
    """Returned by /login when email OTP is enabled (code sent to inbox)."""

    otp_email_required: bool = True
    challenge_token: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class TwoFactorEnableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class TwoFactorEnableResponse(BaseModel):
    status: str = "ok"
    recovery_codes: list[str]


class TwoFactorVerifyRequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=20)


class TwoFactorDisableRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)
    new_password: str = Field(min_length=8, max_length=200)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)


class OtpVerifyRequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class OtpEnableRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class OtpDisableRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class SignupVerifyOtpRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TokenIssueResponse(BaseModel):
    """Returned by forgot-password / request-verification.

    ``dev_token`` is only populated when no SMTP server is configured, so the
    flow stays testable in local development. In production it is None and the
    token is delivered by email only.
    """

    status: str = "ok"
    message: str
    dev_token: str | None = None
