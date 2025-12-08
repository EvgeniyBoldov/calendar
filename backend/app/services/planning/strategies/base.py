from abc import ABC, abstractmethod
from typing import List, Tuple
from ....models import Work, WorkChunk, Engineer
from ..types import SlotSuggestion
from ..context import PlanningContext
from ..engine import PlanningEngine

class BaseStrategy(ABC):
    """
    Базовая стратегия планирования.
    Определяет, как сортировать работы/чанки и как выбирать лучший слот из доступных.
    """
    def __init__(self, context: PlanningContext):
        self.context = context

    @abstractmethod
    def sort_chunks(self, chunks: List[Tuple[WorkChunk, Work]]) -> List[Tuple[WorkChunk, Work]]:
        """Сортировка очереди чанков"""
        pass

    @abstractmethod
    async def select_best_slot(
        self,
        candidates: List[SlotSuggestion]
    ) -> SlotSuggestion | None:
        """Выбор лучшего слота из найденных кандидатов"""
        pass

    def sort_works(self, works: List[Work]) -> List[Work]:
        """Сортировка работ (по умолчанию по дедлайну)"""
        # Default: по дедлайну
        return sorted(works, key=lambda w: w.due_date or w.target_date or date.max)
