import { create } from 'zustand';
import type { Engineer, TimeSlot } from '../types';
import { addDays, format } from 'date-fns';

interface EngineerState {
  engineers: Engineer[];
  setEngineers: (engineers: Engineer[]) => void;
  addEngineer: (engineer: Engineer) => void;
  addSlot: (engineerId: string, date: string, slot: TimeSlot) => void;
  removeSlot: (engineerId: string, date: string, slotIndex: number) => void;
  applySchedulePattern: (
    engineerId: string,
    startDate: Date,
    weeks: number,
    pattern: { dayOfWeek: number; slots: TimeSlot[] }[]
  ) => void;
}

export const useEngineerStore = create<EngineerState>((set) => ({
  engineers: [
    {
      id: 'e1',
      name: 'Пупкин А.И.',
      regionId: 'r1',
      schedule: {
        '2023-10-27': [{ start: 9, end: 10 }, { start: 13, end: 18 }],
      }
    },
    {
      id: 'e2',
      name: 'Залупкин И.А.',
      regionId: 'r1',
      schedule: {
        '2023-10-27': [{ start: 10, end: 18 }],
      }
    },
    {
        id: 'e3',
        name: 'Инженер Пермь 1',
        regionId: 'r2',
        schedule: {}
    }
  ] as Engineer[],
  setEngineers: (engineers) => set({ engineers }),
  addEngineer: (engineer) => set((state) => ({ engineers: [...state.engineers, engineer] })),
  
  addSlot: (engineerId, date, slot) => set((state) => ({
    engineers: state.engineers.map(e => {
      if (e.id !== engineerId) return e;
      const currentSlots = e.schedule[date] || [];
      return {
        ...e,
        schedule: {
          ...e.schedule,
          [date]: [...currentSlots, slot].sort((a, b) => a.start - b.start)
        }
      };
    })
  })),

  removeSlot: (engineerId, date, slotIndex) => set((state) => ({
    engineers: state.engineers.map(e => {
      if (e.id !== engineerId) return e;
      const currentSlots = e.schedule[date] || [];
      return {
        ...e,
        schedule: {
          ...e.schedule,
          [date]: currentSlots.filter((_, idx) => idx !== slotIndex)
        }
      };
    })
  })),

  applySchedulePattern: (engineerId, startDate, weeks, pattern) => set((state) => ({
    engineers: state.engineers.map(e => {
      if (e.id !== engineerId) return e;
      const newSchedule = { ...e.schedule };
      
      for (let week = 0; week < weeks; week++) {
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const currentDate = addDays(startDate, week * 7 + dayOffset);
          const dayOfWeek = currentDate.getDay(); // 0 = Sunday
          const dateKey = format(currentDate, 'yyyy-MM-dd');
          
          const dayPattern = pattern.find(p => p.dayOfWeek === dayOfWeek);
          if (dayPattern && dayPattern.slots.length > 0) {
            const existingSlots = newSchedule[dateKey] || [];
            newSchedule[dateKey] = [...existingSlots, ...dayPattern.slots].sort((a, b) => a.start - b.start);
          }
        }
      }
      
      return { ...e, schedule: newSchedule };
    })
  })),
}));
