from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from ...database import get_db
from ...models import Work, WorkChunk, WorkAttachment, WorkTask, ChunkLink
from ...models.work import WorkStatus as DBWorkStatus, ChunkStatus as DBChunkStatus, Priority as DBPriority, TaskStatus as DBTaskStatus, WorkType as DBWorkType
from ...schemas import (
    WorkCreate, WorkUpdate, WorkResponse, WorkListResponse,
    WorkChunkCreate, WorkChunkUpdate, WorkChunkResponse,
    WorkTaskCreate, WorkTaskUpdate, WorkTaskResponse,
    WorkStatus, ChunkStatus, TaskStatus, Priority
)
from ...schemas.work import WorkAttachmentResponse
from ...services import sync_service
from ...services.planning.service import PlanningService
from ...services.constraints_service import ConstraintsService
from ...services.minio_service import minio_service
from ...schemas.sync import SyncEventType
from ...models.planning_session import PlanningStrategy

router = APIRouter()


async def enrich_work_with_constraints(work: Work, db: AsyncSession) -> Work:
    """Добавить constraints к чанкам работы для фронтенда"""
    if not work.chunks:
        return work
    
    constraints_service = ConstraintsService(db)
    constraints_map = await constraints_service.calculate_constraints_for_work(work)
    
    for chunk in work.chunks:
        chunk.constraints = constraints_map.get(chunk.id)
        chunk.links = chunk.outgoing_links if hasattr(chunk, 'outgoing_links') else []
    
    return work


