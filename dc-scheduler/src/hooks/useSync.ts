import { useEffect, useRef, useCallback } from 'react';
import { getSyncStreamUrl, toCamelCase } from '../api/client';
import { useWorkStore } from '../stores/workStore';
import { useEngineerStore } from '../stores/engineerStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import type { TimeSlot } from '../types';

interface SyncEvent {
  event_type: string;
  entity_id: string | null;
  data: any;
  timestamp: string;
  user_id: string | null;
}

export function useSync() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const handleSyncEventRef = useRef<(event: SyncEvent) => void>(() => {});
  
  // Update the ref with the latest handler
  handleSyncEventRef.current = (event: SyncEvent) => {
    const { event_type, data: rawData } = event;
    const data = toCamelCase(rawData);
    
    // Get store methods via getState() to avoid dependency issues
    const workStore = useWorkStore.getState();
    
    switch (event_type) {
      // Works
      case 'work_created':
        workStore.syncWorkCreated(data);
        break;
      case 'work_updated':
        workStore.syncWorkUpdated(data);
        break;
      case 'work_deleted':
        workStore.syncWorkDeleted(data.id);
        break;
      
      // Chunks
      case 'chunk_created':
        workStore.syncChunkCreated(data);
        break;
      case 'chunk_updated':
      case 'chunk_planned':
      case 'chunk_assigned':
        workStore.syncChunkUpdated(data);
        break;
      case 'chunk_deleted':
        workStore.syncChunkDeleted(data.id);
        break;
      
      // Engineers
      case 'engineer_created': {
        const transformed = {
          id: data.id,
          name: data.name,
          regionId: data.regionId,
          schedule: (data.timeSlots || []).reduce((acc: Record<string, TimeSlot[]>, slot: any) => {
            const dateKey = slot.date;
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push({ 
              id: slot.id,
              start: slot.startHour, 
              end: slot.endHour 
            });
            return acc;
          }, {})
        };
        const store = useEngineerStore.getState();
        if (!store.engineers.find(e => e.id === data.id)) {
          store.setEngineers([...store.engineers, transformed]);
        }
        break;
      }
      case 'engineer_updated': {
        const transformed = {
          id: data.id,
          name: data.name,
          regionId: data.regionId,
          schedule: (data.timeSlots || []).reduce((acc: Record<string, TimeSlot[]>, slot: any) => {
            const dateKey = slot.date;
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push({ 
              id: slot.id,
              start: slot.startHour, 
              end: slot.endHour 
            });
            return acc;
          }, {})
        };
        const store = useEngineerStore.getState();
        store.setEngineers(store.engineers.map(e => e.id === data.id ? transformed : e));
        break;
      }
      case 'engineer_deleted': {
        const store = useEngineerStore.getState();
        store.setEngineers(store.engineers.filter(e => e.id !== data.id));
        break;
      }
      
      // Regions
      case 'region_created': {
        const store = useDataCenterStore.getState();
        if (!store.regions.find(r => r.id === data.id)) {
          store.setRegions([...store.regions, data]);
        }
        break;
      }
      case 'region_updated': {
        const store = useDataCenterStore.getState();
        store.setRegions(store.regions.map(r => r.id === data.id ? data : r));
        break;
      }
      case 'region_deleted': {
        const store = useDataCenterStore.getState();
        store.setRegions(store.regions.filter(r => r.id !== data.id));
        break;
      }
      
      // Data Centers
      case 'datacenter_created': {
        const store = useDataCenterStore.getState();
        if (!store.dataCenters.find(d => d.id === data.id)) {
          store.setDataCenters([...store.dataCenters, data]);
        }
        break;
      }
      case 'datacenter_updated': {
        const store = useDataCenterStore.getState();
        store.setDataCenters(store.dataCenters.map(d => d.id === data.id ? data : d));
        break;
      }
      case 'datacenter_deleted': {
        const store = useDataCenterStore.getState();
        store.setDataCenters(store.dataCenters.filter(d => d.id !== data.id));
        break;
      }
      
      default:
        console.log('Unknown sync event:', event_type);
    }
  };
  
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const eventSource = new EventSource(getSyncStreamUrl());
    eventSourceRef.current = eventSource;
    
    eventSource.addEventListener('connected', () => {
      // Connected to SSE stream
    });
    
    eventSource.addEventListener('sync', (e) => {
      try {
        const event: SyncEvent = JSON.parse(e.data);
        handleSyncEventRef.current(event);
      } catch (err) {
        console.error('[SSE] Error parsing sync event:', err);
      }
    });
    
    eventSource.addEventListener('ping', () => {
      // Keepalive, do nothing
    });
    
    eventSource.onerror = () => {
      eventSource.close();
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };
  }, []);
  
  useEffect(() => {
    connect();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);
  
  return {
    reconnect: connect,
  };
}
