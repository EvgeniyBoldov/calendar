import { create } from 'zustand';
import type { Region, DataCenter } from '../types';

interface DataCenterState {
  regions: Region[];
  dataCenters: DataCenter[];
  setRegions: (regions: Region[]) => void;
  setDataCenters: (dcs: DataCenter[]) => void;
  addRegion: (region: Region) => void;
  addDataCenter: (dc: DataCenter) => void;
}

export const useDataCenterStore = create<DataCenterState>((set) => ({
  regions: [
    { id: 'r1', name: 'Москва' },
    { id: 'r2', name: 'Пермь' },
  ],
  dataCenters: [
    { id: 'dc1', regionId: 'r1', name: 'ДЦ-1', description: 'Описание ДЦ-1 Москва' },
    { id: 'dc2', regionId: 'r1', name: 'ДЦ-2', description: 'Описание ДЦ-2 Москва' },
    { id: 'dc3', regionId: 'r2', name: 'ДЦ-1', description: 'Описание ДЦ-1 Пермь' },
    { id: 'dc4', regionId: 'r2', name: 'ДЦ-2', description: 'Описание ДЦ-2 Пермь' },
  ],
  setRegions: (regions) => set({ regions }),
  setDataCenters: (dataCenters) => set({ dataCenters }),
  addRegion: (region) => set((state) => ({ regions: [...state.regions, region] })),
  addDataCenter: (dc) => set((state) => ({ dataCenters: [...state.dataCenters, dc] })),
}));
