from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...database import get_db
from ...models import DataCenter
from ...schemas import DataCenterCreate, DataCenterUpdate, DataCenterResponse
from ...services import sync_service
from ...schemas.sync import SyncEventType

router = APIRouter()


@router.get("", response_model=list[DataCenterResponse])
async def get_datacenters(region_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(DataCenter)
    if region_id:
        query = query.where(DataCenter.region_id == region_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{dc_id}", response_model=DataCenterResponse)
async def get_datacenter(dc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataCenter).where(DataCenter.id == dc_id))
    dc = result.scalar_one_or_none()
    if not dc:
        raise HTTPException(status_code=404, detail="DataCenter not found")
    return dc


@router.post("", response_model=DataCenterResponse)
async def create_datacenter(data: DataCenterCreate, db: AsyncSession = Depends(get_db)):
    dc = DataCenter(**data.model_dump())
    db.add(dc)
    await db.flush()
    await db.refresh(dc)
    
    await sync_service.broadcast(
        SyncEventType.DATACENTER_CREATED,
        DataCenterResponse.model_validate(dc).model_dump(mode="json"),
        entity_id=dc.id
    )
    
    return dc


@router.patch("/{dc_id}", response_model=DataCenterResponse)
async def update_datacenter(dc_id: str, data: DataCenterUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataCenter).where(DataCenter.id == dc_id))
    dc = result.scalar_one_or_none()
    if not dc:
        raise HTTPException(status_code=404, detail="DataCenter not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(dc, key, value)
    
    await db.flush()
    await db.refresh(dc)
    
    await sync_service.broadcast(
        SyncEventType.DATACENTER_UPDATED,
        DataCenterResponse.model_validate(dc).model_dump(mode="json"),
        entity_id=dc.id
    )
    
    return dc


@router.delete("/{dc_id}")
async def delete_datacenter(dc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataCenter).where(DataCenter.id == dc_id))
    dc = result.scalar_one_or_none()
    if not dc:
        raise HTTPException(status_code=404, detail="DataCenter not found")
    
    await db.delete(dc)
    
    await sync_service.broadcast(
        SyncEventType.DATACENTER_DELETED,
        {"id": dc_id},
        entity_id=dc_id
    )
    
    return {"ok": True}
