"""
Сервис массового планирования работ с различными стратегиями.

Стратегии:
1. BALANCED - равномерное распределение по всем инженерам
2. FILL_FIRST - максимально заполнять одних инженеров
3. PRIORITY_FIRST - сначала критические и высокоприоритетные
4. OPTIMAL - минимизация переездов + приоритеты + баланс
"""

from datetime import date, timedelta
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ..models import (
    Work, WorkChunk, Engineer, TimeSlot, DataCenter,
    PlanningSession, PlanningStrategy, PlanningSessionStatus
)
from ..models.work import ChunkStatus, WorkStatus, WorkType, Priority


DC_TRAVEL_TIME_HOURS = 1


class BulkSchedulingService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_all_engineers(self) -> list[Engineer]:
        """Получить всех инженеров."""
        result = await self.db.execute(select(Engineer))
        return list(result.scalars().all())
    
    async def get_engineer_slots(self, engineer_id: str, start_date: date, end_date: date) -> dict[str, list[dict]]:
        """Получить слоты инженера за период."""
        result = await self.db.execute(
            select(TimeSlot).where(
                TimeSlot.engineer_id == engineer_id,
                TimeSlot.date >= start_date,
                TimeSlot.date <= end_date
            )
        )
        slots = result.scalars().all()
        
        schedule = defaultdict(list)
        for slot in slots:
            schedule[slot.date.isoformat()].append({
                "start": slot.start_hour,
                "end": slot.end_hour
            })
        return dict(schedule)
    
    async def get_assigned_chunks(self, engineer_id: str, start_date: date, end_date: date) -> list[WorkChunk]:
        """Получить назначенные чанки инженера за период."""
        result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(
                WorkChunk.assigned_engineer_id == engineer_id,
                WorkChunk.assigned_date >= start_date,
                WorkChunk.assigned_date <= end_date,
                WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.COMPLETED])
            )
        )
        return list(result.scalars().all())
    
    async def get_unassigned_chunks(self) -> list[tuple[WorkChunk, Work]]:
        """Получить все неназначенные чанки с их работами."""
        result = await self.db.execute(
            select(WorkChunk, Work)
            .join(Work, WorkChunk.work_id == Work.id)
            .options(selectinload(WorkChunk.tasks))
            .where(WorkChunk.status == ChunkStatus.CREATED)
            .order_by(WorkChunk.order)
        )
        return list(result.all())
    
    def get_work_deadline(self, work: Work) -> date | None:
        """Получить дедлайн работы в зависимости от типа."""
        if work.work_type == WorkType.GENERAL:
            return work.due_date
        elif work.work_type == WorkType.SUPPORT:
            return work.target_date
        return None
    
    def get_work_start_date(self, work: Work) -> date | None:
        """Получить дату начала для работы."""
        if work.work_type == WorkType.SUPPORT:
            return work.target_date  # Только в этот день
        return date.today()
    
    async def calculate_engineer_load(
        self, 
        engineer_id: str, 
        date_key: str,
        existing_assignments: list[dict]
    ) -> tuple[int, int]:
        """
        Рассчитать загрузку инженера на день.
        Возвращает (занято_часов, доступно_часов).
        """
        # Получаем слоты
        slots = await self.get_engineer_slots(
            engineer_id, 
            date.fromisoformat(date_key),
            date.fromisoformat(date_key)
        )
        
        total_available = sum(
            slot["end"] - slot["start"] 
            for slot in slots.get(date_key, [])
        )
        
        # Получаем уже назначенные чанки
        assigned = await self.get_assigned_chunks(
            engineer_id,
            date.fromisoformat(date_key),
            date.fromisoformat(date_key)
        )
        
        used = sum(c.duration_hours for c in assigned)
        
        # Добавляем из текущей сессии планирования
        for assignment in existing_assignments:
            if assignment["engineer_id"] == engineer_id and assignment["date"] == date_key:
                used += assignment["duration_hours"]
        
        return used, total_available
    
    async def find_slot_for_chunk(
        self,
        chunk: WorkChunk,
        work: Work,
        engineers: list[Engineer],
        existing_assignments: list[dict],
        strategy: PlanningStrategy,
        preferred_engineer_id: str | None = None
    ) -> dict | None:
        """Найти слот для чанка по стратегии."""
        
        dc_id = chunk.data_center_id or work.data_center_id
        deadline = self.get_work_deadline(work)
        start_date = self.get_work_start_date(work) or date.today()
        end_date = deadline or (start_date + timedelta(days=30))
        
        # Для support - только target_date
        if work.work_type == WorkType.SUPPORT and work.target_date:
            search_dates = [work.target_date]
        else:
            search_dates = []
            current = start_date
            while current <= end_date:
                search_dates.append(current)
                current += timedelta(days=1)
        
        # Сортируем инженеров по стратегии
        sorted_engineers = await self._sort_engineers_by_strategy(
            engineers, 
            existing_assignments,
            strategy,
            preferred_engineer_id,
            dc_id,
            search_dates[0] if search_dates else date.today()
        )
        
        best_slot = None
        
        for engineer in sorted_engineers:
            for search_date in search_dates:
                date_key = search_date.isoformat()
                
                # Получаем слоты инженера
                slots = await self.get_engineer_slots(engineer.id, search_date, search_date)
                day_slots = slots.get(date_key, [])
                
                if not day_slots:
                    continue
                
                # Проверяем загрузку
                used, available = await self.calculate_engineer_load(
                    engineer.id, date_key, existing_assignments
                )
                
                if available - used < chunk.duration_hours:
                    continue
                
                # Проверяем конфликт ДЦ
                engineer_dc_on_date = await self._get_engineer_dc_on_date(
                    engineer.id, date_key, existing_assignments
                )
                
                if engineer_dc_on_date and dc_id and engineer_dc_on_date != dc_id:
                    # Нужен переезд - добавляем час
                    if available - used < chunk.duration_hours + DC_TRAVEL_TIME_HOURS:
                        continue
                
                # Находим свободное время
                start_time = await self._find_free_start_time(
                    engineer.id, date_key, chunk.duration_hours, 
                    day_slots, existing_assignments
                )
                
                if start_time is not None:
                    slot = {
                        "chunk_id": chunk.id,
                        "work_id": work.id,
                        "engineer_id": engineer.id,
                        "date": date_key,
                        "start_time": start_time,
                        "duration_hours": chunk.duration_hours,
                        "dc_id": dc_id,
                        "priority": work.priority.value if work.priority else "medium"
                    }
                    
                    # Для FILL_FIRST берём первый найденный
                    if strategy == PlanningStrategy.FILL_FIRST:
                        return slot
                    
                    # Для остальных стратегий выбираем лучший
                    if best_slot is None:
                        best_slot = slot
                    elif search_date < date.fromisoformat(best_slot["date"]):
                        best_slot = slot
                    
                    # Если нашли у предпочтительного инженера - сразу берём
                    if preferred_engineer_id and engineer.id == preferred_engineer_id:
                        return slot
        
        return best_slot
    
    async def _sort_engineers_by_strategy(
        self,
        engineers: list[Engineer],
        existing_assignments: list[dict],
        strategy: PlanningStrategy,
        preferred_engineer_id: str | None,
        dc_id: str | None,
        target_date: date
    ) -> list[Engineer]:
        """Сортировка инженеров по стратегии."""
        
        if preferred_engineer_id:
            # Предпочтительный инженер первым
            preferred = [e for e in engineers if e.id == preferred_engineer_id]
            others = [e for e in engineers if e.id != preferred_engineer_id]
            engineers = preferred + others
        
        if strategy == PlanningStrategy.BALANCED:
            # Сортируем по загрузке (менее загруженные первыми)
            loads = []
            for eng in engineers:
                used, available = await self.calculate_engineer_load(
                    eng.id, target_date.isoformat(), existing_assignments
                )
                load_ratio = used / available if available > 0 else 1.0
                loads.append((eng, load_ratio))
            loads.sort(key=lambda x: x[1])
            return [e for e, _ in loads]
        
        elif strategy == PlanningStrategy.FILL_FIRST:
            # Сортируем по загрузке (более загруженные первыми, но с местом)
            loads = []
            for eng in engineers:
                used, available = await self.calculate_engineer_load(
                    eng.id, target_date.isoformat(), existing_assignments
                )
                if used < available:
                    load_ratio = used / available if available > 0 else 0
                    loads.append((eng, -load_ratio))  # Минус для обратной сортировки
            loads.sort(key=lambda x: x[1])
            return [e for e, _ in loads]
        
        elif strategy == PlanningStrategy.OPTIMAL:
            # Группируем по ДЦ, предпочитаем тех кто уже работает в нужном ДЦ
            dc_engineers = []
            other_engineers = []
            
            for eng in engineers:
                eng_dc = await self._get_engineer_dc_on_date(
                    eng.id, target_date.isoformat(), existing_assignments
                )
                if eng_dc == dc_id or eng_dc is None:
                    dc_engineers.append(eng)
                else:
                    other_engineers.append(eng)
            
            return dc_engineers + other_engineers
        
        return engineers
    
    async def _get_engineer_dc_on_date(
        self, 
        engineer_id: str, 
        date_key: str,
        existing_assignments: list[dict]
    ) -> str | None:
        """Получить ДЦ где инженер работает в этот день."""
        # Проверяем существующие назначения
        assigned = await self.get_assigned_chunks(
            engineer_id,
            date.fromisoformat(date_key),
            date.fromisoformat(date_key)
        )
        
        for chunk in assigned:
            if chunk.data_center_id:
                return chunk.data_center_id
        
        # Проверяем текущую сессию
        for assignment in existing_assignments:
            if assignment["engineer_id"] == engineer_id and assignment["date"] == date_key:
                return assignment.get("dc_id")
        
        return None
    
    async def _find_free_start_time(
        self,
        engineer_id: str,
        date_key: str,
        duration: int,
        slots: list[dict],
        existing_assignments: list[dict]
    ) -> int | None:
        """Найти свободное время начала в слотах."""
        
        # Собираем все занятые интервалы
        occupied = []
        
        # Из БД
        assigned = await self.get_assigned_chunks(
            engineer_id,
            date.fromisoformat(date_key),
            date.fromisoformat(date_key)
        )
        for chunk in assigned:
            if chunk.assigned_start_time is not None:
                occupied.append({
                    "start": chunk.assigned_start_time,
                    "end": chunk.assigned_start_time + chunk.duration_hours
                })
        
        # Из текущей сессии
        for assignment in existing_assignments:
            if assignment["engineer_id"] == engineer_id and assignment["date"] == date_key:
                occupied.append({
                    "start": assignment["start_time"],
                    "end": assignment["start_time"] + assignment["duration_hours"]
                })
        
        occupied.sort(key=lambda x: x["start"])
        
        # Ищем свободный слот
        for slot in slots:
            current_time = slot["start"]
            slot_end = slot["end"]
            
            for occ in occupied:
                if occ["start"] >= slot_end:
                    break
                if occ["end"] <= current_time:
                    continue
                
                # Проверяем промежуток до занятого
                if current_time + duration <= occ["start"]:
                    return current_time
                
                current_time = max(current_time, occ["end"])
            
            # Проверяем остаток слота
            if current_time + duration <= slot_end:
                return current_time
        
        return None
    
    async def create_planning_session(
        self,
        strategy: PlanningStrategy,
        user_id: str | None = None
    ) -> PlanningSession:
        """
        Создать сессию планирования и рассчитать распределение.
        """
        # Получаем все неназначенные чанки
        unassigned = await self.get_unassigned_chunks()
        
        if not unassigned:
            session = PlanningSession(
                user_id=user_id,
                strategy=strategy,
                assignments=[],
                stats={"total_chunks": 0, "assigned": 0, "failed": 0}
            )
            self.db.add(session)
            await self.db.flush()
            return session
        
        # Получаем всех инженеров
        engineers = await self.get_all_engineers()
        
        # Сортируем чанки по стратегии
        sorted_chunks = self._sort_chunks_by_strategy(unassigned, strategy)
        
        assignments = []
        failed_chunks = []
        
        # Группируем чанки по работам для отслеживания предпочтительного инженера
        work_engineer_map: dict[str, str] = {}
        
        for chunk, work in sorted_chunks:
            preferred_engineer = work_engineer_map.get(work.id)
            
            slot = await self.find_slot_for_chunk(
                chunk, work, engineers, assignments, strategy, preferred_engineer
            )
            
            if slot:
                assignments.append(slot)
                work_engineer_map[work.id] = slot["engineer_id"]
            else:
                failed_chunks.append({
                    "chunk_id": chunk.id,
                    "work_id": work.id,
                    "reason": "No available slot"
                })
        
        # Статистика
        stats = {
            "total_chunks": len(unassigned),
            "assigned": len(assignments),
            "failed": len(failed_chunks),
            "failed_details": failed_chunks,
            "by_engineer": self._calculate_engineer_stats(assignments),
            "by_dc": self._calculate_dc_stats(assignments),
            "by_priority": self._calculate_priority_stats(assignments)
        }
        
        # Создаём сессию
        session = PlanningSession(
            user_id=user_id,
            strategy=strategy,
            assignments=assignments,
            stats=stats
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        
        return session
    
    def _sort_chunks_by_strategy(
        self,
        chunks: list[tuple[WorkChunk, Work]],
        strategy: PlanningStrategy
    ) -> list[tuple[WorkChunk, Work]]:
        """Сортировка чанков по стратегии."""
        
        priority_order = {
            Priority.CRITICAL: 0,
            Priority.HIGH: 1,
            Priority.MEDIUM: 2,
            Priority.LOW: 3
        }
        
        def get_sort_key(item: tuple[WorkChunk, Work]):
            chunk, work = item
            
            # Фиксированные даты первыми (support имеет target_date)
            is_fixed = work.work_type == WorkType.SUPPORT
            fixed_order = 0 if is_fixed else 1
            
            # Приоритет
            priority = priority_order.get(work.priority, 2)
            
            # Дедлайн
            deadline = self.get_work_deadline(work)
            deadline_ts = deadline.toordinal() if deadline else 999999
            
            # Порядок чанка в работе
            chunk_order = chunk.order
            
            if strategy == PlanningStrategy.PRIORITY_FIRST:
                return (priority, fixed_order, deadline_ts, chunk_order)
            else:
                return (fixed_order, priority, deadline_ts, chunk_order)
        
        return sorted(chunks, key=get_sort_key)
    
    def _calculate_engineer_stats(self, assignments: list[dict]) -> dict:
        """Статистика по инженерам."""
        stats = defaultdict(lambda: {"chunks": 0, "hours": 0})
        for a in assignments:
            stats[a["engineer_id"]]["chunks"] += 1
            stats[a["engineer_id"]]["hours"] += a["duration_hours"]
        return dict(stats)
    
    def _calculate_dc_stats(self, assignments: list[dict]) -> dict:
        """Статистика по ДЦ."""
        stats = defaultdict(lambda: {"chunks": 0, "hours": 0})
        for a in assignments:
            dc = a.get("dc_id") or "unknown"
            stats[dc]["chunks"] += 1
            stats[dc]["hours"] += a["duration_hours"]
        return dict(stats)
    
    def _calculate_priority_stats(self, assignments: list[dict]) -> dict:
        """Статистика по приоритетам."""
        stats = defaultdict(int)
        for a in assignments:
            stats[a.get("priority", "medium")] += 1
        return dict(stats)
    
    async def apply_session(self, session_id: str) -> dict:
        """Применить сессию планирования - записать assignments в chunks."""
        
        result = await self.db.execute(
            select(PlanningSession).where(PlanningSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return {"success": False, "error": "Session not found"}
        
        if session.status != PlanningSessionStatus.DRAFT:
            return {"success": False, "error": f"Session is not in draft status: {session.status}"}
        
        # Применяем назначения
        applied_count = 0
        for assignment in session.assignments:
            chunk_result = await self.db.execute(
                select(WorkChunk).where(WorkChunk.id == assignment["chunk_id"])
            )
            chunk = chunk_result.scalar_one_or_none()
            
            if chunk and chunk.status == ChunkStatus.CREATED:
                chunk.assigned_engineer_id = assignment["engineer_id"]
                chunk.assigned_date = date.fromisoformat(assignment["date"])
                chunk.assigned_start_time = assignment["start_time"]
                chunk.status = ChunkStatus.PLANNED
                applied_count += 1
                
                # Обновляем статус работы
                await self._update_work_status(assignment["work_id"])
        
        session.status = PlanningSessionStatus.APPLIED
        await self.db.flush()
        
        return {
            "success": True,
            "applied_count": applied_count,
            "total": len(session.assignments)
        }
    
    async def cancel_session(self, session_id: str) -> dict:
        """Отменить сессию планирования."""
        
        result = await self.db.execute(
            select(PlanningSession).where(PlanningSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return {"success": False, "error": "Session not found"}
        
        if session.status == PlanningSessionStatus.APPLIED:
            # Откатываем назначения
            for assignment in session.assignments:
                chunk_result = await self.db.execute(
                    select(WorkChunk).where(WorkChunk.id == assignment["chunk_id"])
                )
                chunk = chunk_result.scalar_one_or_none()
                
                if chunk and chunk.status == ChunkStatus.PLANNED:
                    chunk.assigned_engineer_id = None
                    chunk.assigned_date = None
                    chunk.assigned_start_time = None
                    chunk.status = ChunkStatus.CREATED
                    
                    await self._update_work_status(assignment["work_id"])
        
        session.status = PlanningSessionStatus.CANCELLED
        await self.db.flush()
        
        return {"success": True}
    
    async def _update_work_status(self, work_id: str):
        """Обновить статус работы на основе чанков."""
        from .scheduling_service import SchedulingServiceV2
        scheduler = SchedulingServiceV2(self.db)
        await scheduler._update_work_status(work_id)
