"""Distance Matrix Schemas"""
from pydantic import BaseModel, Field
from datetime import datetime


class DistanceMatrixBase(BaseModel):
    from_dc_id: str
    to_dc_id: str
    duration_minutes: int = Field(..., ge=0, description="Travel time in minutes")


class DistanceMatrixCreate(DistanceMatrixBase):
    pass


class DistanceMatrixUpdate(BaseModel):
    duration_minutes: int | None = Field(None, ge=0)


class DistanceMatrixResponse(DistanceMatrixBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DistanceMatrixBulkCreate(BaseModel):
    """Bulk create/update distance matrix entries"""
    entries: list[DistanceMatrixCreate]


class TravelTimeRequest(BaseModel):
    """Request to get travel time between two DCs"""
    from_dc_id: str
    to_dc_id: str


class TravelTimeResponse(BaseModel):
    """Response with travel time"""
    from_dc_id: str
    to_dc_id: str
    duration_minutes: int
    found: bool = True
