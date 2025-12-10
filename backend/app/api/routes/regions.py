from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...database import get_db
from ...models import Region
from ...schemas import RegionCreate, RegionUpdate, RegionResponse
from ...services import sync_service
from ...schemas.sync import SyncEventType
from ..deps import CurrentUser, PlannerUser

router = APIRouter()


@router.get("", response_model=list[RegionResponse])
async def get_regions(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Region))
    return result.scalars().all()


@router.get("/{region_id}", response_model=RegionResponse)
async def get_region(
    region_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    return region


@router.post("", response_model=RegionResponse)
async def create_region(
    data: RegionCreate,
    current_user: PlannerUser,  # ADMIN or EXPERT only
    db: AsyncSession = Depends(get_db)
):
    region = Region(**data.model_dump())
    db.add(region)
    await db.flush()
    await db.refresh(region)
    
    # Broadcast event
    await sync_service.broadcast(
        SyncEventType.REGION_CREATED,
        RegionResponse.model_validate(region).model_dump(mode="json"),
        entity_id=region.id
    )
    
    return region


@router.patch("/{region_id}", response_model=RegionResponse)
async def update_region(
    region_id: str,
    data: RegionUpdate,
    current_user: PlannerUser,  # ADMIN or EXPERT only
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(region, key, value)
    
    await db.flush()
    await db.refresh(region)
    
    # Broadcast event
    await sync_service.broadcast(
        SyncEventType.REGION_UPDATED,
        RegionResponse.model_validate(region).model_dump(mode="json"),
        entity_id=region.id
    )
    
    return region


@router.delete("/{region_id}")
async def delete_region(
    region_id: str,
    current_user: PlannerUser,  # ADMIN or EXPERT only
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    
    await db.delete(region)
    
    # Broadcast event
    await sync_service.broadcast(
        SyncEventType.REGION_DELETED,
        {"id": region_id},
        entity_id=region_id
    )
    
    return {"ok": True}
