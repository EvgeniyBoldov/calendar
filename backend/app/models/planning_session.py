"""
Planning Session - сессия массового планирования работ.

Позволяет:
1. Рассчитать распределение по выбранной стратегии
2. Показать preview без коммита в БД
3. Применить или отменить распределение атомарно
4. Изолировать изменения разных пользователей
"""

from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid
from datetime import datetime, timedelta
from enum import Enum


class PlanningStrategy(str, Enum):
    """Стратегии распределения работ"""
    
    # Равномерное распределение по всем инженерам
    BALANCED = "balanced"
    
    # Максимально заполнять одних инженеров, потом переходить к другим
    # (экономия смен, "dense")
    DENSE = "dense"
    FILL_FIRST = "fill_first"  # Alias for DENSE (legacy)
    
    # Сначала критические и высокоприоритетные ("sla")
    SLA = "sla"
    PRIORITY_FIRST = "priority_first" # Alias for SLA (legacy)
    
    # Оптимальный вариант: минимизация переездов + учёт приоритетов + баланс
    OPTIMAL = "optimal"


class PlanningSessionStatus(str, Enum):
    """Статус сессии планирования"""
    
    # Черновик - рассчитано, но не применено
    DRAFT = "draft"
    
    # Применено - assignments записаны в chunks
    APPLIED = "applied"
    
    # Отменено
    CANCELLED = "cancelled"
    
    # Истекло (TTL)
    EXPIRED = "expired"


class PlanningSession(Base, TimestampMixin):
    """Сессия массового планирования"""
    
    __tablename__ = "planning_sessions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Кто создал сессию
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    
    # Стратегия распределения
    strategy: Mapped[PlanningStrategy] = mapped_column(
        SQLEnum(PlanningStrategy), 
        default=PlanningStrategy.OPTIMAL,
        nullable=False
    )
    
    # Статус сессии
    status: Mapped[PlanningSessionStatus] = mapped_column(
        SQLEnum(PlanningSessionStatus),
        default=PlanningSessionStatus.DRAFT,
        nullable=False
    )
    
    # Время истечения draft сессии (по умолчанию 30 минут)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.utcnow() + timedelta(minutes=30),
        nullable=False
    )
    
    # Рассчитанные назначения (JSON массив)
    # [{chunk_id, engineer_id, date, start_time, dc_id}]
    assignments: Mapped[dict] = mapped_column(JSON, default=list, nullable=False)
    
    # Статистика распределения
    stats: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    
    # Relationships
    user = relationship("User", backref="planning_sessions")
