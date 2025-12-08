from sqlalchemy import String, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid

class DistanceMatrix(Base, TimestampMixin):
    __tablename__ = "distance_matrix"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    from_dc_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_centers.id"), nullable=False)
    to_dc_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_centers.id"), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Relationships
    from_dc = relationship("DataCenter", foreign_keys=[from_dc_id])
    to_dc = relationship("DataCenter", foreign_keys=[to_dc_id])

    __table_args__ = (
        UniqueConstraint('from_dc_id', 'to_dc_id', name='uix_from_to_dc'),
    )
