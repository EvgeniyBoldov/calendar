from pydantic import BaseModel
from datetime import datetime, date


class TimeSlotBase(BaseModel):
    date: date
    start_hour: int
    end_hour: int


class TimeSlotCreate(TimeSlotBase):
    pass


class TimeSlotResponse(TimeSlotBase):
    id: str
    engineer_id: str
    
    class Config:
        from_attributes = True


class EngineerBase(BaseModel):
    name: str
    region_id: str


class EngineerCreate(EngineerBase):
    pass


class EngineerUpdate(BaseModel):
    name: str | None = None
    region_id: str | None = None


class EngineerResponse(EngineerBase):
    id: str
    created_at: datetime
    updated_at: datetime
    time_slots: list[TimeSlotResponse] = []
    
    class Config:
        from_attributes = True
