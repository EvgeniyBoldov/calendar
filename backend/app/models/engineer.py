from sqlalchemy import String, Integer, ForeignKey, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid
from datetime import date


class Engineer(Base, TimestampMixin):
    __tablename__ = "engineers"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    region_id: Mapped[str] = mapped_column(String(36), ForeignKey("regions.id"), nullable=False)
    
    # Relationships
    region = relationship("Region", back_populates="engineers")
    time_slots = relationship("TimeSlot", back_populates="engineer", cascade="all, delete-orphan")
    assigned_chunks = relationship("WorkChunk", back_populates="assigned_engineer")


class TimeSlot(Base):
    __tablename__ = "time_slots"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    engineer_id: Mapped[str] = mapped_column(String(36), ForeignKey("engineers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_hour: Mapped[int] = mapped_column(Integer, nullable=False)
    end_hour: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Relationships
    engineer = relationship("Engineer", back_populates="time_slots")
