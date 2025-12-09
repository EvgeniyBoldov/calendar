from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base
from datetime import datetime
import uuid


class RefreshToken(Base):
    """
    Refresh-токены для JWT аутентификации.
    Хранятся в БД для возможности отзыва (revoke) и отслеживания сессий.
    """
    __tablename__ = "refresh_tokens"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Связь с пользователем
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # JTI (JWT ID) - уникальный идентификатор токена, используется в JWT payload
    jti: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    
    # Отозван ли токен (при logout или принудительном отзыве)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Время истечения токена
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    
    # Время создания
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Информация о клиенте (опционально, для аудита)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv6 max length
    
    # Relationships
    user = relationship("User", back_populates="refresh_tokens")
    
    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at
    
    @property
    def is_valid(self) -> bool:
        return not self.revoked and not self.is_expired
