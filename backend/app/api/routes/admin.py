"""
API эндпоинты администрирования.

Только для ADMIN.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from datetime import datetime

from ...database import get_db
from ...models import AuditLog, AuditAction
from ..deps import AdminUser

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: str
    user_id: str | None
    user_login: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    details: str | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    current_user: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: str | None = None,
    user_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить список аудит-логов.
    
    Только для ADMIN.
    """
    query = select(AuditLog)
    count_query = select(AuditLog)
    
    # Фильтры
    if action:
        try:
            action_enum = AuditAction(action)
            query = query.where(AuditLog.action == action_enum)
            count_query = count_query.where(AuditLog.action == action_enum)
        except ValueError:
            pass  # Игнорируем неизвестные action
    
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)
    
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
        count_query = count_query.where(AuditLog.entity_id == entity_id)
    
    # Подсчёт общего количества
    from sqlalchemy import func
    total_result = await db.execute(select(func.count()).select_from(count_query.subquery()))
    total = total_result.scalar() or 0
    
    # Пагинация и сортировка
    offset = (page - 1) * page_size
    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return AuditLogListResponse(
        items=[AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            user_login=log.user_login,
            action=log.action.value,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            created_at=log.created_at,
        ) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/audit-logs/actions")
async def list_audit_actions(current_user: AdminUser):
    """
    Получить список доступных типов действий для фильтрации.
    """
    return [{"value": action.value, "label": action.value} for action in AuditAction]
