from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ...database import get_db
from ...models import Engineer, TimeSlot
from ...schemas import EngineerCreate, EngineerUpdate, EngineerResponse, TimeSlotCreate, TimeSlotResponse
from ...services import sync_service
from ...schemas.sync import SyncEventType

router = APIRouter()


@router.get("", response_model=list[EngineerResponse])
async def get_engineers(region_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Engineer).options(selectinload(Engineer.time_slots))
    if region_id:
        query = query.where(Engineer.region_id == region_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{engineer_id}", response_model=EngineerResponse)
async def get_engineer(engineer_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Engineer)
        .options(selectinload(Engineer.time_slots))
        .where(Engineer.id == engineer_id)
    )
    engineer = result.scalar_one_or_none()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")
    return engineer


@router.post("", response_model=EngineerResponse)
async def create_engineer(data: EngineerCreate, db: AsyncSession = Depends(get_db)):
    engineer = Engineer(**data.model_dump())
    db.add(engineer)
    await db.flush()
    await db.refresh(engineer)

    # Reload engineer with time_slots relationship to avoid lazy-load in Pydantic
    result = await db.execute(
        select(Engineer)
        .options(selectinload(Engineer.time_slots))
        .where(Engineer.id == engineer.id)
    )
    engineer = result.scalar_one()
    
    await sync_service.broadcast(
        SyncEventType.ENGINEER_CREATED,
        EngineerResponse.model_validate(engineer).model_dump(mode="json"),
        entity_id=engineer.id
    )
    
    return engineer


@router.patch("/{engineer_id}", response_model=EngineerResponse)
async def update_engineer(engineer_id: str, data: EngineerUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Engineer)
        .options(selectinload(Engineer.time_slots))
        .where(Engineer.id == engineer_id)
    )
    engineer = result.scalar_one_or_none()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(engineer, key, value)
    
    await db.flush()
    await db.refresh(engineer)
    
    await sync_service.broadcast(
        SyncEventType.ENGINEER_UPDATED,
        EngineerResponse.model_validate(engineer).model_dump(mode="json"),
        entity_id=engineer.id
    )
    
    return engineer


@router.delete("/{engineer_id}")
async def delete_engineer(engineer_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Engineer).where(Engineer.id == engineer_id))
    engineer = result.scalar_one_or_none()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")
    
    await db.delete(engineer)
    
    await sync_service.broadcast(
        SyncEventType.ENGINEER_DELETED,
        {"id": engineer_id},
        entity_id=engineer_id
    )
    
    return {"ok": True}


# Time Slots
@router.post("/{engineer_id}/slots", response_model=TimeSlotResponse)
async def add_time_slot(engineer_id: str, data: TimeSlotCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Engineer).where(Engineer.id == engineer_id))
    engineer = result.scalar_one_or_none()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")
    
    slot = TimeSlot(engineer_id=engineer_id, **data.model_dump())
    db.add(slot)
    await db.flush()
    await db.refresh(slot)
    
    await sync_service.broadcast(
        SyncEventType.SLOT_ADDED,
        TimeSlotResponse.model_validate(slot).model_dump(mode="json"),
        entity_id=slot.id
    )
    
    return slot


@router.delete("/{engineer_id}/slots/{slot_id}")
async def remove_time_slot(engineer_id: str, slot_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TimeSlot).where(TimeSlot.id == slot_id, TimeSlot.engineer_id == engineer_id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="TimeSlot not found")
    
    await db.delete(slot)
    
    await sync_service.broadcast(
        SyncEventType.SLOT_REMOVED,
        {"id": slot_id, "engineer_id": engineer_id},
        entity_id=slot_id
    )
    
    return {"ok": True}
