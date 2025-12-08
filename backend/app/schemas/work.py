from pydantic import BaseModel, Field
from datetime import datetime, date
from enum import Enum


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WorkType(str, Enum):
    GENERAL = "general"
    SUPPORT = "support"


class WorkStatus(str, Enum):
    DRAFT = "draft"
    CREATED = "created"
    READY = "ready"
    SCHEDULING = "scheduling"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ChunkStatus(str, Enum):
    CREATED = "created"
    PLANNED = "planned"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ChunkLinkType(str, Enum):
    SYNC = "sync"
    DEPENDENCY = "dependency"


class SlotCompatibility(str, Enum):
    """Совместимость слота для drag-and-drop (светофор)"""
    GREEN = "green"    # Полностью подходит
    YELLOW = "yellow"  # Допустимо с предупреждением
    RED = "red"        # Заблокировано


class PlanningStrategy(str, Enum):
    """Стратегии автоназначения"""
    BALANCED = "balanced"  # Равномерное распределение
    DENSE = "dense"        # Плотная загрузка
    SLA = "sla"            # Приоритет критичных задач


class ChunkConstraints(BaseModel):
    """
    Ограничения для чанка, используемые фронтендом для валидации drag-and-drop.
    Рассчитываются на бэкенде и отдаются вместе с чанком.
    """
    # Разрешённые регионы (ID регионов, где можно ставить чанк)
    allowed_region_ids: list[str] = []
    
    # Окно дат
    min_date: date | None = None  # Самая ранняя дата (из-за зависимостей)
    max_date: date | None = None  # Самая поздняя дата (дедлайн работы)
    
    # Фиксированная дата/время (для support или жёстких ограничений)
    fixed_date: date | None = None
    fixed_time: int | None = None  # 0-23
    
    # Связи с другими чанками
    depends_on_chunk_ids: list[str] = []  # Зависимости (Finish-to-Start)
    sync_chunk_ids: list[str] = []         # Синхронные (Start-to-Start)
    
    # Длительность
    duration_hours: int = 0
    
    # ID дата-центра (для проверки региона)
    data_center_id: str | None = None
    
    class Config:
        from_attributes = True


class TaskStatus(str, Enum):
    TODO = "todo"
    DONE = "done"
    PARTIAL = "partial"
    CANCELLED = "cancelled"


# Work Task Schemas (план работ / чеклист)
class WorkTaskBase(BaseModel):
    title: str
    description: str | None = None
    data_center_id: str | None = None
    estimated_hours: int = 1
    quantity: int = 1
    order: int = 0


class WorkTaskCreate(WorkTaskBase):
    pass


class WorkTaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    data_center_id: str | None = None
    estimated_hours: int | None = None
    quantity: int | None = None
    order: int | None = None
    status: TaskStatus | None = None
    completion_note: str | None = None
    chunk_id: str | None = None


class WorkTaskResponse(WorkTaskBase):
    id: str
    work_id: str
    chunk_id: str | None = None
    status: TaskStatus
    completion_note: str | None = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Chunk Link Schemas
class ChunkLinkBase(BaseModel):
    linked_chunk_id: str
    link_type: ChunkLinkType


class ChunkLinkCreate(ChunkLinkBase):
    pass


class ChunkLinkResponse(ChunkLinkBase):
    id: str
    chunk_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# Work Chunk Schemas (Этапы)
class WorkChunkBase(BaseModel):
    title: str
    description: str | None = None
    order: int = 0
    data_center_id: str | None = None


class WorkChunkCreate(WorkChunkBase):
    task_ids: list[str] = []  # Задачи для включения в этап


class WorkChunkUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None
    status: ChunkStatus | None = None
    data_center_id: str | None = None
    
    # Назначение
    assigned_engineer_id: str | None = None
    assigned_date: date | None = None
    assigned_start_time: int | None = None
    
    # Optimistic Locking
    version: int | None = None


class WorkChunkResponse(WorkChunkBase):
    id: str
    work_id: str
    status: ChunkStatus
    duration_hours: int  # Вычисляется из задач
    
    assigned_engineer_id: str | None = None
    assigned_date: date | None = None
    assigned_start_time: int | None = None
    
    version: int
    
    # Задачи этапа
    tasks: list[WorkTaskResponse] = []
    # Связи этапа
    links: list[ChunkLinkResponse] = []
    
    # Ограничения для drag-and-drop (светофор)
    constraints: ChunkConstraints | None = None
    
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Attachment Schemas
class WorkAttachmentResponse(BaseModel):
    id: str
    work_id: str
    filename: str
    minio_key: str
    content_type: str | None = None
    size: int
    uploaded_by_id: str | None = None
    created_at: datetime
    
    class Config:
        from_attributes = True


# Work Schemas
class WorkBase(BaseModel):
    name: str
    description: str | None = None
    work_type: WorkType = WorkType.GENERAL
    priority: Priority = Priority.MEDIUM


class WorkCreate(WorkBase):
    """
    Создание работы или сопровождения.
    
    Для general: due_date (опционально)
    Для support: data_center_id, target_date, duration_hours (обязательно), target_time (опционально)
    """
    # Для general
    due_date: date | None = None
    
    # Для support
    data_center_id: str | None = None
    target_date: date | None = None
    target_time: int | None = None  # 0-23
    duration_hours: int | None = None  # 1-12
    contact_info: str | None = None
    
    author_id: str | None = None


class WorkUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    work_type: WorkType | None = None
    priority: Priority | None = None
    status: WorkStatus | None = None
    
    # Для general
    due_date: date | None = None
    
    # Для support
    data_center_id: str | None = None
    target_date: date | None = None
    target_time: int | None = None
    duration_hours: int | None = None
    contact_info: str | None = None
    
    # Optimistic Locking
    version: int | None = None


class WorkResponse(WorkBase):
    id: str
    status: WorkStatus
    author_id: str | None = None
    version: int
    
    # Для general
    due_date: date | None = None
    
    # Для support
    data_center_id: str | None = None
    target_date: date | None = None
    target_time: int | None = None
    duration_hours: int | None = None
    contact_info: str | None = None
    
    # Вложенные сущности
    tasks: list[WorkTaskResponse] = []
    chunks: list[WorkChunkResponse] = []
    attachments: list[WorkAttachmentResponse] = []
    
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class WorkListResponse(BaseModel):
    items: list[WorkResponse]
    total: int
    page: int
    page_size: int
