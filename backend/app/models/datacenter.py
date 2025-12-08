from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid


class DataCenter(Base, TimestampMixin):
    __tablename__ = "data_centers"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    region_id: Mapped[str] = mapped_column(String(36), ForeignKey("regions.id"), nullable=False)
    
    # Relationships
    region = relationship("Region", back_populates="data_centers")
    works = relationship("Work", back_populates="data_center")
