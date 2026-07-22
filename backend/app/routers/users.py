"""User profile, password and settings management."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.pwned import guard_password
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.models import ActivityType, RefreshToken, Setting, User
from app.schemas.auth import UserPublic
from app.schemas.user import PasswordChange, SettingsSchema, SettingsUpdate, UserUpdate
from app.services.activity import log_activity

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/user", response_model=UserPublic)
def get_me(user: User = Depends(get_current_user)):
    return UserPublic.model_validate(user)


@router.put("/user", response_model=UserPublic)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    if "username" in data or "email" in data:
        clash = (
            db.query(User)
            .filter(
                User.id != user.id,
                or_(
                    User.username == data.get("username", user.username),
                    User.email == data.get("email", user.email),
                ),
            )
            .first()
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Username or email already in use")
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return UserPublic.model_validate(user)


@router.post("/user/password", status_code=status.HTTP_200_OK)
def change_password(
    payload: PasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    guard_password(payload.new_password)
    user.password_hash = hash_password(payload.new_password)
    # Revoke all refresh tokens so other sessions are logged out.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    ip = request.client.host if request.client else None
    log_activity(db, user.id, ActivityType.PASSWORD_CHANGE, ip_address=ip, commit=False)
    db.commit()
    return {"status": "ok", "message": "Password changed. Please sign in again."}


@router.delete("/user", status_code=status.HTTP_200_OK)
def delete_me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(user)  # cascades to chats, settings, tokens, logs
    db.commit()
    return {"status": "ok", "message": "Account deleted"}


@router.get("/settings", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.settings is None:
        user.settings = Setting()
        db.commit()
        db.refresh(user)
    return SettingsSchema.model_validate(user.settings)


@router.put("/settings", response_model=SettingsSchema)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.settings is None:
        user.settings = Setting()
        db.flush()
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user.settings, key, value)
    log_activity(db, user.id, ActivityType.SETTINGS_UPDATE, commit=False)
    db.commit()
    db.refresh(user)
    return SettingsSchema.model_validate(user.settings)
