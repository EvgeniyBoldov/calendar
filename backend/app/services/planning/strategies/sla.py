from typing import List, Tuple
from ....models import Work, WorkChunk, WorkType, Priority
from ..types import SlotSuggestion
from .base import BaseStrategy

class SLAStrategy(BaseStrategy):
    """
    Стратегия: SLA / Priority First.
    Главное - выполнить как можно раньше.
    """

    def sort_chunks(self, chunks: List[Tuple[WorkChunk, Work]]) -> List[Tuple[WorkChunk, Work]]:
        priority_map = {
            Priority.CRITICAL: 0, Priority.HIGH: 1, Priority.MEDIUM: 2, Priority.LOW: 3
        }
        
        def key_func(item):
            chunk, work = item
            # Строго по приоритету, потом дедлайн
            prio = priority_map.get(work.priority, 2)
            deadline = work.due_date or work.target_date
            deadline_ord = deadline.toordinal() if deadline else 999999
            return (prio, deadline_ord, chunk.order)
            
        return sorted(chunks, key=key_func)

    async def select_best_slot(self, candidates: List[SlotSuggestion]) -> SlotSuggestion | None:
        if not candidates:
            return None
            
        # Просто берем самый ранний слот по времени
        # Сортируем: дата, время старта
        candidates.sort(key=lambda x: (x.date, x.start_time))
        return candidates[0]
