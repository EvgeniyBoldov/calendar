from datetime import date, timedelta
from typing import Optional

from ...models import Engineer, WorkChunk, Work, WorkType
from .context import PlanningContext
from .types import SlotSuggestion

class PlanningEngine:
    """
    Движок поиска слотов.
    Отвечает за "физическую" возможность назначения:
    - Проверка рабочих часов
    - Проверка пересечений
    - Учет времени на переезд
    - Проверка зависимостей чанков
    """
    def __init__(self, context: PlanningContext):
        self.context = context

    async def find_available_slots(
        self,
        engineer: Engineer,
        chunk: WorkChunk,
        work: Work,
        search_window_start: date,
        search_window_end: date
    ) -> list[SlotSuggestion]:
        """
        Найти все возможные слоты для чанка у конкретного инженера в заданном окне.
        """
        valid_slots = []
        duration = chunk.duration_hours
        target_dc_id = chunk.data_center_id or work.data_center_id
        
        current_date = search_window_start
        while current_date <= search_window_end:
            # Получаем рабочие часы инженера
            work_slots = await self.context.get_engineer_slots(engineer.id, current_date)
            if not work_slots:
                current_date += timedelta(days=1)
                continue
                
            # Получаем занятость
            occupied = await self.context.get_occupied_intervals(engineer.id, current_date)
            
            # Пытаемся найти окно в каждом рабочем слоте
            for w_slot in work_slots:
                # Если это support с фикс. временем - проверяем конкретно его
                if work.work_type == WorkType.SUPPORT and work.target_time is not None:
                    start_time = work.target_time
                    if (start_time >= w_slot.start_hour and 
                        start_time + duration <= w_slot.end_hour):
                        # Проверяем коллизии
                        if self._is_slot_free(start_time, duration, occupied, target_dc_id):
                             valid_slots.append(self._create_suggestion(
                                engineer, current_date, start_time, duration, target_dc_id, work.priority
                            ))
                    continue

                # Иначе ищем первое свободное место (алгоритм с учетом переездов)
                found_start = self._find_start_time_in_slot(
                    w_slot.start_hour, 
                    w_slot.end_hour, 
                    duration, 
                    occupied, 
                    target_dc_id
                )
                
                if found_start is not None:
                    valid_slots.append(self._create_suggestion(
                        engineer, current_date, found_start, duration, target_dc_id, work.priority
                    ))
                    # Обычно нам достаточно одного валидного слота в день для одного инженера,
                    # чтобы не плодить комбинаторику. Но если нужны все варианты - можно убрать break
                    break 
            
            current_date += timedelta(days=1)
            
        return valid_slots

    def _is_slot_free(
        self, 
        start: int, 
        duration: int, 
        occupied: list[dict], 
        target_dc_id: str | None
    ) -> bool:
        """Проверка, свободен ли конкретный интервал (с учетом переездов)"""
        # Упрощенная проверка, использует логику поиска, но для фикс времени
        # Можно оптимизировать, но пока переиспользуем _find_start_time_in_slot с узким окном
        res = self._find_start_time_in_slot(start, start + duration, duration, occupied, target_dc_id)
        return res is not None

    def _find_start_time_in_slot(
        self,
        slot_start: int,
        slot_end: int,
        duration: int,
        occupied: list[dict],
        target_dc_id: str | None
    ) -> int | None:
        """
        Найти валидное время начала внутри рабочего слота,
        учитывая занятые интервалы и переезды.
        """
        current_time = slot_start
        
        # Если занятых нет - просто проверяем вместимость
        if not occupied:
            if current_time + duration <= slot_end:
                return current_time
            return None
            
        prev_occ = None
        
        for occ in occupied:
            # Занятый интервал уже прошел (до нашего окна)
            if occ["end"] <= slot_start:
                prev_occ = occ
                continue
                
            # Занятый интервал начнется после нашего окна
            if occ["start"] >= slot_end:
                break
            
            # Потенциальное начало: либо текущий курсор, либо конец пред. активности + переезд
            potential_start = max(current_time, slot_start)
            
            if prev_occ:
                travel_time = self.context.get_travel_time(prev_occ["dc_id"], target_dc_id)
                potential_start = max(potential_start, prev_occ["end"] + travel_time)
                
            # Проверяем, помещаемся ли мы ДО следующей активности (occ)
            # Учитывая переезд К следующей активности
            travel_to_next = self.context.get_travel_time(target_dc_id, occ["dc_id"])
            
            if potential_start + duration + travel_to_next <= occ["start"]:
                # И обязательно внутри рабочего слота
                if potential_start >= slot_start and potential_start + duration <= slot_end:
                    return potential_start
            
            # Сдвигаем курсор за текущую активность
            current_time = max(current_time, occ["end"])
            prev_occ = occ
            
        # Проверяем "хвост" после всех активностей
        potential_start = max(current_time, slot_start)
        if prev_occ:
            travel_time = self.context.get_travel_time(prev_occ["dc_id"], target_dc_id)
            potential_start = max(potential_start, prev_occ["end"] + travel_time)
            
        if potential_start + duration <= slot_end:
            return potential_start
            
        return None

    def _create_suggestion(self, engineer, date, start, duration, dc_id, priority):
        return SlotSuggestion(
            engineer_id=engineer.id,
            engineer_name=engineer.name,
            date=date,
            start_time=start,
            end_time=start + duration,
            duration_hours=duration,
            dc_id=dc_id,
            priority=priority.value if hasattr(priority, 'value') else str(priority)
        )
