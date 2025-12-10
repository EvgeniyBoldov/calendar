"""
Модель для аудит-логов.

Записывает критичные действия пользователей:
- Вход/выход
- Создание/изменение/удаление пользователей
- Изменение ролей
- Критичные операции с данными
"""
from sqlalchemy import String, Text, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid
import enum


class AuditAction(str, enum.Enum):
    """Типы действий для аудита"""
    # Auth
    LOGIN = "LOGIN"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    TOKEN_REFRESH = "TOKEN_REFRESH"
    
    # Users
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DELETED = "USER_DELETED"
    USER_BLOCKED = "USER_BLOCKED"
    USER_UNBLOCKED = "USER_UNBLOCKED"
    ROLE_CHANGED = "ROLE_CHANGED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    
    # Engineer links
    ENGINEER_LINKED = "ENGINEER_LINKED"
    ENGINEER_UNLINKED = "ENGINEER_UNLINKED"
    
    # Works (критичные)
    WORK_DELETED = "WORK_DELETED"
    
    # Planning
    PLANNING_SESSION_APPLIED = "PLANNING_SESSION_APPLIED"


class AuditLog(Base, TimestampMixin):
    """Модель аудит-лога"""
    __tablename__ = "audit_logs"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Кто выполнил действие
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_login: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Что сделал
    action: Mapped[AuditAction] = mapped_column(SQLEnum(AuditAction), nullable=False, index=True)
    
    # Над чем (опционально)
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # user, work, engineer, etc.
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    
    # Детали (JSON-like text)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Контекст запроса
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    def __repr__(self):
        return f"<AuditLog {self.action.value} by {self.user_login} at {self.created_at}>"
