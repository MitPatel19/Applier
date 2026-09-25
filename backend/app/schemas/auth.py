from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel


def _check_password(v: str) -> str:
    if len(v) < 10:
        raise ValueError("Use at least 10 characters")
    if v.lower() == v or v.upper() == v or not any(c.isdigit() for c in v):
        raise ValueError("Use a mix of upper- and lower-case letters and at least one number")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    full_name: str = Field(min_length=1, max_length=200)

    _pw = field_validator("password")(_check_password)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(max_length=128)

    _pw = field_validator("new_password")(_check_password)


class DeleteAccountIn(BaseModel):
    password: str
    confirm: str = Field(description='Must equal "DELETE"')


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: str
    onboarding_completed: bool
    created_at: datetime
    last_login_at: datetime | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    onboarding_completed: bool | None = None


class SessionOut(BaseModel):
    user: UserOut
    # Returned for non-browser API clients; browsers use the httpOnly cookie.
    access_token: str
    token_type: str = "bearer"
