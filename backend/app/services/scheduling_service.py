"""
Сервис автоматического планирования работ v2.

Типы работ:
- general: Работа с планом (чанки с задачами)
- support: Сопровождение (выезд в конкретный день)

Алгоритм:
1. Для support: назначить на target_date, если указан target_time - использовать его
2. Для general: найти ближайший свободный слот с учётом:
   - Дедлайна (due_date)
   - Зависимостей между чанками (ChunkLink)
   - Синхронных чанков (должны быть в один день)
   - Предпочтение того же инженера для чанков одной работы
"""

from datetime import date, timedelta
from dataclasses import dataclass
from enum import Enum
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

from ..models import (
    Work, WorkChunk, Engineer, TimeSlot, DataCenter, 
    DistanceMatrix, ChunkLink, WorkTask
)
from ..models.work import ChunkStatus, WorkStatus, WorkType, ChunkLinkType


class PlanningStrategy(str, Enum):
    """
    Стратегии автоназначения:
    
    - BALANCED: Равномерное распределение нагрузки между инженерами
    - DENSE: Плотная загрузка минимального числа инженеров
    - SLA: Приоритет критичных задач и дедлайнов
    """
    BALANCED = "balanced"
    DENSE = "dense"
    SLA = "sla"


@dataclass
class SlotSuggestion:
    """Предложение слота для назначения"""
    engineer_id: str
    engineer_name: str
    date: date
    start_time: int
    end_time: int
    duration_hours: int
    
    def to_dict(self) -> dict:
        return {
            "engineer_id": self.engineer_id,
            "engineer_name": self.engineer_name,
            "date": self.date.isoformat(),
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_hours": self.duration_hours,
        }


@dataclass
class SchedulingResult:
    """Результат операции планирования"""
    success: bool
    message: str | None = None
    suggestion: SlotSuggestion | None = None
    assigned_count: int = 0
    errors: list[str] | None = None


