from sqlalchemy import String, Text, Integer, ForeignKey, Date, Enum as SQLEnum, BigInteger, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin
import uuid
from datetime import date
from enum import Enum


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WorkType(str, Enum):
    """
    Типы работ:
    - general: Работа с планом (шаги -> этапы -> назначение)
    - support: Сопровождение - выезд в конкретный день
    """
    GENERAL = "general"
    SUPPORT = "support"


class WorkStatus(str, Enum):
    """
    Work status flow:
    
    Для general (работа с планом):
    draft -> ready -> scheduling -> in_progress -> completed
    - draft: Черновик, план ещё не готов
    - ready: План готов, все шаги распределены по этапам
    - scheduling: В процессе назначения инженеров
    - in_progress: В работе
    - completed: Выполнена
    
    Для support (сопровождение):
    created -> scheduling -> assigned -> completed
    - created: Создано
    - scheduling: Ожидает назначения
    - assigned: Назначено инженеру
    - completed: Выполнено
    """
    DRAFT = "draft"
    CREATED = "created"
    READY = "ready"
    SCHEDULING = "scheduling"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DOCUMENTED = "documented"


class ChunkStatus(str, Enum):
    """
    Chunk/Stage status flow:
    created -> planned -> assigned -> in_progress -> completed
    
    - created: Создан, ожидает назначения
    - planned: Запланирован (предварительно)
    - assigned: Назначен инженеру
    - in_progress: Выполняется
    - completed: Выполнен
    """
    CREATED = "created"
    PLANNED = "planned"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ChunkLinkType(str, Enum):
    """
    Тип связи между этапами:
    - sync: Синхронные - выполняются одновременно
    - dependency: Зависимость - этап B только после этапа A
    """
    SYNC = "sync"
    DEPENDENCY = "dependency"


class TaskStatus(str, Enum):
    """
    Статус задачи внутри работы:
    - todo: Надо сделать
    - done: Сделано
    - partial: Частично выполнено
    - cancelled: Отменено (не нужно делать)
    """
    TODO = "todo"
    DONE = "done"
    PARTIAL = "partial"
    CANCELLED = "cancelled"


class AttachmentType(str, Enum):
    """
    Тип вложения к работе:
    - work_plan: План работ (Excel файл для импорта задач)
    - report: Отчёт
    - calculation: Расчёт
    - scheme: Схема
    - photo: Фото
    - other: Прочее
    """
    WORK_PLAN = "work_plan"
    REPORT = "report"
    CALCULATION = "calculation"
    SCHEME = "scheme"
    PHOTO = "photo"
    OTHER = "other"


# ChunkLink model is defined below (not as association table)


class Work(Base, TimestampMixin):
    """
    Работа или Сопровождение.
    
    Работа (general): имеет план из шагов, которые группируются в этапы.
    Сопровождение (support): выезд в конкретный день, без плана.
    """
    __tablename__ = "works"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Тип: general (работа) или support (сопровождение)
    work_type: Mapped[WorkType] = mapped_column(SQLEnum(WorkType), default=WorkType.GENERAL, nullable=False)
    
    priority: Mapped[Priority] = mapped_column(SQLEnum(Priority), default=Priority.MEDIUM, nullable=False)
    status: Mapped[WorkStatus] = mapped_column(SQLEnum(WorkStatus), default=WorkStatus.DRAFT, nullable=False)
    
    # === Для general (работа) ===
    # Дедлайн (опционально)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    # === Для support (сопровождение) ===
    # ДЦ обязателен для сопровождения
    data_center_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("data_centers.id"), nullable=True)
    # Дата выезда (обязательна для support)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Время начала (опционально, если не указано - согласовывается)
    target_time: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Hour 0-23
    # Продолжительность в часах (1-12)
    duration_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Контактное лицо для согласования
    contact_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Optimistic Locking
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    
    # Автор
    author_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    
    # Relationships
    data_center = relationship("DataCenter", back_populates="works")
    author = relationship("User", back_populates="created_works")

    @property
    def author_name(self):
        """Полное имя автора для отображения во фронтенде."""
        if self.author is None:
            return None
        # full_name приоритетнее, затем логин, затем email
        return self.author.full_name or self.author.login or self.author.email
    tasks = relationship("WorkTask", back_populates="work", cascade="all, delete-orphan", order_by="WorkTask.order")
    chunks = relationship("WorkChunk", back_populates="work", cascade="all, delete-orphan", order_by="WorkChunk.order")
    attachments = relationship("WorkAttachment", back_populates="work", cascade="all, delete-orphan")


