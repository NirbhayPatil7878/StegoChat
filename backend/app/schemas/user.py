from pydantic import BaseModel, EmailStr, Field


class UserUpdate(BaseModel):
    username: str | None = Field(
        default=None, min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$"
    )
    email: EmailStr | None = None
    bio: str | None = Field(default=None, max_length=280)
    avatar: str | None = Field(default=None, max_length=512)


class PasswordChange(BaseModel):
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


_VALID_STEGO_METHODS = {"lsb", "lsb-rgb", "lsb-2bit", "pvd", "dct"}


class SettingsSchema(BaseModel):
    theme: str = "dark"
    accent: str = "violet"
    animations_enabled: bool = True
    notifications_enabled: bool = True
    language: str = "en"
    auto_delete_messages: bool = False
    default_encryption: str = "AES-256"
    stego_method: str = "lsb"

    model_config = {"from_attributes": True}


class SettingsUpdate(BaseModel):
    theme: str | None = None
    accent: str | None = None
    animations_enabled: bool | None = None
    notifications_enabled: bool | None = None
    language: str | None = None
    auto_delete_messages: bool | None = None
    default_encryption: str | None = None
    stego_method: str | None = Field(default=None, pattern=r"^(lsb|lsb-rgb|lsb-2bit|pvd|dct)$")
