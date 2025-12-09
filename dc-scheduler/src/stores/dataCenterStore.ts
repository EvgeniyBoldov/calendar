import { create } from 'zustand';
import type { Region, DataCenter } from '../types';
import { api } from '../api/client';

interface DataCenterState {
  regions: Region[];
  dataCenters: DataCenter[];
  isLoading: boolean;
  error: string | null;
  
  fetchData: () => Promise<void>;
  addRegion: (region: Partial<Region>) => Promise<void>;
  addDataCenter: (dc: Partial<DataCenter>) => Promise<void>;
  
  // Sync setters
  setRegions: (regions: Region[]) => void;
  setDataCenters: (dataCenters: DataCenter[]) => void;
}

export const useDataCenterStore = create<DataCenterState>((set) => ({
  regions: [],
  dataCenters: [],
  isLoading: false,
  error: null,
  
  setRegions: (regions) => set({ regions }),
  setDataCenters: (dataCenters) => set({ dataCenters }),
  
  fetchData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [regions, dcs] = await Promise.all([
        api.regions.list(),
        api.dataCenters.list()
      ]);
      set({ regions, dataCenters: dcs, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
  
  addRegion: async (regionData) => {
    try {
      const newRegion = await api.regions.create(regionData);
      // Защита от дублей: region также придёт через realtime-sync
      set((state) => {
        if (state.regions.some((r) => r.id === newRegion.id)) {
          return {};
        }
        return { regions: [...state.regions, newRegion] };
      });
    } catch (error: any) {
      console.error('Failed to add region:', error);
    }
  },
  
  addDataCenter: async (dcData) => {
    try {
      const newDc = await api.dataCenters.create(dcData);
      // Защита от дублей: датацентр также придёт через realtime-sync
      set((state) => {
        if (state.dataCenters.some((d) => d.id === newDc.id)) {
          return {};
        }
        return { dataCenters: [...state.dataCenters, newDc] };
      });
    } catch (error: any) {
      console.error('Failed to add data center:', error);
    }
  },
}));
