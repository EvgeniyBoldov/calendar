from pydantic import BaseModel
from datetime import datetime


class RegionBase(BaseModel):
    name: str


class RegionCreate(RegionBase):
    pass


class RegionUpdate(BaseModel):
    name: str | None = None


class RegionResponse(RegionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
