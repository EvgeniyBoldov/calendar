from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid


class User(Base, TimestampMixin):
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    
    # Relationships
    created_works = relationship("Work", back_populates="author")