@router.get("", response_model=WorkListResponse)
async def get_works(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: list[WorkStatus] | None = Query(None),
    priority: list[Priority] | None = Query(None),
    data_center_id: str | None = None,
    author_id: str | None = None,
    search: str | None = None,
    active_only: bool = False,  # Exclude completed & documented
    completed_only: bool = False,  # Only completed & documented
    db: AsyncSession = Depends(get_db)
):
    query = select(Work).options(
        selectinload(Work.tasks),
        selectinload(Work.chunks).selectinload(WorkChunk.tasks),
        selectinload(Work.chunks).selectinload(WorkChunk.outgoing_links),
        selectinload(Work.attachments)
    )
    count_query = select(func.count(Work.id))
    
    # Filters
    if status:
        db_statuses = [DBWorkStatus(s.value) for s in status]
        query = query.where(Work.status.in_(db_statuses))
        count_query = count_query.where(Work.status.in_(db_statuses))
    
    if active_only:
        active_statuses = [DBWorkStatus.CREATED, DBWorkStatus.IN_PROGRESS]
        query = query.where(Work.status.in_(active_statuses))
        count_query = count_query.where(Work.status.in_(active_statuses))
    
    if completed_only:
        completed_statuses = [DBWorkStatus.COMPLETED, DBWorkStatus.DOCUMENTED]
        query = query.where(Work.status.in_(completed_statuses))
        count_query = count_query.where(Work.status.in_(completed_statuses))
    
    if priority:
        db_priorities = [DBPriority(p.value) for p in priority]
        query = query.where(Work.priority.in_(db_priorities))
        count_query = count_query.where(Work.priority.in_(db_priorities))
    
    if data_center_id:
        query = query.where(Work.data_center_id == data_center_id)
        count_query = count_query.where(Work.data_center_id == data_center_id)
    
    if author_id:
        query = query.where(Work.author_id == author_id)
        count_query = count_query.where(Work.author_id == author_id)
    
    if search:
        search_filter = or_(
            Work.name.ilike(f"%{search}%"),
            Work.description.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(Work.due_date.asc(), Work.priority.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    works = list(result.scalars().all())
    
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # Добавляем constraints к каждой работе
    for work in works:
        await enrich_work_with_constraints(work, db)
    
    return WorkListResponse(
        items=[WorkResponse.model_validate(w) for w in works],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{work_id}", response_model=WorkResponse)
async def get_work(work_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Work)
        .options(
            selectinload(Work.tasks),
            selectinload(Work.chunks).selectinload(WorkChunk.tasks),
            selectinload(Work.chunks).selectinload(WorkChunk.outgoing_links),
            selectinload(Work.attachments)
        )
        .where(Work.id == work_id)
    )
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Добавляем constraints к чанкам
    await enrich_work_with_constraints(work, db)
        
    return work


@router.post("", response_model=WorkResponse)
async def create_work(data: WorkCreate, db: AsyncSession = Depends(get_db)):
    work = Work(**data.model_dump())
    db.add(work)
    await db.flush()
    await db.refresh(work)
    
    # Для support создаем автоматический чанк и задачу
    if work.work_type == DBWorkType.SUPPORT:
        # Создаем чанк
        chunk = WorkChunk(
            work_id=work.id,
            title=work.name,
            order=0,
            status=DBChunkStatus.CREATED,
            data_center_id=work.data_center_id
        )
        db.add(chunk)
        await db.flush()
        
        # Создаем задачу, чтобы duration_hours работало
        task = WorkTask(
            work_id=work.id,
            chunk_id=chunk.id,
            title=work.name,
            estimated_hours=work.duration_hours or 4,
            order=0,
            status=DBTaskStatus.TODO,
            data_center_id=work.data_center_id
        )
        db.add(task)
        await db.flush()

    
    # Reload work with relationships to avoid lazy load error
    result = await db.execute(
        select(Work)
        .options(
            selectinload(Work.chunks).selectinload(WorkChunk.tasks),
            selectinload(Work.attachments),
            selectinload(Work.tasks)
        )
        .where(Work.id == work.id)
    )
    work = result.scalar_one()
    
    await sync_service.broadcast(
        SyncEventType.WORK_CREATED,
        WorkResponse.model_validate(work).model_dump(mode="json"),
        entity_id=work.id
    )
    
    return work


@router.patch("/{work_id}", response_model=WorkResponse)
async def update_work(work_id: str, data: WorkUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Work)
        .options(selectinload(Work.chunks), selectinload(Work.attachments))
        .where(Work.id == work_id)
    )
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
        
    # Check version if provided for optimistic locking
    if data.version is not None and work.version != data.version:
        raise HTTPException(status_code=409, detail="Conflict: Work has been modified by another user")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(work, key, value)
    
    # Increment version
    work.version += 1
    
    await db.flush()
    await db.refresh(work)
    
    # Reload work with ALL needed relations
    result = await db.execute(
        select(Work)
        .options(
            selectinload(Work.tasks),
            selectinload(Work.chunks).selectinload(WorkChunk.tasks),
            selectinload(Work.chunks).selectinload(WorkChunk.outgoing_links),
            selectinload(Work.attachments)
        )
        .where(Work.id == work.id)
    )
    work = result.scalar_one()

    # Populate links for response model
    for chunk in work.chunks:
        chunk.links = chunk.outgoing_links
    
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        WorkResponse.model_validate(work).model_dump(mode="json"),
        entity_id=work.id
    )
    
    return work


@router.delete("/{work_id}")
async def delete_work(work_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Work).where(Work.id == work_id))
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    await db.delete(work)
    
    await sync_service.broadcast(
        SyncEventType.WORK_DELETED,
        {"id": work_id},
        entity_id=work_id
    )
    
    return {"ok": True}


# Work Chunks
@router.post("/{work_id}/chunks", response_model=WorkChunkResponse)
async def create_chunk(work_id: str, data: WorkChunkCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Work).where(Work.id == work_id))
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    chunk_data = data.model_dump(exclude={"task_ids"})
    chunk = WorkChunk(work_id=work_id, **chunk_data)
    
    db.add(chunk)
    await db.flush()
    await db.refresh(chunk)
    
    # Assign tasks to chunk if provided
    if data.task_ids:
        tasks_result = await db.execute(select(WorkTask).where(WorkTask.id.in_(data.task_ids)))
        for task in tasks_result.scalars().all():
            task.chunk_id = chunk.id
        await db.flush()
    
    # Reload chunk with tasks and links
    result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks), selectinload(WorkChunk.outgoing_links))
        .where(WorkChunk.id == chunk.id)
    )
    chunk = result.scalar_one()
    chunk.links = chunk.outgoing_links
    
    await sync_service.broadcast(
        SyncEventType.CHUNK_CREATED,
        WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
        entity_id=chunk.id
    )
    
    return chunk


