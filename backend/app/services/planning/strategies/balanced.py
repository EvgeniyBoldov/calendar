from typing import List, Tuple
from datetime import date
from ....models import Work, WorkChunk, WorkType, Priority
from ..types import SlotSuggestion
from .base import BaseStrategy

class BalancedStrategy(BaseStrategy):
    """
    Стратегия: Равномерное распределение.
    Выбираем инженера, у которого меньше всего нагрузка в этот период.
    """

    def sort_chunks(self, chunks: List[Tuple[WorkChunk, Work]]) -> List[Tuple[WorkChunk, Work]]:
        # Сортировка: Support(fix date) -> Priority -> Deadline -> Order
        priority_map = {
            Priority.CRITICAL: 0, Priority.HIGH: 1, Priority.MEDIUM: 2, Priority.LOW: 3
        }
        
        def key_func(item):
            chunk, work = item
            is_fixed = work.work_type == WorkType.SUPPORT
            prio = priority_map.get(work.priority, 2)
            deadline = work.due_date or work.target_date
            deadline_ord = deadline.toordinal() if deadline else 999999
            return (0 if is_fixed else 1, prio, deadline_ord, chunk.order)
            
        return sorted(chunks, key=key_func)

    async def select_best_slot(self, candidates: List[SlotSuggestion]) -> SlotSuggestion | None:
        if not candidates:
            return None
            
        # Для балансировки нужно знать нагрузку каждого кандидата
        # Группируем кандидатов по дате, чтобы минимизировать запросы (опционально)
        
        best = None
        min_load_ratio = float('inf')
        
        for cand in candidates:
            # Считаем нагрузку инженера в этот день
            used, available = await self.context.calculate_load(
                cand.engineer_id, cand.date, cand.date
            )
            
            # Добавляем вес самого таска
            future_used = used + cand.duration_hours
            
            ratio = future_used / available if available > 0 else 1.0
            
            # Если ratio одинаковый, берем того, кто раньше
            if ratio < min_load_ratio:
                min_load_ratio = ratio
                best = cand
            elif ratio == min_load_ratio:
                 # При прочих равных - кто раньше
                 if best and cand.date < best.date:
                     best = cand
                     
        return best
