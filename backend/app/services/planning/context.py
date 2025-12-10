from datetime import date, timedelta
from math import ceil
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

from ...models import (
    Engineer, TimeSlot, DataCenter, DistanceMatrix, WorkChunk
)
from ...models.work import ChunkStatus


class PlanningContext:
    """
    Контекст планирования. 
    Обеспечивает доступ к данным инженеров, слотам и расстояниям.
    Умеет учитывать "виртуальные" назначения (для сессий планирования).
    """
    def __init__(self, db: AsyncSession):
        self.db = db
        self._distance_cache: dict[tuple[str, str], int] = {}
        self._dc_regions: dict[str, str] = {}
        self._virtual_assignments: list[dict] = []
        self._context_loaded = False

    async def load_global_context(self):
        """Загрузить общие данные (расстояния, регионы ДЦ)"""
        if self._context_loaded:
            return

        # Матрица расстояний
        dist_res = await self.db.execute(select(DistanceMatrix))
        for row in dist_res.scalars().all():
            self._distance_cache[(row.from_dc_id, row.to_dc_id)] = row.duration_minutes

        # Регионы ДЦ
        dc_res = await self.db.execute(select(DataCenter))
        self._dc_regions = {dc.id: dc.region_id for dc in dc_res.scalars().all()}
        
        self._context_loaded = True

    def add_virtual_assignment(self, assignment: dict):
        """Добавить временное назначение в контекст"""
        self._virtual_assignments.append(assignment)

    async def get_candidate_engineers(
        self, 
        dc_id: str | None,
        preferred_engineer_id: str | None = None
    ) -> list[Engineer]:
        """
        Получить список инженеров-кандидатов.
        Если указан dc_id, фильтруем по региону ДЦ.
        """
        query = select(Engineer)
        
        if dc_id:
            await self.load_global_context()
            target_region_id = self._dc_regions.get(dc_id)
            if target_region_id:
                query = query.where(Engineer.region_id == target_region_id)
        
        result = await self.db.execute(query)
        engineers = list(result.scalars().all())
        
        # Сортировка: preferred первый
        if preferred_engineer_id:
            engineers.sort(key=lambda e: 0 if e.id == preferred_engineer_id else 1)
            
        return engineers

    async def get_engineer_slots(self, engineer_id: str, day: date) -> list[TimeSlot]:
        """Получить рабочие слоты инженера на конкретный день"""
        result = await self.db.execute(
            select(TimeSlot)
            .where(
                and_(
                    TimeSlot.engineer_id == engineer_id,
                    TimeSlot.date == day
                )
            )
            .order_by(TimeSlot.start_hour)
        )
        return list(result.scalars().all())

    async def get_occupied_intervals(
        self, 
        engineer_id: str, 
        day: date
    ) -> list[dict]:
        """
        Получить занятые интервалы инженера на день.
        Включает как реальные назначения из БД, так и виртуальные.
        """
        occupied = []
        
        # 1. Из БД
        result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.work))
            .where(
                and_(
                    WorkChunk.assigned_engineer_id == engineer_id,
                    WorkChunk.assigned_date == day,
                    WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS])
                )
            )
        )
        db_chunks = result.scalars().all()
        
        for chunk in db_chunks:
            if chunk.assigned_start_time is not None:
                # Определяем DC чанка (или работы)
                dc_id = chunk.data_center_id or (chunk.work.data_center_id if chunk.work else None)
                occupied.append({
                    "start": chunk.assigned_start_time,
                    "end": chunk.assigned_start_time + chunk.duration_hours,
                    "dc_id": dc_id
                })
        
        # 2. Из виртуальных назначений
        date_iso = day.isoformat()
        for assignment in self._virtual_assignments:
            if assignment["engineer_id"] == engineer_id and assignment["date"] == date_iso:
                occupied.append({
                    "start": assignment["start_time"],
                    "end": assignment["start_time"] + assignment["duration_hours"],
                    "dc_id": assignment.get("dc_id")
                })
        
        # Сортируем по времени начала
        occupied.sort(key=lambda x: x["start"])
        return occupied

    async def calculate_load(self, engineer_id: str, start_date: date, end_date: date) -> tuple[int, int]:
        """
        Рассчитать загрузку инженера за период (в часах).
        Возвращает (занято, всего_доступно).
        """
        # Считаем доступное время (слоты)
        slots_res = await self.db.execute(
            select(TimeSlot).where(
                and_(
                    TimeSlot.engineer_id == engineer_id,
                    TimeSlot.date >= start_date,
                    TimeSlot.date <= end_date
                )
            )
        )
        total_available = sum(s.end_hour - s.start_hour for s in slots_res.scalars().all())
        
        # Считаем занятое время (БД)
        # duration_hours - это property, поэтому загружаем чанки и считаем в Python
        used_db_res = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(
                and_(
                    WorkChunk.assigned_engineer_id == engineer_id,
                    WorkChunk.assigned_date >= start_date,
                    WorkChunk.assigned_date <= end_date,
                    WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS])
                )
            )
        )
        used = sum(chunk.duration_hours for chunk in used_db_res.scalars().all())
        
        # Считаем занятое время (Виртуальное)
        for assignment in self._virtual_assignments:
            if assignment["engineer_id"] == engineer_id:
                ass_date = date.fromisoformat(assignment["date"])
                if start_date <= ass_date <= end_date:
                    used += assignment["duration_hours"]
                    
        return used, total_available

    def get_travel_time(self, from_dc: str | None, to_dc: str | None) -> int:
        """Получить время переезда в часах (с округлением вверх)"""
        if not from_dc or not to_dc or from_dc == to_dc:
            return 0
            
        minutes = self._distance_cache.get((from_dc, to_dc))
        if minutes is None:
            # Fallback: пробуем обратное или дефолт
            minutes = self._distance_cache.get((to_dc, from_dc), 60)
            
        return ceil(minutes / 60)

    async def get_engineer_dc_on_date(self, engineer_id: str, day: date) -> str | None:
        """Узнать, в каком ДЦ инженер работает в этот день (если уже назначен)"""
        # Проверяем виртуальные
        date_iso = day.isoformat()
        for assignment in self._virtual_assignments:
            if assignment["engineer_id"] == engineer_id and assignment["date"] == date_iso:
                if assignment.get("dc_id"):
                    return assignment["dc_id"]
        
        # Проверяем БД
        result = await self.db.execute(
            select(WorkChunk)
            .where(
                and_(
                    WorkChunk.assigned_engineer_id == engineer_id,
                    WorkChunk.assigned_date == day,
                    WorkChunk.status.in_([ChunkStatus.PLANNED, ChunkStatus.ASSIGNED, ChunkStatus.IN_PROGRESS])
                )
            )
            .limit(1)
        )
        chunk = result.scalar_one_or_none()
        if chunk:
            return chunk.data_center_id
            
        return None