@router.patch("/{work_id}/chunks/{chunk_id}", response_model=WorkChunkResponse)
async def update_chunk(work_id: str, chunk_id: str, data: WorkChunkUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks), selectinload(WorkChunk.outgoing_links))
        .where(WorkChunk.id == chunk_id, WorkChunk.work_id == work_id)
    )
    chunk = result.scalar_one_or_none()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    
    # Check version if provided for optimistic locking
    if data.version is not None and chunk.version != data.version:
        raise HTTPException(status_code=409, detail="Conflict: Chunk has been modified by another user")
    
    old_status = chunk.status
    update_data = data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(chunk, key, value)
    
    # Increment version manually if not handled by SQLAlchemy mapper_args yet
    chunk.version += 1
    
    await db.flush()
    
    # Reload chunk with tasks and links
    result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks), selectinload(WorkChunk.outgoing_links))
        .where(WorkChunk.id == chunk.id)
    )
    chunk = result.scalar_one()
    chunk.links = chunk.outgoing_links
    
    # Determine event type based on status change
    event_type = SyncEventType.CHUNK_UPDATED
    if data.status:
        if data.status == ChunkStatus.PLANNED:
            event_type = SyncEventType.CHUNK_PLANNED
        elif data.status == ChunkStatus.ASSIGNED:
            event_type = SyncEventType.CHUNK_ASSIGNED
    
    await sync_service.broadcast(
        event_type,
        WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
        entity_id=chunk.id
    )
    
    return chunk


@router.delete("/{work_id}/chunks/{chunk_id}")
async def delete_chunk(work_id: str, chunk_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkChunk).where(WorkChunk.id == chunk_id, WorkChunk.work_id == work_id)
    )
    chunk = result.scalar_one_or_none()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    
    await db.delete(chunk)
    
    await sync_service.broadcast(
        SyncEventType.CHUNK_DELETED,
        {"id": chunk_id, "work_id": work_id},
        entity_id=chunk_id
    )
    
    return {"ok": True}


# Bulk operations for planning
@router.post("/chunks/confirm-planned")
async def confirm_planned_chunks(db: AsyncSession = Depends(get_db)):
    """Confirm all planned chunks (change status from planned to assigned)."""
    # First, get IDs of planned chunks
    result = await db.execute(
        select(WorkChunk.id).where(WorkChunk.status == DBChunkStatus.PLANNED)
    )
    chunk_ids = [row[0] for row in result.all()]
    
    if not chunk_ids:
        return {"ok": True, "confirmed_count": 0}
    
    # Update status
    for chunk_id in chunk_ids:
        chunk_result = await db.execute(
            select(WorkChunk).where(WorkChunk.id == chunk_id)
        )
        chunk = chunk_result.scalar_one_or_none()
        if chunk:
            chunk.status = DBChunkStatus.ASSIGNED
    
    await db.flush()
    
    # Reload chunks with all relations for broadcast
    reload_result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks), selectinload(WorkChunk.outgoing_links))
        .where(WorkChunk.id.in_(chunk_ids))
    )
    updated_chunks = list(reload_result.scalars().all())
    
    # Broadcast bulk update
    for chunk in updated_chunks:
        chunk.links = chunk.outgoing_links if hasattr(chunk, 'outgoing_links') else []
        await sync_service.broadcast(
            SyncEventType.CHUNK_ASSIGNED,
            WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
            entity_id=chunk.id
        )
    
    return {"ok": True, "confirmed_count": len(updated_chunks)}


