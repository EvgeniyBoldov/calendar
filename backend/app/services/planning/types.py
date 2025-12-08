from dataclasses import dataclass
from datetime import date
from typing import Any

from ...models.work import Work, WorkChunk, WorkType, Priority
from ...models.planning_session import PlanningStrategy


@dataclass
class SlotSuggestion:
    """Предложение слота для назначения"""
    engineer_id: str
    engineer_name: str
    date: date
    start_time: int
    end_time: int
    duration_hours: int
    dc_id: str | None = None
    priority: str = "medium"
    
    def to_dict(self) -> dict:
        return {
            "engineer_id": self.engineer_id,
            "engineer_name": self.engineer_name,
            "date": self.date.isoformat(),
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_hours": self.duration_hours,
            "dc_id": self.dc_id,
            "priority": self.priority
        }

@dataclass
class SchedulingResult:
    """Результат операции планирования"""
    success: bool
    message: str | None = None
    suggestion: SlotSuggestion | None = None
    assigned_count: int = 0
    errors: list[str] | None = None
    details: Any | None = None
