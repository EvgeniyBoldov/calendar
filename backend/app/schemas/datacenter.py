from pydantic import BaseModel
from datetime import datetime


class DataCenterBase(BaseModel):
    name: str
    description: str | None = None
    region_id: str


class DataCenterCreate(DataCenterBase):
    pass


class DataCenterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DataCenterResponse(DataCenterBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
