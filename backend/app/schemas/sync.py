from pydantic import BaseModel
from enum import Enum
from typing import Any
from datetime import datetime


class SyncEventType(str, Enum):
    # Work events
    WORK_CREATED = "work_created"
    WORK_UPDATED = "work_updated"
    WORK_DELETED = "work_deleted"
    
    # Chunk events
    CHUNK_CREATED = "chunk_created"
    CHUNK_UPDATED = "chunk_updated"
    CHUNK_DELETED = "chunk_deleted"
    CHUNK_PLANNED = "chunk_planned"
    CHUNK_ASSIGNED = "chunk_assigned"
    
    # Engineer events
    ENGINEER_CREATED = "engineer_created"
    ENGINEER_UPDATED = "engineer_updated"
    ENGINEER_DELETED = "engineer_deleted"
    SLOT_ADDED = "slot_added"
    SLOT_REMOVED = "slot_removed"
    
    # Region/DC events
    REGION_CREATED = "region_created"
    REGION_UPDATED = "region_updated"
    REGION_DELETED = "region_deleted"
    DATACENTER_CREATED = "datacenter_created"
    DATACENTER_UPDATED = "datacenter_updated"
    DATACENTER_DELETED = "datacenter_deleted"
    
    # Planning session events
    PLANNING_SESSION_CREATED = "planning_session_created"
    PLANNING_SESSION_APPLIED = "planning_session_applied"
    PLANNING_SESSION_CANCELLED = "planning_session_cancelled"
    
    # Full sync
    FULL_SYNC = "full_sync"


class SyncEvent(BaseModel):
    event_type: SyncEventType
    entity_id: str | None = None
    data: Any
    timestamp: datetime
    user_id: str | None = None  # Who triggered the event
