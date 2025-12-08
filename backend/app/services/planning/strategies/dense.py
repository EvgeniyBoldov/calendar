from typing import List, Tuple
from ....models import Work, WorkChunk, WorkType, Priority
from ..types import SlotSuggestion
from .base import BaseStrategy

class DenseStrategy(BaseStrategy):
    """
    Стратегия: Плотная загрузка.
    Выбираем инженера, который уже загружен, чтобы "добить" его смену.
    Минимизирует кол-во задействованных инженеров.
    """

    def sort_chunks(self, chunks: List[Tuple[WorkChunk, Work]]) -> List[Tuple[WorkChunk, Work]]:
        # Как в Balanced
        priority_map = {
            Priority.CRITICAL: 0, Priority.HIGH: 1, Priority.MEDIUM: 2, Priority.LOW: 3
        }
        
        def key_func(item):
            chunk, work = item
            is_fixed = work.work_type == WorkType.SUPPORT
            prio = priority_map.get(work.priority, 2)
            # Сначала короткие работы для плотной упаковки? Или наоборот длинные?
            # Обычно: first fit decreasing - длинные сначала сложнее упаковать
            duration = -chunk.duration_hours # Длинные первыми
            return (0 if is_fixed else 1, prio, duration, chunk.order)
            
        return sorted(chunks, key=key_func)

    async def select_best_slot(self, candidates: List[SlotSuggestion]) -> SlotSuggestion | None:
        if not candidates:
            return None
            
        best = None
        max_load_ratio = -1.0
        
        for cand in candidates:
            used, available = await self.context.calculate_load(
                cand.engineer_id, cand.date, cand.date
            )
            
            # Если есть место
            if used + cand.duration_hours <= available:
                ratio = used / available if available > 0 else 0
                
                # Ищем максимально загруженного (но чтобы влезло)
                if ratio > max_load_ratio:
                    max_load_ratio = ratio
                    best = cand
                elif ratio == max_load_ratio:
                    # При равной загрузке - кто раньше
                    if best and cand.date < best.date:
                        best = cand
                        
        # Если никого не нашли (все переполнены? хотя движок должен был отсеять),
        # берем первого попавшегося (наименее загруженного из "пустых")
        if best is None:
            return candidates[0]
            
        return best