class WorkChunk(Base, TimestampMixin):
    """
    Этап работы. Группа шагов, назначаемая одному инженеру.
    Этапы могут быть связаны (синхронные или зависимые).
    """
    __tablename__ = "work_chunks"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_id: Mapped[str] = mapped_column(String(36), ForeignKey("works.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[ChunkStatus] = mapped_column(SQLEnum(ChunkStatus), default=ChunkStatus.CREATED, nullable=False)
    
    # ДЦ этапа (наследуется от задач или указывается явно)
    data_center_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("data_centers.id"), nullable=True)
    
    # Optimistic Locking
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # === Назначение ===
    assigned_engineer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("engineers.id"), nullable=True)
    assigned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    assigned_start_time: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Час начала
    
    # Relationships
    work = relationship("Work", back_populates="chunks")
    tasks = relationship("WorkTask", back_populates="chunk", order_by="WorkTask.order")
    assigned_engineer = relationship("Engineer", back_populates="assigned_chunks")
    data_center = relationship("DataCenter")
    
    @property
    def duration_hours(self) -> int:
        """Суммарная длительность всех задач этапа"""
        return sum(task.estimated_hours * task.quantity for task in self.tasks)


class WorkAttachment(Base, TimestampMixin):
    """Вложения к работе (файлы в MinIO)"""
    __tablename__ = "work_attachments"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_id: Mapped[str] = mapped_column(String(36), ForeignKey("works.id"), nullable=False)
    
    # Тип вложения
    attachment_type: Mapped[AttachmentType] = mapped_column(
        SQLEnum(AttachmentType), default=AttachmentType.OTHER, nullable=False
    )
    
    filename: Mapped[str] = mapped_column(String(255), nullable=False)  # Original filename
    minio_key: Mapped[str] = mapped_column(String(512), nullable=False)  # Path in MinIO bucket
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)  # File size in bytes
    
    uploaded_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    
    # Relationships
    work = relationship("Work", back_populates="attachments")
    uploaded_by = relationship("User")


class WorkTask(Base, TimestampMixin):
    """
    Задача внутри работы (план работ / чеклист).
    Задачи группируются в чанки для назначения инженерам.
    """
    __tablename__ = "work_tasks"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_id: Mapped[str] = mapped_column(String(36), ForeignKey("works.id"), nullable=False)
    chunk_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("work_chunks.id"), nullable=True)
    
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # ДЦ где выполняется задача (может отличаться от work.data_center_id)
    data_center_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("data_centers.id"), nullable=True)
    
    # Оценка времени в часах
    estimated_hours: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    
    # Количество
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    
    # Порядок в списке задач
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Статус выполнения
    status: Mapped[TaskStatus] = mapped_column(SQLEnum(TaskStatus), default=TaskStatus.TODO, nullable=False)
    
    # Комментарий инженера при выполнении
    completion_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationships
    work = relationship("Work", back_populates="tasks")
    chunk = relationship("WorkChunk", back_populates="tasks")
    data_center = relationship("DataCenter")


class ChunkLink(Base, TimestampMixin):
    """
    Связь между этапами.
    - sync: Синхронные этапы (выполняются одновременно)
    - dependency: Зависимость (этап B только после этапа A)
    """
    __tablename__ = "chunk_links"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Этап, который имеет связь
    chunk_id: Mapped[str] = mapped_column(String(36), ForeignKey("work_chunks.id"), nullable=False)
    # Связанный этап
    linked_chunk_id: Mapped[str] = mapped_column(String(36), ForeignKey("work_chunks.id"), nullable=False)
    # Тип связи
    link_type: Mapped[ChunkLinkType] = mapped_column(SQLEnum(ChunkLinkType), nullable=False)
    
    # Relationships
    chunk = relationship("WorkChunk", foreign_keys=[chunk_id], backref="outgoing_links")
    linked_chunk = relationship("WorkChunk", foreign_keys=[linked_chunk_id], backref="incoming_links")
