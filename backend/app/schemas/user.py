from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    pass


class UserResponse(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