# Auto-assignment endpoints
@router.post("/{work_id}/chunks/{chunk_id}/auto-assign")
async def auto_assign_chunk(work_id: str, chunk_id: str, db: AsyncSession = Depends(get_db)):
    """
    Автоматически назначить чанк на оптимальный слот.
    """
    # Проверяем что чанк принадлежит работе
    check = await db.execute(
        select(WorkChunk).where(WorkChunk.id == chunk_id, WorkChunk.work_id == work_id)
    )
    if not check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chunk not found")
    
    scheduler = PlanningService(db)
    result = await scheduler.assign_chunk(chunk_id)
    
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message or "Auto-assign failed")
    
    # Получаем обновлённый чанк
    chunk_result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks))
        .where(WorkChunk.id == chunk_id)
    )
    chunk = chunk_result.scalar_one()
    
    # Broadcast
    await sync_service.broadcast(
        SyncEventType.CHUNK_PLANNED,
        WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
        entity_id=chunk.id
    )
    
    return {
        "ok": True,
        "assignment": result.suggestion.to_dict() if result.suggestion else None,
        "chunk": WorkChunkResponse.model_validate(chunk).model_dump(mode="json")
    }


@router.post("/{work_id}/chunks/{chunk_id}/unassign")
async def unassign_chunk(work_id: str, chunk_id: str, db: AsyncSession = Depends(get_db)):
    """
    Отменить назначение чанка.
    """
    check = await db.execute(
        select(WorkChunk).where(WorkChunk.id == chunk_id, WorkChunk.work_id == work_id)
    )
    if not check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chunk not found")
    
    scheduler = PlanningService(db)
    result = await scheduler.unassign_chunk(chunk_id)
    
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message or "Unassign failed")
    
    # Получаем обновлённый чанк
    chunk_result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks))
        .where(WorkChunk.id == chunk_id)
    )
    chunk = chunk_result.scalar_one()
    
    # Broadcast
    await sync_service.broadcast(
        SyncEventType.CHUNK_UPDATED,
        WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
        entity_id=chunk.id
    )
    
    return {
        "ok": True,
        "chunk": WorkChunkResponse.model_validate(chunk).model_dump(mode="json")
    }


@router.get("/{work_id}/chunks/{chunk_id}/suggest-slot")
async def suggest_slot_for_chunk(work_id: str, chunk_id: str, db: AsyncSession = Depends(get_db)):
    """
    Предложить оптимальный слот для чанка БЕЗ применения.
    """
    check = await db.execute(
        select(WorkChunk).where(WorkChunk.id == chunk_id, WorkChunk.work_id == work_id)
    )
    if not check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chunk not found")
    
    scheduler = PlanningService(db)
    result = await scheduler.suggest_slot(chunk_id)
    
    if not result.success or not result.suggestion:
        return {
            "found": False,
            "suggestion": None,
            "reason": result.message or "No available slot found"
        }
    
    return {
        "found": True,
        "suggestion": result.suggestion.to_dict()
    }


class AutoAssignWorkRequest(BaseModel):
    strategy: str | None = None  # balanced | dense | sla


