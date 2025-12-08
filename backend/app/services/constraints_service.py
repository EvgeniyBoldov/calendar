"""
Сервис расчёта constraints для чанков.

Constraints используются фронтендом для валидации drag-and-drop
без запросов к API (система "Светофор").
"""

from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..models import Work, WorkChunk, DataCenter, ChunkLink
from ..models.work import WorkType, ChunkLinkType
from ..schemas.work import ChunkConstraints


class ConstraintsService:
    """Сервис расчёта ограничений для чанков"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self._dc_region_cache: dict[str, str] = {}
    
    async def calculate_chunk_constraints(
        self, 
        chunk: WorkChunk, 
        work: Work
    ) -> ChunkConstraints:
        """
        Рассчитать constraints для чанка.
        
        Args:
            chunk: Чанк для расчёта
            work: Родительская работа (должна быть загружена)
            
        Returns:
            ChunkConstraints с ограничениями для фронтенда
        """
        constraints = ChunkConstraints(
            duration_hours=chunk.duration_hours,
            data_center_id=chunk.data_center_id or work.data_center_id
        )
        
        # Получаем регион ДЦ
        dc_id = constraints.data_center_id
        if dc_id:
            region_id = await self._get_dc_region(dc_id)
            if region_id:
                constraints.allowed_region_ids = [region_id]
        
        # Для support - фиксированная дата/время
        if work.work_type == WorkType.SUPPORT:
            if work.target_date:
                constraints.fixed_date = work.target_date
                constraints.min_date = work.target_date
                constraints.max_date = work.target_date
            if work.target_time is not None:
                constraints.fixed_time = work.target_time
        else:
            # Для general - окно дат
            constraints.min_date = date.today()
            if work.due_date:
                constraints.max_date = work.due_date
            else:
                # Если дедлайн не указан - 30 дней вперёд
                constraints.max_date = date.today() + timedelta(days=30)
        
        # Получаем связи чанка
        await self._load_chunk_links(chunk, constraints)
        
        # Корректируем min_date на основе зависимостей
        if constraints.depends_on_chunk_ids:
            earliest = await self._get_earliest_date_from_dependencies(
                constraints.depends_on_chunk_ids
            )
            if earliest and (constraints.min_date is None or earliest > constraints.min_date):
                constraints.min_date = earliest
        
        return constraints
    
    async def calculate_constraints_for_work(self, work: Work) -> dict[str, ChunkConstraints]:
        """
        Рассчитать constraints для всех чанков работы.
        
        Args:
            work: Работа с загруженными чанками
            
        Returns:
            Словарь {chunk_id: ChunkConstraints}
        """
        result = {}
        for chunk in work.chunks:
            result[chunk.id] = await self.calculate_chunk_constraints(chunk, work)
        return result
    
    async def _get_dc_region(self, dc_id: str) -> str | None:
        """Получить region_id для ДЦ (с кэшированием)"""
        if dc_id in self._dc_region_cache:
            return self._dc_region_cache[dc_id]
        
        result = await self.db.execute(
            select(DataCenter).where(DataCenter.id == dc_id)
        )
        dc = result.scalar_one_or_none()
        
        if dc:
            self._dc_region_cache[dc_id] = dc.region_id
            return dc.region_id
        return None
    
    async def _load_chunk_links(self, chunk: WorkChunk, constraints: ChunkConstraints):
        """Загрузить связи чанка и заполнить constraints"""
        # Исходящие связи
        outgoing = await self.db.execute(
            select(ChunkLink).where(ChunkLink.chunk_id == chunk.id)
        )
        for link in outgoing.scalars().all():
            if link.link_type == ChunkLinkType.DEPENDENCY:
                constraints.depends_on_chunk_ids.append(link.linked_chunk_id)
            elif link.link_type == ChunkLinkType.SYNC:
                constraints.sync_chunk_ids.append(link.linked_chunk_id)
        
        # Входящие sync-связи (симметричные)
        incoming = await self.db.execute(
            select(ChunkLink).where(
                ChunkLink.linked_chunk_id == chunk.id,
                ChunkLink.link_type == ChunkLinkType.SYNC
            )
        )
        for link in incoming.scalars().all():
            if link.chunk_id not in constraints.sync_chunk_ids:
                constraints.sync_chunk_ids.append(link.chunk_id)
    
    async def _get_earliest_date_from_dependencies(
        self, 
        dependency_ids: list[str]
    ) -> date | None:
        """
        Получить самую позднюю дату завершения зависимых чанков.
        Текущий чанк может быть назначен только ПОСЛЕ этой даты.
        """
        if not dependency_ids:
            return None
        
        result = await self.db.execute(
            select(WorkChunk).where(WorkChunk.id.in_(dependency_ids))
        )
        chunks = result.scalars().all()
        
        latest_date = None
        for chunk in chunks:
            if chunk.assigned_date:
                # Зависимый чанк уже назначен - берём его дату + 1 день
                candidate = chunk.assigned_date + timedelta(days=1)
                if latest_date is None or candidate > latest_date:
                    latest_date = candidate
        
        return latest_date
