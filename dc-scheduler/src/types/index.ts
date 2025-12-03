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

export interface Work {
  id: string;
  name: string;
  description: string;
  dueDate: string; // ISO date
  totalDurationHours: number;
  dataCenterId?: string; // Default DC for this work
  priority: Priority;
}

export type ChunkStatus = 'pending' | 'planned' | 'assigned' | 'completed';

export interface WorkChunk {
  id: string;
  workId: string;
  title: string;
  durationHours: number;
  order: number;
  status: ChunkStatus;
  assignedDate?: string; // YYYY-MM-DD
  assignedEngineerId?: string;
  assignedStartTime?: number; // Hour when chunk starts
  slotOrder?: number; // Order within the slot for reordering
  dataCenterId?: string; // Can override work's DC
  priority?: Priority; // Inherits from work if not set
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
