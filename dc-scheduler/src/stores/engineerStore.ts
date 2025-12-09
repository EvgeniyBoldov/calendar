import { create } from 'zustand';
import type { Engineer, TimeSlot } from '../types';
import { addDays, format } from 'date-fns';
import { api } from '../api/client';

interface EngineerState {
  engineers: Engineer[];
  isLoading: boolean;
  error: string | null;
  
  fetchEngineers: () => Promise<void>;
  addEngineer: (engineer: Partial<Engineer>) => Promise<void>;
  updateEngineer: (id: string, updates: Partial<Engineer>) => Promise<void>;
  deleteEngineer: (id: string) => Promise<void>;
  
  addSlot: (engineerId: string, date: string, slot: TimeSlot) => Promise<void>;
  removeSlot: (engineerId: string, date: string, slotIndex: number) => Promise<void>; // Note: backend needs slotId, not index
  
  applySchedulePattern: (
    engineerId: string,
    startDate: Date,
    weeks: number,
    pattern: { dayOfWeek: number; slots: TimeSlot[] }[]
  ) => Promise<void>;
  
  // Sync setter
  setEngineers: (engineers: Engineer[]) => void;
}

export const useEngineerStore = create<EngineerState>((set, get) => ({
  engineers: [],
  isLoading: false,
  error: null,
  
  setEngineers: (engineers) => set({ engineers }),
  
  fetchEngineers: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.engineers.list();
      // Transform backend response to frontend structure
      // Response is already camelCased by api client
      const engineers = response.map((e: any) => ({
        id: e.id,
        name: e.name,
        regionId: e.regionId,
        schedule: e.timeSlots.reduce((acc: Record<string, TimeSlot[]>, slot: any) => {
          const dateKey = slot.date;
          if (!acc[dateKey]) acc[dateKey] = [];
          acc[dateKey].push({ 
            id: slot.id,
            start: slot.startHour, 
            end: slot.endHour 
          });
          return acc;
        }, {})
      }));
      set({ engineers, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
  
  addEngineer: async (engineerData) => {
    try {
      const created = await api.engineers.create(engineerData);

      // Преобразуем ответ так же, как в fetchEngineers / useSync
      const transformed: Engineer = {
        id: created.id,
        name: created.name,
        regionId: created.regionId,
        schedule: (created.timeSlots || []).reduce((acc: Record<string, TimeSlot[]>, slot: any) => {
          const dateKey = slot.date;
          if (!acc[dateKey]) acc[dateKey] = [];
          acc[dateKey].push({
            id: slot.id,
            start: slot.startHour,
            end: slot.endHour,
          });
          return acc;
        }, {} as Record<string, TimeSlot[]>)
      };

      // Защита от дублей: engineer также придёт через realtime-sync
      const state = get();
      const existingIndex = state.engineers.findIndex((e) => e.id === transformed.id);
      if (existingIndex >= 0) {
        const updated = [...state.engineers];
        updated[existingIndex] = transformed;
        set({ engineers: updated });
      } else {
        set({ engineers: [...state.engineers, transformed] });
      }
    } catch (error: any) {
      console.error('Failed to add engineer:', error);
    }
  },
  
  updateEngineer: async (id, updates) => {
    try {
      await api.engineers.update(id, updates);
      await get().fetchEngineers();
    } catch (error: any) {
      console.error('Failed to update engineer:', error);
    }
  },
  
  deleteEngineer: async (id) => {
    try {
      await api.engineers.delete(id);
      set((state) => ({
        engineers: state.engineers.filter(e => e.id !== id)
      }));
    } catch (error: any) {
      console.error('Failed to delete engineer:', error);
    }
  },
  
  addSlot: async (engineerId, date, slot) => {
    try {
      await api.engineers.addSlot(engineerId, {
        date: date,
        start_hour: slot.start,
        end_hour: slot.end
      });
      await get().fetchEngineers();
    } catch (error: any) {
      console.error('Failed to add slot:', error);
    }
  },

  removeSlot: async (engineerId, date, slotIndex) => {
    try {
      // Need to find slotId first
      const engineer = get().engineers.find(e => e.id === engineerId);
      const slots = engineer?.schedule[date] || [];
      const slot = slots[slotIndex];
      
      if (slot && (slot as any).id) {
        await api.engineers.removeSlot(engineerId, (slot as any).id);
        await get().fetchEngineers();
      }
    } catch (error: any) {
      console.error('Failed to remove slot:', error);
    }
  },

  applySchedulePattern: async (engineerId, startDate, weeks, pattern) => {
    try {
      // Generate slots to add
      const slotsToAdd = [];
      for (let week = 0; week < weeks; week++) {
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const currentDate = addDays(startDate, week * 7 + dayOffset);
          const dayOfWeek = currentDate.getDay(); // 0 = Sunday
          const dateKey = format(currentDate, 'yyyy-MM-dd');
          
          const dayPattern = pattern.find(p => p.dayOfWeek === dayOfWeek);
          if (dayPattern && dayPattern.slots.length > 0) {
            for (const slot of dayPattern.slots) {
              slotsToAdd.push({
                date: dateKey,
                start_hour: slot.start,
                end_hour: slot.end
              });
            }
          }
        }
      }
      
      // Add slots sequentially (or optimize with bulk API if available)
      // Ideally backend should support bulk add
      for (const slot of slotsToAdd) {
        await api.engineers.addSlot(engineerId, slot);
      }
      
      await get().fetchEngineers();
    } catch (error: any) {
      console.error('Failed to apply schedule pattern:', error);
    }
  },
}));
