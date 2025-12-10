export interface Region {
  id: string;
  name: string;
}

export interface DataCenter {
  id: string;
  regionId: string;
  name: string;
  description: string;
}

export interface TimeSlot {
  id?: string;
  start: number; // Hour 0-23
  end: number;   // Hour 0-24
}

export interface Engineer {
  id: string;
  name: string;
  regionId: string; // Engineer bound to region
  schedule: Record<string, TimeSlot[]>; // date string YYYY-MM-DD -> slots
}

export type Priority = 'low' | 'medium' | 'high' | 'critical';

// Типы работ: general (работа с планом) или support (сопровождение)
export type WorkType = 'general' | 'support';

// Work status flow:
// general: draft -> ready -> scheduling -> in_progress -> completed -> documented
// support: created -> scheduling -> assigned -> completed -> documented
export type WorkStatus = 'draft' | 'created' | 'ready' | 'scheduling' | 'assigned' | 'in_progress' | 'completed' | 'documented';

// Стратегии планирования (должны совпадать с backend PlanningStrategy)
export type PlanningStrategyId = 'balanced' | 'dense' | 'sla';

// Planning Session types
export interface PlanningSessionAssignment {
  chunkId: string;
  engineerId: string;
  date: string;
  startTime: number;
  endTime: number;
}

export interface PlanningSessionStats {
  totalChunks: number;
  assignedChunks: number;
  unassignedChunks: number;
  engineersUsed: number;
}

export interface PlanningSession {
  id: string;
  strategy: PlanningStrategyId;
  status: 'draft' | 'applied' | 'cancelled' | 'expired';
  assignments: PlanningSessionAssignment[];
  stats: PlanningSessionStats;
  createdAt: string;
  expiresAt: string;
}

export interface PlanningSessionListResponse {
  items: PlanningSession[];
  total: number;
}

// Auto-assign response
export interface AutoAssignWorkResponse {
  ok: boolean;
  result: {
    success: boolean;
    assignedCount: number;
    failedCount: number;
    message?: string;
  };
  work: Work;
}

// Тип связи между этапами
export type ChunkLinkType = 'sync' | 'dependency';

// Совместимость слота для drag-and-drop (светофор)
export type SlotCompatibility = 'green' | 'yellow' | 'red';

// Ограничения для чанка (рассчитываются бэкендом)
export interface ChunkConstraints {
  allowedRegionIds: string[];      // Разрешённые регионы
  minDate?: string;                // Самая ранняя дата (из-за зависимостей)
  maxDate?: string;                // Самая поздняя дата (дедлайн)
  fixedDate?: string;              // Фиксированная дата (для support)
  fixedTime?: number;              // Фиксированное время 0-23
  dependsOnChunkIds: string[];     // Зависимости (Finish-to-Start)
  syncChunkIds: string[];          // Синхронные (Start-to-Start)
  durationHours: number;           // Длительность
  dataCenterId?: string;           // ID дата-центра
}

export type AttachmentType = 'work_plan' | 'report' | 'calculation' | 'scheme' | 'photo' | 'other';

export interface WorkAttachment {
  id: string;
  workId: string;
  attachmentType: AttachmentType;
  filename: string;
  minioKey: string;
  contentType?: string;
  size: number;
  uploadedById?: string;
  createdAt: string;
}

export interface Work {
  id: string;
  name: string;
  description?: string;
  workType: WorkType;
  priority: Priority;
  status: WorkStatus;
  version: number;
  authorId?: string;
  authorName?: string;
  
  // === Для general (работа) ===
  dueDate?: string; // Дедлайн (опционально)
  
  // === Для support (сопровождение) ===
  dataCenterId?: string;  // ДЦ (обязательно для support)
  targetDate?: string;    // Дата выезда (обязательно для support)
  targetTime?: number;    // Время начала 0-23 (опционально)
  durationHours?: number; // Продолжительность 1-12ч (обязательно для support)
  contactInfo?: string;   // Контакт для согласования
  
  // Вложенные сущности
  tasks?: WorkTask[];
  chunks?: WorkChunk[];
  attachments?: WorkAttachment[];
}

// Chunk status flow: created -> planned -> assigned -> in_progress -> completed
export type ChunkStatus = 'created' | 'planned' | 'assigned' | 'in_progress' | 'completed';

// Связь между этапами
export interface ChunkLink {
  id: string;
  chunkId: string;
  linkedChunkId: string;
  linkType: ChunkLinkType;
  createdAt: string;
}

// Task status: todo -> done/partial/cancelled
export type TaskStatus = 'todo' | 'done' | 'partial' | 'cancelled';

// Задача внутри работы (план работ / чеклист)
export interface WorkTask {
  id: string;
  workId: string;
  chunkId?: string;
  title: string;
  description?: string;
  dataCenterId?: string;
  estimatedHours: number;
  quantity?: number;
  order: number;
  status: TaskStatus;
  completionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkChunk {
  id: string;
  workId: string;
  title: string;
  description?: string;
  order: number;
  status: ChunkStatus;
  dataCenterId?: string;
  version: number;
  
  // Вычисляемая длительность (сумма задач)
  durationHours: number;
  
  // Назначение
  assignedEngineerId?: string;
  assignedDate?: string;
  assignedStartTime?: number;
  
  // Задачи этапа
  tasks?: WorkTask[];
  // Связи этапа
  links?: ChunkLink[];
  
  // Ограничения для drag-and-drop (светофор)
  constraints?: ChunkConstraints;
}

// For the UI, we need a structure for the calendar slots
export interface CalendarSlot {
  id: string;
  engineerId: string;
  date: string;
  startTime: number;
  endTime: number;
  chunks: WorkChunk[];
}

// Unified item for sidebar: chunk (from general work) or support work
export interface SchedulableItem {
  id: string;
  type: 'chunk' | 'support';
  title: string;
  durationHours: number;
  workId: string;
  workName: string;
  workType: WorkType;
  priority: Priority;
  dataCenterId?: string;
  status: ChunkStatus | WorkStatus;
  
  // For chunks
  order?: number;
  
  // Assignment info
  assignedEngineerId?: string;
  assignedDate?: string;
  assignedStartTime?: number;
  
  // For support: optional time (if not set - needs agreement)
  // Planned date/time of the support visit
  targetDate?: string;
  targetTime?: number;
  contactInfo?: string;
  
  // Tasks (for chunks)
  tasks?: WorkTask[];
  // Links (for chunks)
  links?: ChunkLink[];
  
  // Ограничения для drag-and-drop (светофор)
  constraints?: ChunkConstraints;
}
