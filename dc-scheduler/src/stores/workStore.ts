import { create } from 'zustand';
import type { Work, WorkChunk, ChunkStatus, SchedulableItem } from '../types';
import { api } from '../api/client';

type GroupBy = 'work' | 'dc' | 'priority';

// Helper to create SchedulableItem from chunk (for general works)
const chunkToSchedulable = (chunk: WorkChunk, work: Work): SchedulableItem => ({
  id: chunk.id,
  type: 'chunk',
  title: chunk.title,
  durationHours: chunk.durationHours,
  workId: work.id,
  workName: work.name,
  workType: work.workType,
  priority: work.priority,
  dataCenterId: chunk.dataCenterId || chunk.constraints?.dataCenterId,
  status: chunk.status,
  order: chunk.order,
  assignedEngineerId: chunk.assignedEngineerId,
  assignedDate: chunk.assignedDate,
  assignedStartTime: chunk.assignedStartTime,
  tasks: chunk.tasks,
  links: chunk.links,
  constraints: chunk.constraints,
});

// Helper to create SchedulableItem from support work (uses chunk if available)
const supportChunkToSchedulable = (chunk: WorkChunk, work: Work): SchedulableItem => ({
  id: chunk.id,
  type: 'support',
  title: work.name,
  durationHours: chunk.durationHours || work.durationHours || 4,
  workId: work.id,
  workName: work.name,
  workType: 'support',
  priority: work.priority,
  dataCenterId: chunk.dataCenterId || work.dataCenterId,
  status: chunk.status,
  // Planned support visit date/time from work
  targetDate: work.targetDate,
  targetTime: work.targetTime,
  contactInfo: work.contactInfo,
  // Current assignment (if already planned/assigned)
  assignedEngineerId: chunk.assignedEngineerId,
  assignedDate: chunk.assignedDate,
  assignedStartTime: chunk.assignedStartTime,
  constraints: chunk.constraints,
});

// Fallback for support works without chunks (legacy)
const supportToSchedulable = (work: Work): SchedulableItem => ({
  id: `support:${work.id}`,
  type: 'support',
  title: work.name,
  durationHours: work.durationHours || 4,
  workId: work.id,
  workName: work.name,
  workType: 'support',
  priority: work.priority,
  dataCenterId: work.dataCenterId,
  status: work.status,
  // Planned support visit date/time from work
  targetDate: work.targetDate,
  targetTime: work.targetTime,
  contactInfo: work.contactInfo,
});

interface WorkState {
  works: Work[];
  chunks: WorkChunk[];
  isLoading: boolean;
  error: string | null;
  groupBy: GroupBy;
  
  setGroupBy: (groupBy: GroupBy) => void;
  fetchWorks: () => Promise<void>;
  
  // CRUD
  addWork: (work: Partial<Work>) => Promise<Work | null>;
  updateWork: (workId: string, updates: Partial<Work>) => Promise<void>;
  deleteWork: (workId: string) => Promise<void>;
  
  // Chunks
  addChunk: (chunk: Partial<WorkChunk>) => Promise<void>;
  updateChunk: (workId: string, chunkId: string, updates: Partial<WorkChunk>) => Promise<void>;
  deleteChunk: (workId: string, chunkId: string) => Promise<void>;
  
  // Planning
  planItem: (itemId: string, engineerId: string, date: string, slotStart: number) => void;
  unplanItem: (itemId: string) => void;
  confirmPlannedItems: () => Promise<void>;
  cancelAllPlannedItems: () => Promise<void>;
  hasPlannedItems: () => boolean;
  getPlannedItemsCount: () => number;
  
  // Get schedulable items for sidebar
  getSchedulableItems: () => SchedulableItem[];
  getPendingItems: () => SchedulableItem[];
  
  // Validate assignment constraints
  validateAssignment: (itemId: string, date: string) => { valid: boolean; error?: string };
  
  // Sync setters
  setWorks: (works: Work[]) => void;
  setChunks: (chunks: WorkChunk[]) => void;
  
  // Sync actions
  syncWorkCreated: (work: Work) => void;
  syncWorkUpdated: (work: any) => void;
  syncWorkDeleted: (workId: string) => void;
  syncChunkCreated: (chunk: WorkChunk) => void;
  syncChunkUpdated: (chunk: WorkChunk) => void;
  syncChunkDeleted: (chunkId: string) => void;
}

