"""Distance Matrix API Routes"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List

from ...database import get_db
from ...models import DistanceMatrix, DataCenter
from ...schemas.distance import (
    DistanceMatrixCreate,
    DistanceMatrixUpdate,
    DistanceMatrixResponse,
    DistanceMatrixBulkCreate,
    TravelTimeRequest,
    TravelTimeResponse,
)

router = APIRouter()


@router.get("/", response_model=List[DistanceMatrixResponse])
async def list_distances(db: AsyncSession = Depends(get_db)):
    """Get all distance matrix entries"""
    result = await db.execute(select(DistanceMatrix))
    return result.scalars().all()


@router.get("/matrix")
async def get_full_matrix(db: AsyncSession = Depends(get_db)):
    """Get full distance matrix as a dictionary for frontend"""
    result = await db.execute(select(DistanceMatrix))
    distances = result.scalars().all()
    
    # Build matrix dict: { "dc1_id": { "dc2_id": minutes, ... }, ... }
    matrix = {}
    for d in distances:
        if d.from_dc_id not in matrix:
            matrix[d.from_dc_id] = {}
        matrix[d.from_dc_id][d.to_dc_id] = d.duration_minutes
    
    return matrix


@router.post("/", response_model=DistanceMatrixResponse)
async def create_distance(data: DistanceMatrixCreate, db: AsyncSession = Depends(get_db)):
    """Create a distance matrix entry"""
    # Validate DCs exist
    for dc_id in [data.from_dc_id, data.to_dc_id]:
        result = await db.execute(select(DataCenter).where(DataCenter.id == dc_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"DataCenter {dc_id} not found")
    
    # Check if entry already exists
    result = await db.execute(
        select(DistanceMatrix).where(
            and_(
                DistanceMatrix.from_dc_id == data.from_dc_id,
                DistanceMatrix.to_dc_id == data.to_dc_id
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Distance entry already exists. Use PATCH to update.")
    
    distance = DistanceMatrix(**data.model_dump())
    db.add(distance)
    await db.flush()
    await db.refresh(distance)
    return distance


@router.post("/bulk", response_model=List[DistanceMatrixResponse])
async def bulk_create_distances(data: DistanceMatrixBulkCreate, db: AsyncSession = Depends(get_db)):
    """Bulk create or update distance matrix entries"""
    results = []
    
    for entry in data.entries:
        # Check if exists
        result = await db.execute(
            select(DistanceMatrix).where(
                and_(
                    DistanceMatrix.from_dc_id == entry.from_dc_id,
                    DistanceMatrix.to_dc_id == entry.to_dc_id
                )
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.duration_minutes = entry.duration_minutes
            await db.flush()
            await db.refresh(existing)
            results.append(existing)
        else:
            distance = DistanceMatrix(**entry.model_dump())
            db.add(distance)
            await db.flush()
            await db.refresh(distance)
            results.append(distance)
    
    return results


@router.get("/travel-time")
async def get_travel_time(
    from_dc_id: str, 
    to_dc_id: str, 
    db: AsyncSession = Depends(get_db)
) -> TravelTimeResponse:
    """Get travel time between two DCs"""
    if from_dc_id == to_dc_id:
        return TravelTimeResponse(
            from_dc_id=from_dc_id,
            to_dc_id=to_dc_id,
            duration_minutes=0,
            found=True
        )
    
    result = await db.execute(
        select(DistanceMatrix).where(
            and_(
                DistanceMatrix.from_dc_id == from_dc_id,
                DistanceMatrix.to_dc_id == to_dc_id
            )
        )
    )
    distance = result.scalar_one_or_none()
    
    if distance:
        return TravelTimeResponse(
            from_dc_id=from_dc_id,
            to_dc_id=to_dc_id,
            duration_minutes=distance.duration_minutes,
            found=True
        )
    
    # Try reverse direction
    result = await db.execute(
        select(DistanceMatrix).where(
            and_(
                DistanceMatrix.from_dc_id == to_dc_id,
                DistanceMatrix.to_dc_id == from_dc_id
            )
        )
    )
    distance = result.scalar_one_or_none()
    
    if distance:
        return TravelTimeResponse(
            from_dc_id=from_dc_id,
            to_dc_id=to_dc_id,
            duration_minutes=distance.duration_minutes,
            found=True
        )
    
    # Not found - return default (assume same city, 60 min)
    return TravelTimeResponse(
        from_dc_id=from_dc_id,
        to_dc_id=to_dc_id,
        duration_minutes=60,
        found=False
    )


@router.patch("/{distance_id}", response_model=DistanceMatrixResponse)
async def update_distance(
    distance_id: str, 
    data: DistanceMatrixUpdate, 
    db: AsyncSession = Depends(get_db)
):
    """Update a distance matrix entry"""
    result = await db.execute(select(DistanceMatrix).where(DistanceMatrix.id == distance_id))
    distance = result.scalar_one_or_none()
    if not distance:
        raise HTTPException(status_code=404, detail="Distance entry not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(distance, key, value)
    
    await db.flush()
    await db.refresh(distance)
    return distance


@router.delete("/{distance_id}")
async def delete_distance(distance_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a distance matrix entry"""
    result = await db.execute(select(DistanceMatrix).where(DistanceMatrix.id == distance_id))
    distance = result.scalar_one_or_none()
    if not distance:
        raise HTTPException(status_code=404, detail="Distance entry not found")
    
    await db.delete(distance)
    return {"deleted": True}
