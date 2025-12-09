from sqlalchemy import String, Boolean, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid
import enum


class UserRole(str, enum.Enum):
    """Роли пользователей в системе"""
    # Значения должны совпадать с именами для корректной работы с PostgreSQL enum
    ADMIN = "ADMIN"         # Администратор - полный доступ, управление пользователями
    EXPERT = "EXPERT"       # Эксперт - планирование, управление инженерами/ДЦ
    TRP = "TRP"             # Заказчик - создание и редактирование своих работ
    ENGINEER = "ENGINEER"   # Инженер - выполнение назначенных работ


class User(Base, TimestampMixin):
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Логин (доменный логин для LDAP или уникальный username для локальной авторизации)
    login: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    
    # Email для уведомлений и идентификации
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    
    # Отображаемое имя (ФИО)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Роль пользователя
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.TRP, nullable=False)
    
    # Активен ли пользователь (для блокировки)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Хэш пароля (для локальной авторизации, в LDAP-режиме может быть NULL)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Relationships
    created_works = relationship("Work", back_populates="author")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    # Связь с инженером (если пользователь является инженером)
    engineer = relationship("Engineer", back_populates="user", uselist=False)
