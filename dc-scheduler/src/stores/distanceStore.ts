import { create } from 'zustand';
import { api } from '../api/client';

interface DistanceState {
  // Matrix: { fromDcId: { toDcId: minutes } }
  matrix: Record<string, Record<string, number>>;
  isLoading: boolean;
  error: string | null;
  
  fetchMatrix: () => Promise<void>;
  getTravelTime: (fromDcId: string, toDcId: string) => number;
  setTravelTime: (fromDcId: string, toDcId: string, minutes: number) => Promise<void>;
}

export const useDistanceStore = create<DistanceState>((set, get) => ({
  matrix: {},
  isLoading: false,
  error: null,
  
  fetchMatrix: async () => {
    set({ isLoading: true, error: null });
    try {
      const matrix = await api.distances.getMatrix();
      set({ matrix, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
  
  // Get travel time between two DCs (returns 0 if same DC, default 60 if not found)
  getTravelTime: (fromDcId: string, toDcId: string) => {
    if (fromDcId === toDcId) return 0;
    
    const { matrix } = get();
    
    // Check direct
    if (matrix[fromDcId]?.[toDcId] !== undefined) {
      return matrix[fromDcId][toDcId];
    }
    
    // Check reverse
    if (matrix[toDcId]?.[fromDcId] !== undefined) {
      return matrix[toDcId][fromDcId];
    }
    
    // Default: assume 60 minutes if not in matrix
    return 60;
  },
  
  setTravelTime: async (fromDcId: string, toDcId: string, minutes: number) => {
    try {
      await api.distances.create({ fromDcId, toDcId, durationMinutes: minutes });
      // Update local matrix
      set((state) => ({
        matrix: {
          ...state.matrix,
          [fromDcId]: {
            ...state.matrix[fromDcId],
            [toDcId]: minutes,
          },
        },
      }));
    } catch (error: any) {
      // If already exists, try update
      console.error('Failed to set travel time:', error);
    }
  },
}));
