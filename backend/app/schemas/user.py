from pydantic import BaseModel, EmailStr
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    """Роли пользователей (зеркало models.UserRole для схем)"""
    ADMIN = "ADMIN"
    EXPERT = "EXPERT"
    TRP = "TRP"
    ENGINEER = "ENGINEER"


class UserBase(BaseModel):
    login: str
    email: EmailStr
    full_name: str | None = None
    role: UserRole = UserRole.TRP


class UserCreate(UserBase):
    """Создание пользователя (админом)"""
    password: str | None = None  # Опционально, если LDAP


class UserUpdate(BaseModel):
    """Обновление пользователя"""
    email: EmailStr | None = None
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None  # Для смены пароля


class UserResponse(BaseModel):
    """Ответ с данными пользователя"""
    id: str
    login: str
    email: str
    full_name: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    """Краткая информация о пользователе (для вложений в другие ответы)"""
    id: str
    login: str
    full_name: str | None
    role: UserRole
    
    class Config:
        from_attributes = True