@router.post("/{work_id}/auto-assign")
async def auto_assign_work(
    work_id: str,
    data: AutoAssignWorkRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Автоматически назначить все чанки работы по выбранной стратегии."""
    check = await db.execute(select(Work).where(Work.id == work_id))
    if not check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Определяем стратегию
    strategy_enum = PlanningStrategy.BALANCED
    if data and data.strategy:
        try:
            strategy_enum = PlanningStrategy(data.strategy)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid strategy")

    scheduler = PlanningService(db)
    result = await scheduler.assign_all_chunks(work_id, strategy_enum=strategy_enum)
    
    # Получаем обновлённую работу с чанками
    work_result = await db.execute(
        select(Work)
        .options(selectinload(Work.chunks).selectinload(WorkChunk.tasks))
        .where(Work.id == work_id)
    )
    updated_work = work_result.scalar_one()
    
    # Broadcast work update
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        WorkResponse.model_validate(updated_work).model_dump(mode="json"),
        entity_id=work_id
    )
    
    # Broadcast chunk updates
    for chunk in updated_work.chunks:
        await sync_service.broadcast(
            SyncEventType.CHUNK_UPDATED,
            WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
            entity_id=chunk.id
        )
    
    return {
        "ok": result.success,
        "assigned_count": result.assigned_count,
        "errors": result.errors or [],
        "message": result.message,
        "work": WorkResponse.model_validate(updated_work).model_dump(mode="json")
    }


# File Attachments
@router.get("/{work_id}/attachments", response_model=list[WorkAttachmentResponse])
async def get_attachments(work_id: str, db: AsyncSession = Depends(get_db)):
    """Get all attachments for a work"""
    result = await db.execute(select(Work).where(Work.id == work_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Work not found")
    
    result = await db.execute(
        select(WorkAttachment).where(WorkAttachment.work_id == work_id)
    )
    return result.scalars().all()


@router.post("/{work_id}/attachments", response_model=WorkAttachmentResponse)
async def upload_attachment(
    work_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload a file attachment to a work"""
    result = await db.execute(select(Work).where(Work.id == work_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Upload to MinIO
    minio_key, file_size = minio_service.upload_file(
        file_data=file.file,
        filename=file.filename or "unknown",
        content_type=file.content_type or "application/octet-stream",
        work_id=work_id
    )
    
    # Create DB record
    attachment = WorkAttachment(
        work_id=work_id,
        filename=file.filename or "unknown",
        minio_key=minio_key,
        content_type=file.content_type,
        size=file_size
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    
    return attachment


@router.get("/{work_id}/attachments/{attachment_id}/download")
async def download_attachment(
    work_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Download a file attachment"""
    result = await db.execute(
        select(WorkAttachment).where(
            WorkAttachment.id == attachment_id,
            WorkAttachment.work_id == work_id
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Get file from MinIO
    file_data = minio_service.download_file(attachment.minio_key)
    
    return StreamingResponse(
        file_data,
        media_type=attachment.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.filename}"'
        }
    )


@router.delete("/{work_id}/attachments/{attachment_id}")
async def delete_attachment(
    work_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a file attachment"""
    result = await db.execute(
        select(WorkAttachment).where(
            WorkAttachment.id == attachment_id,
            WorkAttachment.work_id == work_id
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete from MinIO
    minio_service.delete_file(attachment.minio_key)
    
    # Delete from DB
    await db.delete(attachment)
    
    return {"ok": True}


# Bulk operations
@router.post("/{work_id}/cancel-all-chunks")
async def cancel_all_chunks(work_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel all planned/assigned chunks for a work"""
    # First, get IDs of chunks to cancel
    result = await db.execute(
        select(WorkChunk.id).where(
            WorkChunk.work_id == work_id,
            WorkChunk.status.in_([DBChunkStatus.PLANNED, DBChunkStatus.ASSIGNED])
        )
    )
    chunk_ids = [row[0] for row in result.all()]
    
    if not chunk_ids:
        return {"ok": True, "cancelled_count": 0}
    
    # Update each chunk
    for chunk_id in chunk_ids:
        chunk_result = await db.execute(
            select(WorkChunk).where(WorkChunk.id == chunk_id)
        )
        chunk = chunk_result.scalar_one_or_none()
        if chunk:
            chunk.status = DBChunkStatus.CREATED
            chunk.assigned_engineer_id = None
            chunk.assigned_date = None
            chunk.assigned_start_time = None
    
    await db.flush()
    
    # Reload chunks with all relations for broadcast
    reload_result = await db.execute(
        select(WorkChunk)
        .options(selectinload(WorkChunk.tasks), selectinload(WorkChunk.outgoing_links))
        .where(WorkChunk.id.in_(chunk_ids))
    )
    updated_chunks = list(reload_result.scalars().all())
    
    # Broadcast updates
    for chunk in updated_chunks:
        chunk.links = chunk.outgoing_links if hasattr(chunk, 'outgoing_links') else []
        await sync_service.broadcast(
            SyncEventType.CHUNK_UPDATED,
            WorkChunkResponse.model_validate(chunk).model_dump(mode="json"),
            entity_id=chunk.id
        )
    
    return {"ok": True, "cancelled_count": len(updated_chunks)}


# Work Tasks (план работ / чеклист)
@router.get("/{work_id}/tasks", response_model=list[WorkTaskResponse])
async def get_tasks(work_id: str, db: AsyncSession = Depends(get_db)):
    """Get all tasks for a work"""
    result = await db.execute(select(Work).where(Work.id == work_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Work not found")
    
    result = await db.execute(
        select(WorkTask)
        .where(WorkTask.work_id == work_id)
        .order_by(WorkTask.order)
    )
    return result.scalars().all()


@router.post("/{work_id}/tasks", response_model=WorkTaskResponse)
async def create_task(work_id: str, data: WorkTaskCreate, db: AsyncSession = Depends(get_db)):
    """Create a new task in work plan"""
    result = await db.execute(select(Work).where(Work.id == work_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Work not found")
    
    task = WorkTask(work_id=work_id, **data.model_dump())
    db.add(task)
    await db.flush()
    await db.refresh(task)
    
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        {"id": work_id, "task_created": WorkTaskResponse.model_validate(task).model_dump(mode="json")},
        entity_id=work_id
    )
    
    return task


@router.patch("/{work_id}/tasks/{task_id}", response_model=WorkTaskResponse)
async def update_task(work_id: str, task_id: str, data: WorkTaskUpdate, db: AsyncSession = Depends(get_db)):
    """Update a task"""
    result = await db.execute(
        select(WorkTask).where(WorkTask.id == task_id, WorkTask.work_id == work_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    
    await db.flush()
    await db.refresh(task)
    
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        {"id": work_id, "task_updated": WorkTaskResponse.model_validate(task).model_dump(mode="json")},
        entity_id=work_id
    )
    
    return task


@router.delete("/{work_id}/tasks/{task_id}")
async def delete_task(work_id: str, task_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a task"""
    result = await db.execute(
        select(WorkTask).where(WorkTask.id == task_id, WorkTask.work_id == work_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.delete(task)
    
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        {"id": work_id, "task_deleted": task_id},
        entity_id=work_id
    )
    
    return {"ok": True}


@router.post("/{work_id}/tasks/bulk", response_model=list[WorkTaskResponse])
async def create_tasks_bulk(work_id: str, tasks: list[WorkTaskCreate], db: AsyncSession = Depends(get_db)):
    """Create multiple tasks at once"""
    result = await db.execute(select(Work).where(Work.id == work_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Work not found")
    
    created_tasks = []
    for i, task_data in enumerate(tasks):
        task = WorkTask(
            work_id=work_id,
            order=task_data.order if task_data.order else i,
            **task_data.model_dump(exclude={"order"})
        )
        db.add(task)
        created_tasks.append(task)
    
    await db.flush()
    for task in created_tasks:
        await db.refresh(task)
    
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        {"id": work_id, "tasks_created": len(created_tasks)},
        entity_id=work_id
    )
    
    return created_tasks


@router.post("/{work_id}/tasks/{task_id}/assign-to-chunk")
async def assign_task_to_chunk(
    work_id: str, 
    task_id: str, 
    chunk_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Assign a task to a chunk"""
    result = await db.execute(
        select(WorkTask).where(WorkTask.id == task_id, WorkTask.work_id == work_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify chunk exists and belongs to same work
    chunk_result = await db.execute(
        select(WorkChunk).where(WorkChunk.id == chunk_id, WorkChunk.work_id == work_id)
    )
    if not chunk_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chunk not found")
    
    task.chunk_id = chunk_id
    await db.flush()
    await db.refresh(task)
    
    return {"ok": True, "task": WorkTaskResponse.model_validate(task).model_dump(mode="json")}
