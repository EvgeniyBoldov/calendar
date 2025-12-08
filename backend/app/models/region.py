from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid


class Region(Base, TimestampMixin):
    __tablename__ = "regions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Relationships
    data_centers = relationship("DataCenter", back_populates="region", cascade="all, delete-orphan")
    engineers = relationship("Engineer", back_populates="region", cascade="all, delete-orphan")