class SchedulingServiceV2:
    """Сервис планирования работ"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self._distance_cache: dict[tuple[str, str], int] = {}
    
    # ==================== PUBLIC API ====================
    
    async def suggest_slot(self, chunk_id: str) -> SchedulingResult:
        """
        Предложить оптимальный слот для чанка БЕЗ применения.
        """
        chunk = await self._get_chunk_with_tasks(chunk_id)
        if not chunk:
            return SchedulingResult(success=False, message="Чанк не найден")
        
        work = await self._get_work(chunk.work_id)
        if not work:
            return SchedulingResult(success=False, message="Работа не найдена")
        
        suggestion = await self._find_best_slot(chunk, work)
        if not suggestion:
            return SchedulingResult(success=False, message="Не найден подходящий слот")
        
        return SchedulingResult(success=True, suggestion=suggestion)
    
    async def assign_chunk(self, chunk_id: str) -> SchedulingResult:
        """
        Автоматически назначить чанк на оптимальный слот.
        """
        chunk = await self._get_chunk_with_tasks(chunk_id)
        if not chunk:
            return SchedulingResult(success=False, message="Чанк не найден")
        
        if chunk.status not in [ChunkStatus.CREATED, ChunkStatus.PLANNED]:
            return SchedulingResult(
                success=False, 
                message=f"Нельзя назначить чанк со статусом {chunk.status}"
            )
        
        work = await self._get_work(chunk.work_id)
        if not work:
            return SchedulingResult(success=False, message="Работа не найдена")
        
        suggestion = await self._find_best_slot(chunk, work)
        if not suggestion:
            return SchedulingResult(success=False, message="Не найден подходящий слот")
        
        # Применяем назначение
        chunk.assigned_engineer_id = suggestion.engineer_id
        chunk.assigned_date = suggestion.date
        chunk.assigned_start_time = suggestion.start_time
        chunk.status = ChunkStatus.PLANNED
        
        await self.db.flush()
        await self._update_work_status(work.id)
        
        return SchedulingResult(success=True, suggestion=suggestion)
    
    async def assign_all_chunks(self, work_id: str) -> SchedulingResult:
        """
        Автоматически назначить все неназначенные чанки работы.
        """
        work = await self._get_work_with_chunks(work_id)
        if not work:
            return SchedulingResult(success=False, message="Работа не найдена")
        
        # Сортируем чанки по порядку
        chunks = sorted(work.chunks, key=lambda c: c.order)
        
        assigned_count = 0
        errors = []
        preferred_engineer_id = None
        
        for chunk in chunks:
            # Пропускаем уже назначенные
            if chunk.status in [ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS, ChunkStatus.COMPLETED]:
                if chunk.assigned_engineer_id:
                    preferred_engineer_id = chunk.assigned_engineer_id
                continue
            
            # Пропускаем PLANNED (уже запланированные)
            if chunk.status == ChunkStatus.PLANNED:
                if chunk.assigned_engineer_id:
                    preferred_engineer_id = chunk.assigned_engineer_id
                continue
            
            suggestion = await self._find_best_slot(chunk, work, preferred_engineer_id)
            
            if suggestion:
                chunk.assigned_engineer_id = suggestion.engineer_id
                chunk.assigned_date = suggestion.date
                chunk.assigned_start_time = suggestion.start_time
                chunk.status = ChunkStatus.PLANNED
                assigned_count += 1
                preferred_engineer_id = suggestion.engineer_id
            else:
                errors.append(f"Не найден слот для '{chunk.title}'")
        
        await self.db.flush()
        await self._update_work_status(work_id)
        
        return SchedulingResult(
            success=len(errors) == 0,
            assigned_count=assigned_count,
            errors=errors if errors else None,
            message=f"Назначено {assigned_count} чанков" if assigned_count > 0 else "Нет чанков для назначения"
        )
    
    async def unassign_chunk(self, chunk_id: str) -> SchedulingResult:
        """
        Отменить назначение чанка.
        """
        chunk = await self._get_chunk_with_tasks(chunk_id)
        if not chunk:
            return SchedulingResult(success=False, message="Чанк не найден")
        
        # Если чанк не находится в состоянии назначения, считаем операцию идемпотентной
        # и просто возвращаем успех без изменений. Это важно, чтобы повторная отмена
        # или попытка отменить уже сброшенный чанк не приводила к ошибке на фронте.
        if chunk.status not in [ChunkStatus.PLANNED, ChunkStatus.ASSIGNED]:
            return SchedulingResult(
                success=True,
                message=f"Чанк уже не назначен (статус: {chunk.status})"
            )
        
        work_id = chunk.work_id
        
        chunk.assigned_engineer_id = None
        chunk.assigned_date = None
        chunk.assigned_start_time = None
        chunk.status = ChunkStatus.CREATED
        
        await self.db.flush()
        await self._update_work_status(work_id)
        
        return SchedulingResult(success=True, message="Назначение отменено")
    
    async def bulk_schedule(
        self, 
        strategy: PlanningStrategy = PlanningStrategy.BALANCED
    ) -> SchedulingResult:
        """
        Автоматически назначить все неназначенные чанки всех работ.
        
        Стратегии:
        - BALANCED: Равномерное распределение нагрузки
        - DENSE: Плотная загрузка минимального числа инженеров
        - SLA: Приоритет критичных задач и дедлайнов
        """
        # Получаем все работы, которые нужно распланировать
        works = await self._get_works_for_scheduling()
        
        if not works:
            return SchedulingResult(
                success=True, 
                message="Нет работ для планирования",
                assigned_count=0
            )
        
        # Сортируем работы в зависимости от стратегии
        sorted_works = self._sort_works_by_strategy(works, strategy)
        
        total_assigned = 0
        all_errors = []
        
        for work in sorted_works:
            result = await self._schedule_work_chunks(work, strategy)
            total_assigned += result.assigned_count
            if result.errors:
                all_errors.extend(result.errors)
        
        await self.db.flush()
        
        return SchedulingResult(
            success=len(all_errors) == 0,
            assigned_count=total_assigned,
            errors=all_errors if all_errors else None,
            message=f"Назначено {total_assigned} чанков (стратегия: {strategy.value})"
        )
    
    async def _get_works_for_scheduling(self) -> list[Work]:
        """Получить все работы, требующие планирования"""
        result = await self.db.execute(
            select(Work)
            .options(selectinload(Work.chunks).selectinload(WorkChunk.tasks))
            .where(
                Work.status.in_([
                    WorkStatus.READY, 
                    WorkStatus.SCHEDULING,
                    WorkStatus.CREATED
                ])
            )
        )
        return list(result.scalars().all())
    
    def _sort_works_by_strategy(
        self, 
        works: list[Work], 
        strategy: PlanningStrategy
    ) -> list[Work]:
        """Сортировать работы в зависимости от стратегии"""
        if strategy == PlanningStrategy.SLA:
            # SLA: сначала критичные, потом по дедлайну
            priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
            return sorted(works, key=lambda w: (
                priority_order.get(w.priority.value, 99),
                w.due_date or date.max
            ))
        elif strategy == PlanningStrategy.DENSE:
            # DENSE: сначала короткие работы (легче упаковать)
            return sorted(works, key=lambda w: sum(
                c.duration_hours for c in w.chunks if c.status == ChunkStatus.CREATED
            ))
        else:
            # BALANCED: по дедлайну
            return sorted(works, key=lambda w: w.due_date or date.max)
    
    async def _schedule_work_chunks(
        self, 
        work: Work, 
        strategy: PlanningStrategy
    ) -> SchedulingResult:
        """Назначить чанки одной работы с учётом стратегии"""
        chunks = sorted(work.chunks, key=lambda c: c.order)
        
        assigned_count = 0
        errors = []
        preferred_engineer_id = None
        
        for chunk in chunks:
            if chunk.status in [ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS, ChunkStatus.COMPLETED, ChunkStatus.PLANNED]:
                if chunk.assigned_engineer_id:
                    preferred_engineer_id = chunk.assigned_engineer_id
                continue
            
            suggestion = await self._find_best_slot_with_strategy(
                chunk, work, strategy, preferred_engineer_id
            )
            
            if suggestion:
                chunk.assigned_engineer_id = suggestion.engineer_id
                chunk.assigned_date = suggestion.date
                chunk.assigned_start_time = suggestion.start_time
                chunk.status = ChunkStatus.PLANNED
                assigned_count += 1
                preferred_engineer_id = suggestion.engineer_id
            else:
                errors.append(f"[{work.name}] Не найден слот для '{chunk.title}'")
        
        if assigned_count > 0:
            await self._update_work_status(work.id)
        
        return SchedulingResult(
            success=len(errors) == 0,
            assigned_count=assigned_count,
            errors=errors if errors else None
        )
    
    async def _find_best_slot_with_strategy(
        self,
        chunk: WorkChunk,
        work: Work,
        strategy: PlanningStrategy,
        preferred_engineer_id: str | None = None
    ) -> SlotSuggestion | None:
        """Найти лучший слот с учётом стратегии"""
        duration = chunk.duration_hours
        if duration <= 0:
            return None
        
        dc_id = chunk.data_center_id or work.data_center_id
        constraints = await self._get_date_constraints(chunk, work)
        engineers = await self._get_candidate_engineers(dc_id, preferred_engineer_id)
        
        if not engineers:
            return None
        
        # Для support с указанным временем
        if work.work_type == WorkType.SUPPORT and work.target_time is not None:
            return await self._find_slot_at_time(
                engineers, 
                constraints["start_date"],
                work.target_time,
                duration
            )
        
        # Выбираем метод поиска в зависимости от стратегии
        if strategy == PlanningStrategy.DENSE:
            return await self._search_dense_slot(
                engineers, constraints, duration, preferred_engineer_id
            )
        elif strategy == PlanningStrategy.SLA:
            return await self._search_earliest_slot(
                engineers, constraints, duration
            )
        else:  # BALANCED
            return await self._search_balanced_slot(
                engineers, constraints, duration
            )
    
    async def _search_dense_slot(
        self,
        engineers: list[Engineer],
        constraints: dict,
        duration: int,
        preferred_engineer_id: str | None
    ) -> SlotSuggestion | None:
        """
        DENSE: Найти слот у инженера с максимальной загрузкой.
        Цель - заполнить смены полностью, минимизируя число задействованных инженеров.
        """
        best_suggestion = None
        best_load = -1
        
        for eng in engineers:
            # Приоритет preferred инженеру
            if preferred_engineer_id and eng.id == preferred_engineer_id:
                suggestion = await self._find_first_available_slot(
                    eng, constraints["start_date"], constraints["end_date"], duration
                )
                if suggestion:
                    return suggestion
            
            # Считаем текущую загрузку инженера
            load = await self._get_engineer_load(eng.id, constraints["start_date"], constraints["end_date"])
            
            suggestion = await self._find_first_available_slot(
                eng, constraints["start_date"], constraints["end_date"], duration
            )
            
            if suggestion and load > best_load:
                best_suggestion = suggestion
                best_load = load
        
        return best_suggestion
    
    async def _search_earliest_slot(
        self,
        engineers: list[Engineer],
        constraints: dict,
        duration: int
    ) -> SlotSuggestion | None:
        """
        SLA: Найти самый ранний доступный слот.
        Цель - выполнить задачу как можно раньше.
        """
        earliest_suggestion = None
        
        for eng in engineers:
            suggestion = await self._find_first_available_slot(
                eng, constraints["start_date"], constraints["end_date"], duration
            )
            
            if suggestion:
                if earliest_suggestion is None or suggestion.date < earliest_suggestion.date:
                    earliest_suggestion = suggestion
                elif suggestion.date == earliest_suggestion.date and suggestion.start_time < earliest_suggestion.start_time:
                    earliest_suggestion = suggestion
        
        return earliest_suggestion
    
    async def _search_balanced_slot(
        self,
        engineers: list[Engineer],
        constraints: dict,
        duration: int
    ) -> SlotSuggestion | None:
        """
        BALANCED: Найти слот у наименее загруженного инженера.
        Цель - равномерное распределение нагрузки.
        """
        best_suggestion = None
        min_load = float('inf')
        
        for eng in engineers:
            load = await self._get_engineer_load(eng.id, constraints["start_date"], constraints["end_date"])
            
            suggestion = await self._find_first_available_slot(
                eng, constraints["start_date"], constraints["end_date"], duration
            )
            
            if suggestion and load < min_load:
                best_suggestion = suggestion
                min_load = load
        
        return best_suggestion
    
    async def _find_first_available_slot(
        self,
        engineer: Engineer,
        start_date: date,
        end_date: date,
        duration: int
    ) -> SlotSuggestion | None:
        """Найти первый доступный слот у инженера"""
        current_date = start_date
        
        while current_date <= end_date:
            slots = await self._get_engineer_slots(engineer.id, current_date)
            
            for slot in slots:
                available = await self._get_slot_available_time(
                    engineer.id, current_date, slot.start_hour, slot.end_hour
                )
                
                if available >= duration:
                    # Находим время начала
                    start_time = await self._get_slot_start_time(
                        engineer.id, current_date, slot.start_hour, slot.end_hour
                    )
                    
                    return SlotSuggestion(
                        engineer_id=engineer.id,
                        engineer_name=engineer.name,
                        date=current_date,
                        start_time=start_time,
                        end_time=start_time + duration,
                        duration_hours=duration
                    )
            
            current_date += timedelta(days=1)
        
        return None
    
    async def _get_engineer_load(
        self, 
        engineer_id: str, 
        start_date: date, 
        end_date: date
    ) -> int:
        """Получить общую загрузку инженера в часах за период"""
        result = await self.db.execute(
            select(func.sum(WorkChunk.duration_hours))
            .where(
                and_(
                    WorkChunk.assigned_engineer_id == engineer_id,
                    WorkChunk.assigned_date >= start_date,
                    WorkChunk.assigned_date <= end_date,
                    WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS])
                )
            )
        )
        return result.scalar() or 0
    
    async def _get_engineer_slots(self, engineer_id: str, target_date: date) -> list[TimeSlot]:
        """Получить слоты инженера на дату"""
        result = await self.db.execute(
            select(TimeSlot)
            .where(
                and_(
                    TimeSlot.engineer_id == engineer_id,
                    TimeSlot.date == target_date
                )
            )
            .order_by(TimeSlot.start_hour)
        )
        return list(result.scalars().all())
    
    async def _get_slot_available_time(
        self, 
        engineer_id: str, 
        target_date: date, 
        slot_start: int, 
        slot_end: int
    ) -> int:
        """Получить доступное время в слоте"""
        # Получаем все назначенные чанки в этом слоте
        result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(
                and_(
                    WorkChunk.assigned_engineer_id == engineer_id,
                    WorkChunk.assigned_date == target_date,
                    WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS])
                )
            )
        )
        chunks = result.scalars().all()
        
        used_time = sum(c.duration_hours for c in chunks)
        total_time = slot_end - slot_start
        
        return max(0, total_time - used_time)
    
    async def _get_slot_start_time(
        self, 
        engineer_id: str, 
        target_date: date, 
        slot_start: int, 
        slot_end: int
    ) -> int:
        """Получить время начала для нового чанка в слоте"""
        result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(
                and_(
                    WorkChunk.assigned_engineer_id == engineer_id,
                    WorkChunk.assigned_date == target_date,
                    WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS])
                )
            )
            .order_by(WorkChunk.assigned_start_time)
        )
        chunks = result.scalars().all()
        
        if not chunks:
            return slot_start
        
        # Находим конец последнего чанка
        last_end = slot_start
        for chunk in chunks:
            chunk_end = (chunk.assigned_start_time or slot_start) + chunk.duration_hours
            if chunk_end > last_end:
                last_end = chunk_end
        
        return min(last_end, slot_end)
    
    # ==================== PRIVATE METHODS ====================
    
    async def _get_chunk_with_tasks(self, chunk_id: str) -> WorkChunk | None:
        """Получить чанк с загруженными задачами"""
        result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(WorkChunk.id == chunk_id)
        )
        return result.scalar_one_or_none()
    
    async def _get_work(self, work_id: str) -> Work | None:
        """Получить работу"""
        result = await self.db.execute(
            select(Work).where(Work.id == work_id)
        )
        return result.scalar_one_or_none()
    
    async def _get_work_with_chunks(self, work_id: str) -> Work | None:
        """Получить работу с чанками и их задачами"""
        result = await self.db.execute(
            select(Work)
            .options(
                selectinload(Work.chunks).selectinload(WorkChunk.tasks)
            )
            .where(Work.id == work_id)
        )
        return result.scalar_one_or_none()
    
    async def _find_best_slot(
        self, 
        chunk: WorkChunk, 
        work: Work,
        preferred_engineer_id: str | None = None
    ) -> SlotSuggestion | None:
        """
        Найти лучший слот для чанка.
        """
        duration = chunk.duration_hours
        if duration <= 0:
            return None
        
        dc_id = chunk.data_center_id or work.data_center_id
        
        # Получаем ограничения по датам
        constraints = await self._get_date_constraints(chunk, work)
        
        # Получаем список инженеров для проверки
        engineers = await self._get_candidate_engineers(dc_id, preferred_engineer_id)
        if not engineers:
            return None
        
        # Для support с указанным временем - проверяем только этот слот
        if work.work_type == WorkType.SUPPORT and work.target_time is not None:
            return await self._find_slot_at_time(
                engineers, 
                constraints["start_date"],
                work.target_time,
                duration
            )
        
        # Ищем лучший слот
        return await self._search_best_slot(
            engineers,
            constraints["start_date"],
            constraints["end_date"],
            duration,
            constraints.get("sync_date"),
            preferred_engineer_id
        )
    
    async def _get_date_constraints(self, chunk: WorkChunk, work: Work) -> dict:
        """
        Получить ограничения по датам для чанка.
        """
        today = date.today()
        
        # Базовые ограничения
        if work.work_type == WorkType.SUPPORT:
            # Support - только в target_date
            start_date = work.target_date or today
            end_date = start_date
        else:
            # General - от сегодня до дедлайна
            start_date = today
            end_date = work.due_date or (today + timedelta(days=30))
        
        # Проверяем зависимости
        dependencies = await self._get_chunk_dependencies(chunk.id)
        
        # Если есть зависимости - не раньше их завершения
        if dependencies["earliest_date"]:
            if dependencies["earliest_date"] >= start_date:
                start_date = dependencies["earliest_date"] + timedelta(days=1)
        
        # Если есть синхронные чанки - только в их дату
        sync_date = None
        if dependencies["sync_date"]:
            sync_date = dependencies["sync_date"]
            start_date = sync_date
            end_date = sync_date
        
        return {
            "start_date": start_date,
            "end_date": end_date,
            "sync_date": sync_date,
        }
    
    async def _get_chunk_dependencies(self, chunk_id: str) -> dict:
        """
        Получить зависимости чанка.
        """
        # Исходящие связи
        outgoing = await self.db.execute(
            select(ChunkLink).where(ChunkLink.chunk_id == chunk_id)
        )
        outgoing_links = list(outgoing.scalars().all())
        
        # Входящие связи
        incoming = await self.db.execute(
            select(ChunkLink).where(ChunkLink.linked_chunk_id == chunk_id)
        )
        incoming_links = list(incoming.scalars().all())
        
        depends_on_ids = []
        sync_ids = []
        
        for link in outgoing_links:
            if link.link_type == ChunkLinkType.DEPENDENCY:
                depends_on_ids.append(link.linked_chunk_id)
            elif link.link_type == ChunkLinkType.SYNC:
                sync_ids.append(link.linked_chunk_id)
        
        for link in incoming_links:
            if link.link_type == ChunkLinkType.SYNC:
                if link.chunk_id not in sync_ids:
                    sync_ids.append(link.chunk_id)
        
        # Находим самую позднюю дату зависимостей
        earliest_date = None
        if depends_on_ids:
            deps = await self.db.execute(
                select(WorkChunk).where(WorkChunk.id.in_(depends_on_ids))
            )
            for dep in deps.scalars().all():
                if dep.assigned_date:
                    if earliest_date is None or dep.assigned_date > earliest_date:
                        earliest_date = dep.assigned_date
        
        # Находим дату синхронных чанков
        sync_date = None
        if sync_ids:
            syncs = await self.db.execute(
                select(WorkChunk).where(WorkChunk.id.in_(sync_ids))
            )
            for sync in syncs.scalars().all():
                if sync.assigned_date:
                    sync_date = sync.assigned_date
                    break
        
        return {
            "earliest_date": earliest_date,
            "sync_date": sync_date,
        }
    
    async def _get_candidate_engineers(
        self, 
        dc_id: str | None,
        preferred_engineer_id: str | None
    ) -> list[Engineer]:
        """
        Получить список инженеров-кандидатов.
        Предпочтительный инженер идёт первым.
        """
        if dc_id:
            # Получаем регион ДЦ
            dc_result = await self.db.execute(
                select(DataCenter).where(DataCenter.id == dc_id)
            )
            dc = dc_result.scalar_one_or_none()
            
            if dc:
                # Инженеры того же региона
                eng_result = await self.db.execute(
                    select(Engineer).where(Engineer.region_id == dc.region_id)
                )
                engineers = list(eng_result.scalars().all())
            else:
                eng_result = await self.db.execute(select(Engineer))
                engineers = list(eng_result.scalars().all())
        else:
            eng_result = await self.db.execute(select(Engineer))
            engineers = list(eng_result.scalars().all())
        
        # Ставим предпочтительного инженера первым
        if preferred_engineer_id:
            engineers.sort(key=lambda e: 0 if e.id == preferred_engineer_id else 1)
        
        return engineers
    
    async def _find_slot_at_time(
        self,
        engineers: list[Engineer],
        target_date: date,
        target_time: int,
        duration: int
    ) -> SlotSuggestion | None:
        """
        Найти слот в конкретное время (для support с указанным временем).
        """
        date_key = target_date.isoformat()
        
        for engineer in engineers:
            available = await self._get_available_slots(engineer.id, date_key, duration)
            
            for slot in available:
                if slot["start"] <= target_time and slot["end"] >= target_time + duration:
                    return SlotSuggestion(
                        engineer_id=engineer.id,
                        engineer_name=engineer.name,
                        date=target_date,
                        start_time=target_time,
                        end_time=target_time + duration,
                        duration_hours=duration,
                    )
        
        return None
    
    async def _search_best_slot(
        self,
        engineers: list[Engineer],
        start_date: date,
        end_date: date,
        duration: int,
        sync_date: date | None,
        preferred_engineer_id: str | None
    ) -> SlotSuggestion | None:
        """
        Поиск лучшего слота в диапазоне дат.
        """
        # Если есть sync_date - ищем только в этот день
        if sync_date:
            search_dates = [sync_date]
        else:
            search_dates = []
            current = start_date
            while current <= end_date:
                search_dates.append(current)
                current += timedelta(days=1)
        
        best: SlotSuggestion | None = None
        
        for engineer in engineers:
            for search_date in search_dates:
                date_key = search_date.isoformat()
                available = await self._get_available_slots(engineer.id, date_key, duration)
                
                for slot in available:
                    if slot["capacity"] >= duration:
                        suggestion = SlotSuggestion(
                            engineer_id=engineer.id,
                            engineer_name=engineer.name,
                            date=search_date,
                            start_time=slot["start"],
                            end_time=slot["start"] + duration,
                            duration_hours=duration,
                        )
                        
                        # Предпочитаем более ранние даты и время
                        if best is None:
                            best = suggestion
                        elif search_date < best.date:
                            best = suggestion
                        elif search_date == best.date and slot["start"] < best.start_time:
                            best = suggestion
                        
                        # Если нашли у предпочтительного инженера - сразу берём
                        if engineer.id == preferred_engineer_id:
                            return suggestion
        
        return best
    
    async def _get_available_slots(
        self, 
        engineer_id: str, 
        date_key: str,
        min_duration: int
    ) -> list[dict]:
        """
        Получить доступные слоты инженера на день.
        """
        target_date = date.fromisoformat(date_key)
        
        # Получаем рабочие слоты
        slots_result = await self.db.execute(
            select(TimeSlot).where(
                TimeSlot.engineer_id == engineer_id,
                TimeSlot.date == target_date
            )
        )
        time_slots = list(slots_result.scalars().all())
        
        if not time_slots:
            return []
        
        # Получаем назначенные чанки
        chunks_result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(
                WorkChunk.assigned_engineer_id == engineer_id,
                WorkChunk.assigned_date == target_date,
                WorkChunk.status.in_([
                    ChunkStatus.PLANNED, 
                    ChunkStatus.ASSIGNED, 
                    ChunkStatus.IN_PROGRESS,
                    ChunkStatus.COMPLETED
                ])
            )
            .order_by(WorkChunk.assigned_start_time)
        )
        assigned_chunks = list(chunks_result.scalars().all())
        
        # Строим список занятых интервалов
        busy = []
        for chunk in assigned_chunks:
            if chunk.assigned_start_time is not None:
                busy.append({
                    "start": chunk.assigned_start_time,
                    "end": chunk.assigned_start_time + chunk.duration_hours
                })
        
        # Находим свободные интервалы
        available = []
        for slot in time_slots:
            slot_start = slot.start_hour
            slot_end = slot.end_hour
            
            # Сортируем занятые интервалы в этом слоте
            slot_busy = sorted(
                [b for b in busy if b["start"] < slot_end and b["end"] > slot_start],
                key=lambda x: x["start"]
            )
            
            current = slot_start
            for b in slot_busy:
                if b["start"] > current:
                    gap = b["start"] - current
                    if gap >= min_duration:
                        available.append({
                            "start": current,
                            "end": b["start"],
                            "capacity": gap
                        })
                current = max(current, b["end"])
            
            # Проверяем остаток после последнего занятого
            if current < slot_end:
                gap = slot_end - current
                if gap >= min_duration:
                    available.append({
                        "start": current,
                        "end": slot_end,
                        "capacity": gap
                    })
        
        return available
    
    async def _update_work_status(self, work_id: str):
        """
        Обновить статус работы на основе статусов чанков.
        """
        result = await self.db.execute(
            select(Work)
            .options(selectinload(Work.chunks))
            .where(Work.id == work_id)
        )
        work = result.scalar_one_or_none()
        
        if not work or not work.chunks:
            return
        
        chunk_statuses = [c.status for c in work.chunks]
        
        if all(s == ChunkStatus.COMPLETED for s in chunk_statuses):
            work.status = WorkStatus.COMPLETED
        elif any(s in [ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS, ChunkStatus.COMPLETED] for s in chunk_statuses):
            work.status = WorkStatus.IN_PROGRESS
        else:
            if work.work_type == WorkType.SUPPORT:
                work.status = WorkStatus.CREATED
            else:
                work.status = WorkStatus.READY if work.status != WorkStatus.DRAFT else WorkStatus.DRAFT
        
        await self.db.flush()
