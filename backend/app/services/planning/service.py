from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models import Work, WorkChunk, WorkTask, Engineer, ChunkLink, WorkType, WorkStatus, ChunkStatus
from ...models.planning_session import PlanningSession, PlanningStrategy, PlanningSessionStatus
from ...models.work import ChunkLinkType

from .types import SchedulingResult, SlotSuggestion
from .context import PlanningContext
from .engine import PlanningEngine
from .strategies import get_strategy


class PlanningService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.context = PlanningContext(db)
        self.engine = PlanningEngine(self.context)

    # ================= PUBLIC API =================

    async def suggest_slot(self, chunk_id: str) -> SchedulingResult:
        """Предложить слот для чанка (без сохранения)"""
        chunk = await self._get_chunk(chunk_id)
        if not chunk:
            return SchedulingResult(False, "Chunk not found")
        
        work = await self._get_work(chunk.work_id)
        if not work:
            return SchedulingResult(False, "Work not found")

        # Используем дефолтную стратегию (Balanced) для одиночного саджеста
        strategy = get_strategy(PlanningStrategy.BALANCED, self.context)
        
        # Загружаем контекст
        await self.context.load_global_context()
        
        slot = await self._find_slot_for_single_chunk(chunk, work, strategy)
        
        if slot:
            return SchedulingResult(True, suggestion=slot)
        else:
            return SchedulingResult(False, "No suitable slot found")

    async def assign_chunk(self, chunk_id: str) -> SchedulingResult:
        """Назначить чанк (сохранить в БД)"""
        res = await self.suggest_slot(chunk_id)
        if not res.success or not res.suggestion:
            return res
            
        chunk = await self._get_chunk(chunk_id)
        work = await self._get_work(chunk.work_id)
        
        # Применяем
        chunk.assigned_engineer_id = res.suggestion.engineer_id
        chunk.assigned_date = res.suggestion.date
        chunk.assigned_start_time = res.suggestion.start_time
        chunk.status = ChunkStatus.PLANNED
        
        await self.db.flush()
        await self._update_work_status(work.id)
        
        return res

    async def unassign_chunk(self, chunk_id: str) -> SchedulingResult:
        """Сбросить назначение"""
        chunk = await self._get_chunk(chunk_id)
        if not chunk:
            return SchedulingResult(False, "Chunk not found")
            
        if chunk.status not in [ChunkStatus.PLANNED, ChunkStatus.ASSIGNED]:
            return SchedulingResult(True, "Already unassigned")
            
        work_id = chunk.work_id
        chunk.assigned_engineer_id = None
        chunk.assigned_date = None
        chunk.assigned_start_time = None
        chunk.status = ChunkStatus.CREATED
        
        await self.db.flush()
        await self._update_work_status(work_id)
        
        return SchedulingResult(True, "Unassigned")

    async def assign_all_chunks(
        self,
        work_id: str,
        strategy_enum: PlanningStrategy = PlanningStrategy.BALANCED,
    ) -> SchedulingResult:
        """Автоматически назначить все неназначенные чанки работы по выбранной стратегии."""
        work = await self._get_work(work_id)
        if not work:
            return SchedulingResult(False, "Work not found")
            
        # Загружаем контекст и стратегию
        await self.context.load_global_context()
        strategy = get_strategy(strategy_enum, self.context)
        
        # Получаем чанки работы
        chunks_res = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(WorkChunk.work_id == work_id)
        )
        all_chunks = chunks_res.scalars().all()
        
        # Фильтруем и сортируем
        to_assign = []
        for chunk in all_chunks:
            if chunk.status == ChunkStatus.CREATED:
                to_assign.append((chunk, work))
                
        if not to_assign:
            return SchedulingResult(True, "No chunks to assign")
            
        # Сортируем стратегией
        sorted_queue = strategy.sort_chunks(to_assign)
        
        assigned_count = 0
        errors = []
        assignments = [] # Для отслеживания preferred engineer
        
        for chunk, _ in sorted_queue:
            preferred_eng = await self._get_preferred_engineer(work.id, assignments)
            
            slot = await self._find_slot_for_single_chunk(chunk, work, strategy, preferred_engineer_id=preferred_eng)
            
            if slot:
                chunk.assigned_engineer_id = slot.engineer_id
                chunk.assigned_date = slot.date
                chunk.assigned_start_time = slot.start_time
                chunk.status = ChunkStatus.PLANNED
                
                assigned_count += 1
                
                # Запоминаем для контекста
                ass_dict = slot.to_dict()
                ass_dict["work_id"] = work.id
                assignments.append(ass_dict)
                self.context.add_virtual_assignment(ass_dict)
            else:
                errors.append(f"No slot for chunk {chunk.title}")
                
        if assigned_count > 0:
            await self.db.flush()
            await self._update_work_status(work.id)
            
        return SchedulingResult(
            success=len(errors) == 0,
            assigned_count=assigned_count,
            errors=errors if errors else None,
            message=f"Assigned {assigned_count} chunks"
        )

    async def create_session(self, strategy_enum: PlanningStrategy, user_id: str | None) -> PlanningSession:
        """Создать сессию массового планирования"""
        await self.context.load_global_context()
        strategy = get_strategy(strategy_enum, self.context)
        
        # 1. Получаем работы для планирования
        chunks_to_plan = await self._get_unassigned_chunks()
        
        # 2. Сортируем
        sorted_queue = strategy.sort_chunks(chunks_to_plan)
        
        assignments = []
        failed = []
        
        # 3. Планируем
        for chunk, work in sorted_queue:
            # Пытаемся сохранить предпочтение инженера (если другие чанки работы уже назначены)
            preferred_eng = await self._get_preferred_engineer(work.id, assignments)
            
            # Ищем слот
            slot = await self._find_slot_for_single_chunk(chunk, work, strategy, preferred_engineer_id=preferred_eng)
            
            if slot:
                # Добавляем в Assignments
                ass_dict = slot.to_dict()
                ass_dict["chunk_id"] = chunk.id
                ass_dict["work_id"] = work.id
                assignments.append(ass_dict)
                
                # Добавляем в контекст как "виртуальное" назначение, чтобы следующие чанки учитывали это
                self.context.add_virtual_assignment(ass_dict)
            else:
                failed.append({"chunk_id": chunk.id, "work_id": work.id, "reason": "No slot"})
                
        # 4. Сохраняем сессию
        stats = {
            "total": len(sorted_queue),
            "assigned": len(assignments),
            "failed": len(failed),
            "details": failed
        }
        
        session = PlanningSession(
            user_id=user_id,
            strategy=strategy_enum,
            assignments=assignments,
            stats=stats,
            status=PlanningSessionStatus.DRAFT
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def apply_session(self, session_id: str) -> dict:
        """Применить сессию"""
        session = await self.db.get(PlanningSession, session_id)
        if not session or session.status != PlanningSessionStatus.DRAFT:
            return {"success": False, "error": "Invalid session"}
            
        applied = 0
        work_ids = set()
        
        for ass in session.assignments:
            chunk = await self._get_chunk(ass["chunk_id"])
            if chunk and chunk.status == ChunkStatus.CREATED:
                chunk.assigned_engineer_id = ass["engineer_id"]
                chunk.assigned_date = date.fromisoformat(ass["date"])
                chunk.assigned_start_time = ass["start_time"]
                chunk.status = ChunkStatus.PLANNED
                work_ids.add(ass["work_id"])
                applied += 1
                
        session.status = PlanningSessionStatus.APPLIED
        await self.db.flush()
        
        # Обновляем статусы работ
        for wid in work_ids:
            await self._update_work_status(wid)
            
        return {"success": True, "applied_count": applied}

    async def cancel_session(self, session_id: str) -> dict:
        """Отменить сессию планирования"""
        session = await self.db.get(PlanningSession, session_id)
        if not session:
            return {"success": False, "error": "Session not found"}
            
        if session.status == PlanningSessionStatus.APPLIED:
            # Откатываем назначения
            work_ids = set()
            for ass in session.assignments:
                chunk = await self._get_chunk(ass["chunk_id"])
                if chunk and chunk.status == ChunkStatus.PLANNED:
                    chunk.assigned_engineer_id = None
                    chunk.assigned_date = None
                    chunk.assigned_start_time = None
                    chunk.status = ChunkStatus.CREATED
                    work_ids.add(ass["work_id"])
            
            # Обновляем статусы работ
            for wid in work_ids:
                await self._update_work_status(wid)
        
        session.status = PlanningSessionStatus.CANCELLED
        await self.db.flush()
        return {"success": True}

    # ================= PRIVATE / HELPERS =================

    async def _find_slot_for_single_chunk(
        self, 
        chunk: WorkChunk, 
        work: Work, 
        strategy,
        preferred_engineer_id: str | None = None
    ) -> SlotSuggestion | None:
        
        # Определяем constraints (даты)
        start_date, end_date = await self._get_date_window(chunk, work)
        
        # Определяем кандидатов (инженеров)
        dc_id = chunk.data_center_id or work.data_center_id
        engineers = await self.context.get_candidate_engineers(dc_id, preferred_engineer_id)
        
        if not engineers:
            return None
            
        # Собираем все возможные слоты от всех инженеров
        all_candidates = []
        for eng in engineers:
            slots = await self.engine.find_available_slots(
                eng, chunk, work, start_date, end_date
            )
            all_candidates.extend(slots)
            
        # Стратегия выбирает лучший
        return await strategy.select_best_slot(all_candidates)

    async def _get_date_window(self, chunk: WorkChunk, work: Work) -> tuple[date, date]:
        """Расчет окна дат с учетом зависимостей"""
        today = date.today()
        
        if work.work_type == WorkType.SUPPORT:
            d = work.target_date or today
            return d, d
            
        start = today
        end = work.due_date or (today + timedelta(days=30))
        
        # Зависимости
        # (Упрощенно: если есть зависимость, сдвигаем start)
        # TODO: Можно оптимизировать и кешировать граф зависимостей
        prev_chunks = await self._get_prev_chunks(chunk.id)
        max_prev_date = None
        for pch in prev_chunks:
            # Учитываем только уже назначенные
            if pch.assigned_date:
                if max_prev_date is None or pch.assigned_date > max_prev_date:
                    max_prev_date = pch.assigned_date
        
        if max_prev_date:
            start = max(start, max_prev_date + timedelta(days=1))
            
        return start, end

    async def _get_prev_chunks(self, chunk_id: str) -> list[WorkChunk]:
        """Получить чанки, от которых зависит текущий"""
        res = await self.db.execute(
            select(WorkChunk)
            .join(ChunkLink, ChunkLink.chunk_id == WorkChunk.id) # Это входящие связи? Нет, chunk_id -> linked_chunk_id
            # Нам нужно: кто ссылается на нас как DEPENDENCY? Или мы ссылаемся?
            # Схема: ChunkLink(chunk_id, linked_chunk_id). 
            # Dependency: chunk_id зависит от linked_chunk_id? Или наоборот?
            # В модели: 
            #   dependency: Зависимость - этап B только после этапа A
            #   Обычно link(A, B) -> A before B? Или B depends on A?
            #   В SchedulingServiceV2 было: outgoing links -> depends_on_ids.
            #   Если chunk имеет outgoing link типа DEPENDENCY к linked, значит он зависит от linked?
            #   Проверим SchedulingServiceV2._get_chunk_dependencies:
            #       outgoing -> link.linked_chunk_id in depends_on_ids
            #   Значит: chunk --(depends on)--> linked
            .where(
                WorkChunk.id.in_(
                    select(ChunkLink.linked_chunk_id)
                    .where(
                        and_(
                            ChunkLink.chunk_id == chunk_id,
                            ChunkLink.link_type == ChunkLinkType.DEPENDENCY
                        )
                    )
                )
            )
        )
        return list(res.scalars().all())

    async def _get_chunk(self, cid: str) -> WorkChunk | None:
        result = await self.db.execute(
            select(WorkChunk)
            .options(selectinload(WorkChunk.tasks))
            .where(WorkChunk.id == cid)
        )
        return result.scalar_one_or_none()
        
    async def _get_work(self, wid: str) -> Work | None:
        return await self.db.get(Work, wid)

    async def _get_unassigned_chunks(self) -> list[tuple[WorkChunk, Work]]:
        res = await self.db.execute(
            select(WorkChunk, Work)
            .join(Work)
            .options(selectinload(WorkChunk.tasks))
            .where(WorkChunk.status == ChunkStatus.CREATED)
        )
        return list(res.all())

    async def _get_preferred_engineer(self, work_id: str, current_assignments: list[dict]) -> str | None:
        """Найти инженера, который уже делает что-то в этой работе"""
        # 1. Из текущей сессии
        for ass in current_assignments:
            if ass["work_id"] == work_id:
                return ass["engineer_id"]
        
        # 2. Из БД (уже назначенные чанки)
        res = await self.db.execute(
            select(WorkChunk.assigned_engineer_id)
            .where(
                and_(
                    WorkChunk.work_id == work_id,
                    WorkChunk.assigned_engineer_id.is_not(None)
                )
            )
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def _update_work_status(self, work_id: str):
        # Простая логика обновления статуса
        # (Можно расширить до полного автомата)
        work = await self._get_work(work_id)
        if not work: return
        
        chunks_res = await self.db.execute(select(WorkChunk).where(WorkChunk.work_id == work_id))
        chunks = chunks_res.scalars().all()
        
        if not chunks: return
        
        statuses = set(c.status for c in chunks)
        
        new_status = work.status
        
        # Если есть In Progress
        if ChunkStatus.IN_PROGRESS in statuses:
            new_status = WorkStatus.IN_PROGRESS
        # Если все Completed
        elif all(s == ChunkStatus.COMPLETED for s in statuses):
            new_status = WorkStatus.COMPLETED
        # Если есть назначенные
        elif ChunkStatus.PLANNED in statuses or ChunkStatus.ASSIGNED in statuses:
            new_status = WorkStatus.ASSIGNED # Или Scheduling, зависит от бизнес-логики
            # По доке: "Если есть назначенные чанки... work.status минимум assigned"
            # Но если часть Created? -> Scheduling
            if ChunkStatus.CREATED in statuses:
                new_status = WorkStatus.SCHEDULING
            else:
                new_status = WorkStatus.ASSIGNED
                
        if new_status != work.status:
            work.status = new_status
            await self.db.flush()
