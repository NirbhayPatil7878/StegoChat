"""Authentication: register, login, refresh (with rotation), logout,
password reset, email verification, and email OTP second factor."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.core.pwned import guard_password
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.core.totp import (
    consume_recovery_code,
    create_challenge_token,
    decode_challenge_token,
    generate_recovery_codes,
    generate_secret,
    provisioning_uri,
    verify_code,
)
from app.database import get_db
from app.models import ActivityType, RefreshToken, Setting, User
from app.models.token import OneTimeToken
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    OtpDisableRequest,
    OtpEmailChallenge,
    OtpEnableRequest,
    OtpVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SignupVerifyOtpRequest,
    TokenIssueResponse,
    TokenPair,
    TwoFactorChallenge,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorEnableResponse,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
    UserPublic,
    VerifyEmailRequest,
)
from app.services.activity import log_activity
from app.services.mail import send_mail, send_otp_email, send_reset_email, send_verification_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

# --- Signup email verification OTP constants ---
_SIGNUP_OTP_PURPOSE = "signup_verify"
_SIGNUP_OTP_TTL_MINUTES = 15


def _send_signup_otp(db: Session, user: User) -> None:
    """Generate a 6-digit OTP and email it for signup email verification."""
    db.query(OneTimeToken).filter(
        OneTimeToken.user_id == user.id,
        OneTimeToken.purpose == _SIGNUP_OTP_PURPOSE,
        OneTimeToken.used.is_(False),
    ).update({"used": True})
    code = f"{secrets.randbelow(10 ** 6):06d}"
    db.add(
        OneTimeToken(
            user_id=user.id,
            purpose=_SIGNUP_OTP_PURPOSE,
            token_hash=_hash_otp(code),
            expires_at=datetime.now(UTC) + timedelta(minutes=_SIGNUP_OTP_TTL_MINUTES),
        )
    )
    send_otp_email(user.email, code, _SIGNUP_OTP_TTL_MINUTES)


def _issue_tokens(db: Session, user: User) -> TokenPair:
    access = create_access_token(user.id, extra={"username": user.username})
    raw_refresh, token_hash, expires_at = create_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    return TokenPair(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_auth)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    exists = (
        db.query(User)
        .filter(or_(User.username == payload.username, User.email == payload.email))
        .first()
    )
    if exists:
        field = "username" if exists.username == payload.username else "email"
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"That {field} is already taken")

    guard_password(payload.password)

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    user.settings = Setting()
    db.add(user)
    db.flush()

    tokens = _issue_tokens(db, user)
    user.last_login = datetime.now(UTC)
    log_activity(db, user.id, ActivityType.REGISTER, ip_address=_client_ip(request), commit=False)
    _send_signup_otp(db, user)
    db.commit()
    db.refresh(user)
    return AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)


@router.post("/signup-verify-otp", status_code=status.HTTP_200_OK)
@limiter.limit(settings.rate_limit_auth)
def signup_verify_otp(
    payload: SignupVerifyOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verify email address with the OTP sent during registration."""
    if user.email_verified:
        tokens = _issue_tokens(db, user)
        db.commit()
        db.refresh(user)
        return {"status": "ok", "already_verified": True, "user": UserPublic.model_validate(user), "tokens": tokens}

    record = (
        db.query(OneTimeToken)
        .filter(
            OneTimeToken.user_id == user.id,
            OneTimeToken.purpose == _SIGNUP_OTP_PURPOSE,
            OneTimeToken.used.is_(False),
        )
        .order_by(OneTimeToken.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="No verification code found — click Resend to get a new one",
        )

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Code has expired — click Resend")

    if record.token_hash != _hash_otp(payload.code.strip()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect code")

    record.used = True
    user.email_verified = True
    tokens = _issue_tokens(db, user)
    log_activity(
        db, user.id, ActivityType.SETTINGS_UPDATE, detail="email:verified",
        ip_address=_client_ip(request), commit=False,
    )
    db.commit()
    db.refresh(user)
    return {
        "status": "ok",
        "already_verified": False,
        "user": UserPublic.model_validate(user),
        "tokens": tokens,
    }


@router.post("/signup-resend-otp", status_code=status.HTTP_200_OK)
@limiter.limit(settings.rate_limit_auth)
def signup_resend_otp(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resend the signup verification OTP."""
    if user.email_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email is already verified")
    _send_signup_otp(db, user)
    db.commit()
    return {"status": "ok", "message": "A new verification code has been sent to your email"}


@router.post("/login", response_model=AuthResponse | TwoFactorChallenge | OtpEmailChallenge)
@limiter.limit(settings.rate_limit_auth)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ident = payload.identifier.strip()
    user = db.query(User).filter(or_(User.username == ident, User.email == ident.lower())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    # TOTP takes priority; require authenticator-app code via /2fa/verify.
    if user.totp_enabled:
        return TwoFactorChallenge(challenge_token=create_challenge_token(user.id))

    # Email OTP: generate a 6-digit code, email it, return a challenge token.
    if user.email_otp_enabled:
        return _send_email_otp(db, user)

    tokens = _issue_tokens(db, user)
    user.last_login = datetime.now(UTC)
    log_activity(db, user.id, ActivityType.LOGIN, ip_address=_client_ip(request), commit=False)
    db.commit()
    db.refresh(user)
    return AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)


# --- Two-factor authentication (TOTP) ----------------------------------------


@router.post("/2fa/verify", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_auth)
def two_factor_verify(
    payload: TwoFactorVerifyRequest, request: Request, db: Session = Depends(get_db)
):
    """Exchange a login challenge + TOTP (or recovery) code for real tokens."""
    try:
        user_id = decode_challenge_token(payload.challenge_token)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired challenge"
        ) from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active or not user.totp_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge")

    code = payload.code.strip()
    if verify_code(user.totp_secret or "", code):
        pass
    else:
        updated = consume_recovery_code(user.totp_recovery_codes, code)
        if updated is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication code")
        user.totp_recovery_codes = updated  # burn the used recovery code

    tokens = _issue_tokens(db, user)
    user.last_login = datetime.now(UTC)
    log_activity(db, user.id, ActivityType.LOGIN, ip_address=_client_ip(request), commit=False)
    db.commit()
    db.refresh(user)
    return AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def two_factor_setup(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Begin enrollment: issue a pending secret + otpauth URI (QR)."""
    if user.totp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Two-factor is already enabled")
    secret = generate_secret()
    user.totp_secret = secret  # pending until confirmed by /2fa/enable
    db.commit()
    return TwoFactorSetupResponse(secret=secret, otpauth_uri=provisioning_uri(secret, user.email))


@router.post("/2fa/enable", response_model=TwoFactorEnableResponse)
def two_factor_enable(
    payload: TwoFactorEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Confirm enrollment with a code; enable 2FA and return recovery codes."""
    if user.totp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Two-factor is already enabled")
    if not user.totp_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Start setup first")
    if not verify_code(user.totp_secret, payload.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication code")

    plaintext_codes, hashed = generate_recovery_codes()
    user.totp_enabled = True
    user.totp_recovery_codes = hashed
    log_activity(
        db,
        user.id,
        ActivityType.SETTINGS_UPDATE,
        detail="2fa:enabled",
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()
    return TwoFactorEnableResponse(recovery_codes=plaintext_codes)


@router.post("/2fa/disable", status_code=status.HTTP_200_OK)
def two_factor_disable(
    payload: TwoFactorDisableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Disable 2FA (requires the account password)."""
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Password is incorrect")
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_recovery_codes = None
    log_activity(
        db,
        user.id,
        ActivityType.SETTINGS_UPDATE,
        detail="2fa:disabled",
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()
    return {"status": "ok", "message": "Two-factor authentication disabled"}


# --- Email OTP login (second factor sent to inbox) --------------------------

_OTP_PURPOSE = "otp_login"
_OTP_TTL_MINUTES = 10


def _hash_otp(code: str) -> str:
    """SHA-256 hash of a 6-digit OTP code (stored; plaintext is never persisted)."""
    return hashlib.sha256(code.encode()).hexdigest()


def _send_email_otp(db: Session, user: User) -> OtpEmailChallenge:
    """Generate a 6-digit code, invalidate previous ones, email it, return challenge."""
    # Invalidate any pending OTP codes for this user.
    db.query(OneTimeToken).filter(
        OneTimeToken.user_id == user.id,
        OneTimeToken.purpose == _OTP_PURPOSE,
        OneTimeToken.used.is_(False),
    ).update({"used": True})

    code = f"{secrets.randbelow(10 ** 6):06d}"
    db.add(
        OneTimeToken(
            user_id=user.id,
            purpose=_OTP_PURPOSE,
            token_hash=_hash_otp(code),
            expires_at=datetime.now(UTC) + timedelta(minutes=_OTP_TTL_MINUTES),
        )
    )
    db.commit()

    send_otp_email(user.email, code, _OTP_TTL_MINUTES)
    return OtpEmailChallenge(challenge_token=create_challenge_token(user.id))


@router.post("/otp/verify", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_auth)
def otp_verify(payload: OtpVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a login challenge + emailed OTP code for real tokens."""
    try:
        user_id = decode_challenge_token(payload.challenge_token)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired challenge"
        ) from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active or not user.email_otp_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge")

    record = (
        db.query(OneTimeToken)
        .filter(
            OneTimeToken.user_id == user_id,
            OneTimeToken.purpose == _OTP_PURPOSE,
            OneTimeToken.used.is_(False),
        )
        .order_by(OneTimeToken.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="No OTP issued — request a new login")

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="OTP has expired")

    if record.token_hash != _hash_otp(payload.code.strip()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP code")

    record.used = True
    tokens = _issue_tokens(db, user)
    user.last_login = datetime.now(UTC)
    log_activity(db, user.id, ActivityType.LOGIN, ip_address=_client_ip(request), commit=False)
    db.commit()
    db.refresh(user)
    return AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)


@router.post("/otp/enable", status_code=status.HTTP_200_OK)
def otp_enable(
    payload: OtpEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Enable email OTP as a second login factor (requires verified email + password)."""
    if not user.email_verified:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Email must be verified before enabling OTP login",
        )
    if user.email_otp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email OTP is already enabled")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Password is incorrect")

    user.email_otp_enabled = True
    log_activity(
        db,
        user.id,
        ActivityType.SETTINGS_UPDATE,
        detail="otp:enabled",
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()
    return {"status": "ok", "message": "Email OTP login enabled"}


@router.post("/otp/disable", status_code=status.HTTP_200_OK)
def otp_disable(
    payload: OtpDisableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Disable email OTP second factor (requires password)."""
    if not user.email_otp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email OTP is not enabled")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Password is incorrect")

    user.email_otp_enabled = False
    # Invalidate any pending OTP codes.
    db.query(OneTimeToken).filter(
        OneTimeToken.user_id == user.id,
        OneTimeToken.purpose == _OTP_PURPOSE,
        OneTimeToken.used.is_(False),
    ).update({"used": True})
    log_activity(
        db,
        user.id,
        ActivityType.SETTINGS_UPDATE,
        detail="otp:disabled",
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()
    return {"status": "ok", "message": "Email OTP login disabled"}


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(settings.rate_limit_default)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    token_hash = hash_token(payload.refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    if not record or record.revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    expires_at = record.expires_at
    if expires_at.tzinfo is None:  # SQLite returns naive datetimes
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Rotation: revoke the used token and issue a fresh pair.
    record.revoked = True
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    tokens = _issue_tokens(db, user)
    db.commit()
    return tokens


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    payload: RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    token_hash = hash_token(payload.refresh_token)
    record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == token_hash, RefreshToken.user_id == user.id)
        .first()
    )
    if record:
        record.revoked = True
    log_activity(db, user.id, ActivityType.LOGOUT, ip_address=_client_ip(request), commit=False)
    db.commit()
    return {"status": "ok", "message": "Logged out"}


# --- Password reset & email verification -------------------------------------


def _issue_one_time_token(db: Session, user: User, purpose: str, minutes: int = 30) -> str:
    # Invalidate previous tokens for the same purpose.
    db.query(OneTimeToken).filter(
        OneTimeToken.user_id == user.id,
        OneTimeToken.purpose == purpose,
        OneTimeToken.used.is_(False),
    ).update({"used": True})
    raw = secrets.token_urlsafe(32)
    db.add(
        OneTimeToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC) + timedelta(minutes=minutes),
        )
    )
    return raw


def _consume_one_time_token(db: Session, raw: str, purpose: str) -> User:
    record = (
        db.query(OneTimeToken)
        .filter(OneTimeToken.token_hash == hash_token(raw), OneTimeToken.purpose == purpose)
        .first()
    )
    if not record or record.used:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    expires_at = record.expires_at
    if expires_at.tzinfo is None:  # SQLite returns naive datetimes
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    record.used = True
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    return user


@router.post("/forgot-password", response_model=TokenIssueResponse)
@limiter.limit(settings.rate_limit_auth)
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    dev_token = None
    if user and user.is_active:
        raw = _issue_one_time_token(db, user, "reset")
        db.commit()
        sent = send_reset_email(
            user.email,
            f"{settings.frontend_url}/reset-password?token={raw}",
        )
        if not sent:
            dev_token = raw
    # Always answer the same way so the endpoint cannot be used to probe emails.
    return TokenIssueResponse(
        message="If that email is registered, a reset link has been sent.",
        dev_token=dev_token,
    )


@router.post("/reset-password")
@limiter.limit(settings.rate_limit_auth)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    guard_password(payload.new_password)
    user = _consume_one_time_token(db, payload.token, "reset")
    user.password_hash = hash_password(payload.new_password)
    # Sign out every session.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    log_activity(
        db, user.id, ActivityType.PASSWORD_CHANGE, ip_address=_client_ip(request), commit=False
    )
    db.commit()
    return {"status": "ok", "message": "Password reset. Please sign in."}


@router.post("/request-verification", response_model=TokenIssueResponse)
@limiter.limit(settings.rate_limit_auth)
def request_verification(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.email_verified:
        return TokenIssueResponse(message="Email is already verified.")
    raw = _issue_one_time_token(db, user, "verify", minutes=60 * 24)
    db.commit()
    sent = send_verification_email(
        user.email,
        f"{settings.frontend_url}/verify-email?token={raw}",
    )
    return TokenIssueResponse(
        message="Verification email sent." if sent else "Verification token issued (dev mode).",
        dev_token=None if sent else raw,
    )


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    user = _consume_one_time_token(db, payload.token, "verify")
    user.email_verified = True
    db.commit()
    return {"status": "ok", "message": "Email verified."}