export const useWorkStore = create<WorkState>((set, get) => ({
  works: [],
  chunks: [],
  isLoading: false,
  error: null,
  groupBy: 'work',
  
  setWorks: (works) => set({ works }),
  setChunks: (chunks) => set({ chunks }),
  
  syncWorkCreated: (work) => set((state) => {
    if (state.works.some(w => w.id === work.id)) return state;
    return { works: [...state.works, work] };
  }),
  
  syncWorkUpdated: (work) => set((state) => {
    // 1. Handle partial updates (tasks)
    if (work.taskCreated || work.taskUpdated || work.taskDeleted || work.tasksCreated) {
      const works = state.works.map(w => {
        if (w.id === work.id) {
          const currentTasks = w.tasks || [];
          let newTasks = currentTasks;
          
          if (work.taskCreated) {
            newTasks = [...currentTasks, work.taskCreated];
          } else if (work.taskUpdated) {
            newTasks = currentTasks.map(t => t.id === work.taskUpdated.id ? work.taskUpdated : t);
          } else if (work.taskDeleted) {
            newTasks = currentTasks.filter(t => t.id !== work.taskDeleted);
          }
          
          return { ...w, tasks: newTasks };
        }
        return w;
      });
      return { works };
    }

    // 2. Validate full update
    if (!work.name || !work.workType) {
      // Ignore incomplete updates that are not recognized partial updates
      return {};
    }

    // 3. Full update
    const works = state.works.map((w) => (w.id === work.id ? work : w));
    let chunks = state.chunks;
    // If work update contains chunks, sync them too
    if (work.chunks && work.chunks.length > 0) {
        chunks = chunks.filter(c => c.workId !== work.id);
        chunks = [...chunks, ...work.chunks];
    }
    return { works, chunks };
  }),
  
  syncWorkDeleted: (workId) => set((state) => ({
    works: state.works.filter((w) => w.id !== workId),
    chunks: state.chunks.filter((c) => c.workId !== workId),
  })),
  
  syncChunkCreated: (chunk) => set((state) => {
    // Add to flat list
    if (state.chunks.some(c => c.id === chunk.id)) return state;
    const chunks = [...state.chunks, chunk];
    // Add to work's chunk list
    const works = state.works.map(w => {
        if (w.id === chunk.workId) {
            const currentChunks = w.chunks || [];
            return { ...w, chunks: [...currentChunks, chunk] };
        }
        return w;
    });
    return { works, chunks };
  }),
  
  syncChunkUpdated: (chunk) => set((state) => {
    // Update flat list
    const chunkExists = state.chunks.some(c => c.id === chunk.id);
    let chunks = state.chunks;
    if (chunkExists) {
        chunks = chunks.map(c => c.id === chunk.id ? chunk : c);
    } else {
        chunks = [...chunks, chunk];
    }
    
    // Update work's chunk list
    const works = state.works.map(w => {
        if (w.id === chunk.workId) {
            const currentChunks = w.chunks || [];
            const chunkInWork = currentChunks.some(c => c.id === chunk.id);
            let newChunks = currentChunks;
            if (chunkInWork) {
                newChunks = currentChunks.map(c => c.id === chunk.id ? chunk : c);
            } else {
                newChunks = [...newChunks, chunk];
            }
            return { ...w, chunks: newChunks };
        }
        return w;
    });
    return { works, chunks };
  }),
  
  syncChunkDeleted: (chunkId) => set((state) => {
    const chunks = state.chunks.filter(c => c.id !== chunkId);
    const works = state.works.map(w => {
        if (w.chunks?.some(c => c.id === chunkId)) {
            return { ...w, chunks: w.chunks.filter(c => c.id !== chunkId) };
        }
        return w;
    });
    return { works, chunks };
  }),

  setGroupBy: (groupBy) => set({ groupBy }),
  
  fetchWorks: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.works.list({ page_size: 100 });
      const works = response.items;
      const chunks = works.flatMap((w: Work) => w.chunks || []);
      set({ works, chunks, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
  
  addWork: async (workData) => {
    try {
      const newWork = await api.works.create(workData);
      set((state) => {
        if (state.works.some(w => w.id === newWork.id)) return state;
        return { works: [...state.works, newWork] };
      });
      return newWork;
    } catch (error: any) {
      console.error('Failed to add work:', error);
      return null;
    }
  },
  
  updateWork: async (workId, updates) => {
    try {
      const updatedWork = await api.works.update(workId, updates);
      set((state) => ({
        works: state.works.map((w) => (w.id === workId ? updatedWork : w)),
      }));
    } catch (error: any) {
      console.error('Failed to update work:', error);
    }
  },
  
  deleteWork: async (workId) => {
    try {
      await api.works.delete(workId);
      set((state) => ({
        works: state.works.filter(w => w.id !== workId),
        chunks: state.chunks.filter(c => c.workId !== workId),
      }));
    } catch (error: any) {
      console.error('Failed to delete work:', error);
    }
  },
  
  addChunk: async (chunkData) => {
    try {
      if (!chunkData.workId) return;
      const workId = chunkData.workId;
      const payload = {
        title: chunkData.title,
        description: chunkData.description,
        order: chunkData.order,
        dataCenterId: chunkData.dataCenterId,
      };
      const newChunk = await api.works.createChunk(workId, payload);
      set((state) => ({ 
        chunks: [...state.chunks, newChunk],
      }));
    } catch (error: any) {
      console.error('Failed to add chunk:', error);
    }
  },
  
  updateChunk: async (workId, chunkId, updates) => {
    try {
      const updatedChunk = await api.works.updateChunk(workId, chunkId, updates);
      set((state) => ({
        chunks: state.chunks.map((c) => (c.id === chunkId ? updatedChunk : c)),
      }));
    } catch (error: any) {
      console.error('Failed to update chunk:', error);
    }
  },
  
  deleteChunk: async (workId, chunkId) => {
    try {
      await api.works.deleteChunk(workId, chunkId);
      set((state) => ({
        chunks: state.chunks.filter(c => c.id !== chunkId),
      }));
    } catch (error: any) {
      console.error('Failed to delete chunk:', error);
    }
  },
  
  // Validate assignment constraints for an item
  validateAssignment: (itemId: string, date: string) => {
    const state = get();
    const targetDate = new Date(date);
    
    if (itemId.startsWith('support:')) {
      // Support work (Legacy or manually created via store helper): must be on target date
      const workId = itemId.replace('support:', '');
      const work = state.works.find(w => w.id === workId);
      if (!work) return { valid: false, error: 'Работа не найдена' };
      
      if (work.targetDate && date !== work.targetDate) {
        return { valid: false, error: `Сопровождение можно назначить только на ${work.targetDate}` };
      }
    } else {
      // Chunk: check work's due date
      const chunk = state.chunks.find(c => c.id === itemId);
      if (!chunk) return { valid: false, error: 'Этап не найден' };
      
      const work = state.works.find(w => w.id === chunk.workId);
      if (!work) return { valid: false, error: 'Работа не найдена' };
      
      // For support chunks also check target date
      if (work.workType === 'support' && work.targetDate && date !== work.targetDate) {
         return { valid: false, error: `Сопровождение можно назначить только на ${work.targetDate}` };
      }

      if (work.dueDate && targetDate > new Date(work.dueDate)) {
        return { valid: false, error: `Этап нельзя назначить позже дедлайна ${work.dueDate}` };
      }
      
      // TODO: Check chunk links (dependencies and sync) when implemented
    }
    
    return { valid: true };
  },
  
  // Get all schedulable items
  getSchedulableItems: () => {
    const state = get();
    const items: SchedulableItem[] = [];
    
    state.works.forEach(work => {
      // General works: add their chunks (only if work is ready for scheduling)
      if (work.workType === 'general' && ['ready', 'scheduling', 'in_progress'].includes(work.status)) {
        const workChunks = state.chunks.filter(c => c.workId === work.id);
        workChunks.forEach(chunk => {
          items.push(chunkToSchedulable(chunk, work));
        });
      } 
      // Support: add chunks if exist, otherwise add work itself (legacy)
      else if (work.workType === 'support' && ['draft', 'created', 'scheduling'].includes(work.status)) {
         const workChunks = state.chunks.filter(c => c.workId === work.id);
         if (workChunks.length > 0) {
            workChunks.forEach(chunk => {
                items.push(supportChunkToSchedulable(chunk, work));
            });
         } else {
             // Fallback for legacy support works without chunks
             items.push(supportToSchedulable(work));
         }
      }
    });
    
    return items;
  },
  
  // Get pending items (not yet assigned)
  getPendingItems: () => {
    const items = get().getSchedulableItems();
    return items.filter(item => {
      if (item.type === 'chunk') {
        return item.status === 'created';
      } else {
        // Support: pending if not assigned
        return !['assigned', 'in_progress', 'completed'].includes(item.status as string);
      }
    });
  },
  
  // Plan an item - local state only until confirmed
  planItem: (itemId: string, engineerId: string, date: string, slotStart: number) => {
    const state = get();
    
    // Validate constraints first
    const validation = get().validateAssignment(itemId, date);
    if (!validation.valid) {
      console.error('Assignment validation failed:', validation.error);
      return;
    }
    
    // Find existing planned/assigned items for this engineer on this date
    const existingChunks = state.chunks.filter(c => 
      (c.status === 'planned' || c.status === 'assigned') && 
      c.assignedEngineerId === engineerId && 
      c.assignedDate === date
    ).sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
    
    // Calculate start time: after all existing chunks
    let startTime = slotStart;
    existingChunks.forEach(c => {
      const endTime = (c.assignedStartTime ?? 0) + c.durationHours;
      if (endTime > startTime) startTime = endTime;
    });
    
    if (itemId.startsWith('support:')) {
      // Planning a support work
      const workId = itemId.replace('support:', '');
      set((state) => ({
        works: state.works.map(w => 
          w.id === workId
            ? { ...w, status: 'scheduling' as const }
            : w
        ),
      }));
    } else {
      // Planning a chunk
      set((state) => ({
        chunks: state.chunks.map((c) => 
          c.id === itemId 
            ? { 
                ...c, 
                status: 'planned' as ChunkStatus,
                assignedEngineerId: engineerId,
                assignedDate: date,
                assignedStartTime: startTime,
              } 
            : c
        ),
      }));
    }
  },
  
  // Remove planning from an item
  unplanItem: (itemId: string) => {
    if (itemId.startsWith('support:')) {
      const workId = itemId.replace('support:', '');
      set((state) => ({
        works: state.works.map(w => 
          w.id === workId
            ? { ...w, status: 'created' as const }
            : w
        ),
      }));
    } else {
      set((state) => ({
        chunks: state.chunks.map((c) => 
          c.id === itemId && c.status === 'planned'
            ? { 
                ...c, 
                status: 'created' as ChunkStatus,
                assignedEngineerId: undefined,
                assignedDate: undefined,
                assignedStartTime: undefined,
              } 
            : c
        ),
      }));
    }
  },
  
  // Confirm all planned items
  confirmPlannedItems: async () => {
    try {
      await api.works.confirmPlanned();
      await get().fetchWorks();
    } catch (error: any) {
      console.error('Failed to confirm planned items:', error);
    }
  },
  
  // Check if there are any planned items
  hasPlannedItems: () => {
    const state = get();
    return state.chunks.some(c => c.status === 'planned');
  },
  
  // Get count of planned items
  getPlannedItemsCount: () => {
    const state = get();
    return state.chunks.filter(c => c.status === 'planned').length;
  },
  
  // Cancel all planned items (reset to created)
  cancelAllPlannedItems: async () => {
    const state = get();
    const plannedChunks = state.chunks.filter(c => c.status === 'planned');
    
    // Unassign each planned chunk via API
    for (const chunk of plannedChunks) {
      try {
        await api.works.unassignChunk(chunk.workId, chunk.id);
      } catch (error) {
        console.error(`Failed to unassign chunk ${chunk.id}:`, error);
      }
    }
    
    // Update local state
    set((state) => ({
      chunks: state.chunks.map(c => 
        c.status === 'planned' 
          ? { ...c, status: 'created' as const, assignedEngineerId: undefined, assignedDate: undefined, assignedStartTime: undefined }
          : c
      ),
    }));
  },
}));
