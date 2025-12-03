import { create } from 'zustand';
import type { Work, WorkChunk, ChunkStatus } from '../types';

type GroupBy = 'work' | 'dc' | 'priority';

interface WorkState {
  works: Work[];
  chunks: WorkChunk[];
  groupBy: GroupBy;
  setGroupBy: (groupBy: GroupBy) => void;
  setWorks: (works: Work[]) => void;
  setChunks: (chunks: WorkChunk[]) => void;
  updateWork: (workId: string, updates: Partial<Work>) => void;
  updateChunk: (chunkId: string, updates: Partial<WorkChunk>) => void;
  deleteWork: (workId: string) => void;
  deleteChunk: (chunkId: string) => void;
  addWork: (work: Work) => void;
  addChunk: (chunk: WorkChunk) => void;
  // Planning
  planChunk: (chunkId: string, engineerId: string, date: string, slotStart: number) => void;
  unplanChunk: (chunkId: string) => void;
  confirmPlannedChunks: () => void;
  hasPlannedChunks: () => boolean;
  // Reordering
  reorderChunksInSlot: (engineerId: string, date: string, slotStart: number) => void;
  moveChunkInSlot: (chunkId: string, direction: 'up' | 'down') => void;
}

export const useWorkStore = create<WorkState>((set, get) => ({
  works: [
    { id: 'w1', name: 'Работы 1', description: 'Апгрейд стоек и замена оборудования', dueDate: '2023-11-01', totalDurationHours: 6, dataCenterId: 'dc1', priority: 'high' },
    { id: 'w2', name: 'Работы 2', description: 'Профилактика систем охлаждения', dueDate: '2023-11-02', totalDurationHours: 16, dataCenterId: 'dc1', priority: 'medium' },
  ],
  chunks: [
    { id: 'c1_1', workId: 'w1', title: 'Чанк 1.1', durationHours: 3, order: 1, status: 'pending', dataCenterId: 'dc1' },
    { id: 'c1_2', workId: 'w1', title: 'Чанк 1.2', durationHours: 3, order: 2, status: 'pending', dataCenterId: 'dc1' },
    { id: 'c2_1', workId: 'w2', title: 'Чанк 2.1', durationHours: 8, order: 1, status: 'pending', dataCenterId: 'dc1' },
    { id: 'c2_2', workId: 'w2', title: 'Чанк 2.2', durationHours: 8, order: 2, status: 'pending', dataCenterId: 'dc1' },
  ],
  groupBy: 'work',
  
  setGroupBy: (groupBy) => set({ groupBy }),
  setWorks: (works) => set({ works }),
  setChunks: (chunks) => set({ chunks }),
  
  updateWork: (workId, updates) => set((state) => ({
    works: state.works.map((w) => (w.id === workId ? { ...w, ...updates } : w)),
  })),
  
  updateChunk: (chunkId, updates) => set((state) => ({
    chunks: state.chunks.map((c) => (c.id === chunkId ? { ...c, ...updates } : c)),
  })),
  
  deleteWork: (workId) => set((state) => ({
    works: state.works.filter(w => w.id !== workId),
    chunks: state.chunks.filter(c => c.workId !== workId),
  })),
  
  deleteChunk: (chunkId) => set((state) => ({
    chunks: state.chunks.filter(c => c.id !== chunkId),
  })),
  
  addWork: (work) => set((state) => ({ works: [...state.works, work] })),
  addChunk: (chunk) => set((state) => ({ chunks: [...state.chunks, chunk] })),
  
  // Plan a chunk (not yet confirmed)
  planChunk: (chunkId, engineerId, date, slotStart) => {
    const state = get();
    
    // Find existing planned/assigned chunks for this engineer on this date
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
    
    const maxSlotOrder = Math.max(0, ...existingChunks.map(c => c.slotOrder ?? 0));
    
    set((state) => ({
      chunks: state.chunks.map((c) => 
        c.id === chunkId 
          ? { 
              ...c, 
              status: 'planned' as ChunkStatus,
              assignedEngineerId: engineerId,
              assignedDate: date,
              assignedStartTime: startTime,
              slotOrder: maxSlotOrder + 1,
            } 
          : c
      ),
    }));
  },
  
  // Remove planning from a chunk
  unplanChunk: (chunkId) => set((state) => ({
    chunks: state.chunks.map((c) => 
      c.id === chunkId && c.status === 'planned'
        ? { 
            ...c, 
            status: 'pending' as ChunkStatus,
            assignedEngineerId: undefined,
            assignedDate: undefined,
            assignedStartTime: undefined,
            slotOrder: undefined,
          } 
        : c
    ),
  })),
  
  // Confirm all planned chunks
  confirmPlannedChunks: () => set((state) => ({
    chunks: state.chunks.map((c) => 
      c.status === 'planned' ? { ...c, status: 'assigned' as ChunkStatus } : c
    ),
  })),
  
  // Check if there are any planned chunks
  hasPlannedChunks: () => {
    return get().chunks.some(c => c.status === 'planned');
  },
  
  // Recalculate start times for all chunks in a slot based on their slotOrder
  reorderChunksInSlot: (engineerId, date, slotStart) => set((state) => {
    const slotChunks = state.chunks
      .filter(c => 
        (c.status === 'planned' || c.status === 'assigned') && 
        c.assignedEngineerId === engineerId && 
        c.assignedDate === date && 
        c.assignedStartTime !== undefined
      )
      .sort((a, b) => (a.slotOrder ?? 0) - (b.slotOrder ?? 0));
    
    let currentTime = slotStart;
    const updates: Record<string, number> = {};
    
    slotChunks.forEach((chunk) => {
      updates[chunk.id] = currentTime;
      currentTime += chunk.durationHours;
    });
    
    return {
      chunks: state.chunks.map(c => 
        updates[c.id] !== undefined 
          ? { ...c, assignedStartTime: updates[c.id] }
          : c
      )
    };
  }),
  
  // Move a chunk up or down within its slot
  moveChunkInSlot: (chunkId, direction) => {
    const state = get();
    const chunk = state.chunks.find(c => c.id === chunkId);
    if (!chunk || chunk.status === 'assigned') return; // Can't move confirmed chunks
    
    const slotChunks = state.chunks
      .filter(c => 
        (c.status === 'planned' || c.status === 'assigned') && 
        c.assignedEngineerId === chunk.assignedEngineerId && 
        c.assignedDate === chunk.assignedDate
      )
      .sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
    
    const currentIndex = slotChunks.findIndex(c => c.id === chunkId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= slotChunks.length) return;
    
    // Can't swap with confirmed chunk
    const targetChunk = slotChunks[targetIndex];
    if (targetChunk.status === 'assigned') return;
    
    set((state) => ({
      chunks: state.chunks.map(c => {
        if (c.id === chunkId) return { ...c, slotOrder: targetIndex };
        if (c.id === targetChunk.id) return { ...c, slotOrder: currentIndex };
        return c;
      })
    }));
    
    // Recalculate times
    const slotStart = Math.min(...slotChunks.map(c => c.assignedStartTime ?? 0));
    get().reorderChunksInSlot(chunk.assignedEngineerId!, chunk.assignedDate!, slotStart);
  },
}));
