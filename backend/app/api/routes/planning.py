"""
API endpoints для массового планирования работ.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

from ...database import get_db
from ...models import PlanningSession, PlanningStrategy, PlanningSessionStatus
from ...services.bulk_scheduling_service import BulkSchedulingService
from ...services import sync_service
from ...schemas.sync import SyncEventType


router = APIRouter()


class PlanningStrategyEnum(str, Enum):
    BALANCED = "balanced"    # Равномерное распределение
    DENSE = "dense"          # Плотная загрузка (экономия смен)
    SLA = "sla"              # Приоритет критичных задач


class CreateSessionRequest(BaseModel):
    strategy: PlanningStrategyEnum = PlanningStrategyEnum.BALANCED


class SessionResponse(BaseModel):
    id: str
    strategy: str
    status: str
    assignments: list[dict]
    stats: dict
    created_at: datetime
    expires_at: datetime
    
    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    items: list[SessionResponse]
    total: int


@router.post("/sessions", response_model=SessionResponse)
async def create_planning_session(
    request: CreateSessionRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать сессию планирования.
    
    Рассчитывает распределение всех неназначенных чанков по выбранной стратегии.
    Возвращает preview без записи в БД.
    
    Стратегии:
    - balanced: равномерное распределение по всем инженерам
    - fill_first: максимально заполнять одних инженеров
    - priority_first: сначала критические и высокоприоритетные
    - optimal: минимизация переездов + приоритеты + баланс
    """
    scheduler = BulkSchedulingService(db)
    
    # TODO: получить user_id из токена авторизации
    user_id = None
    
    strategy = PlanningStrategy(request.strategy.value)
    session = await scheduler.create_planning_session(strategy, user_id)
    
    # Broadcast для других пользователей
    await sync_service.broadcast(
        SyncEventType.PLANNING_SESSION_CREATED,
        {
            "id": session.id,
            "strategy": session.strategy.value,
            "stats": session.stats
        },
        entity_id=session.id
    )
    
    return SessionResponse(
        id=session.id,
        strategy=session.strategy.value,
        status=session.status.value,
        assignments=session.assignments,
        stats=session.stats,
        created_at=session.created_at,
        expires_at=session.expires_at
    )


@router.get("/sessions", response_model=SessionListResponse)
async def list_planning_sessions(
    status: PlanningSessionStatus | None = None,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """Получить список сессий планирования."""
    query = select(PlanningSession).order_by(PlanningSession.created_at.desc())
    
    if status:
        query = query.where(PlanningSession.status == status)
    
    query = query.limit(limit)
    
    result = await db.execute(query)
    sessions = result.scalars().all()
    
    return SessionListResponse(
        items=[
            SessionResponse(
                id=s.id,
                strategy=s.strategy.value,
                status=s.status.value,
                assignments=s.assignments,
                stats=s.stats,
                created_at=s.created_at,
                expires_at=s.expires_at
            )
            for s in sessions
        ],
        total=len(sessions)
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_planning_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Получить сессию планирования по ID."""
    result = await db.execute(
        select(PlanningSession).where(PlanningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        id=session.id,
        strategy=session.strategy.value,
        status=session.status.value,
        assignments=session.assignments,
        stats=session.stats,
        created_at=session.created_at,
        expires_at=session.expires_at
    )


@router.post("/sessions/{session_id}/apply")
async def apply_planning_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Применить сессию планирования.
    
    Записывает все assignments в chunks со статусом PLANNED.
    После применения сессия переходит в статус APPLIED.
    """
    scheduler = BulkSchedulingService(db)
    result = await scheduler.apply_session(session_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    # Broadcast
    await sync_service.broadcast(
        SyncEventType.PLANNING_SESSION_APPLIED,
        {
            "session_id": session_id,
            "applied_count": result["applied_count"]
        },
        entity_id=session_id
    )
    
    return result


@router.post("/sessions/{session_id}/cancel")
async def cancel_planning_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Отменить сессию планирования.
    
    Если сессия была применена - откатывает все назначения.
    Сессия переходит в статус CANCELLED.
    """
    scheduler = BulkSchedulingService(db)
    result = await scheduler.cancel_session(session_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    # Broadcast
    await sync_service.broadcast(
        SyncEventType.PLANNING_SESSION_CANCELLED,
        {"session_id": session_id},
        entity_id=session_id
    )
    
    return result


@router.delete("/sessions/{session_id}")
async def delete_planning_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Удалить сессию планирования (только draft или cancelled)."""
    result = await db.execute(
        select(PlanningSession).where(PlanningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.status == PlanningSessionStatus.APPLIED:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete applied session. Cancel it first."
        )
    
    await db.delete(session)
    
    return {"ok": True}


@router.get("/strategies")
async def list_strategies():
    """Получить список доступных стратегий планирования."""
    return {
        "strategies": [
            {
                "id": "balanced",
                "name": "Оптимальное",
                "description": "Равномерное распределение нагрузки между инженерами. Переезды минимизируются, но не запрещены."
            },
            {
                "id": "dense",
                "name": "Экономное",
                "description": "Плотная загрузка минимального числа инженеров. Экономит целые смены, освобождая других инженеров."
            },
            {
                "id": "sla",
                "name": "Приоритетное",
                "description": "Сначала критичные задачи и ближайшие дедлайны. Равномерность и переезды отходят на второй план."
            }
        ]
    }
