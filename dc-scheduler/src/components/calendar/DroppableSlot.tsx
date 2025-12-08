import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { WorkChunk, Work, SchedulableItem } from '../../types';
import { DraggableItem } from './DraggableItem';
import { Clock, AlertTriangle, Car } from 'lucide-react';
import clsx from 'clsx';
import { 
  validateSlotCompatibility, 
  calculateAvailableTime,
  getTravelTime,
  type SlotInfo 
} from '../../utils/slotValidation';

// Helper to convert chunk to SchedulableItem for display
const chunkToSchedulableItem = (chunk: WorkChunk, work?: Work): SchedulableItem => ({
  id: chunk.id,
  type: 'chunk',
  title: chunk.title,
  durationHours: chunk.durationHours,
  workId: chunk.workId,
  workName: work?.name || '',
  workType: work?.workType || 'general',
  priority: work?.priority || 'medium',
  dataCenterId: chunk.dataCenterId,
  status: chunk.status,
  order: chunk.order,
  assignedEngineerId: chunk.assignedEngineerId,
  assignedDate: chunk.assignedDate,
  assignedStartTime: chunk.assignedStartTime,
  tasks: chunk.tasks,
  links: chunk.links,
});

interface DroppableSlotProps {
  id: string;
  engineerId: string;
  engineerRegionId: string;
  date: string;
  startTime: number;
  endTime: number;
  assignedChunks: WorkChunk[];
  capacity: number;
  activeItem: SchedulableItem | null;
  works: Work[];
  dataCenters: { id: string; name: string; regionId?: string }[];
  travelMatrix: Record<string, Record<string, number>>;
  allChunks: WorkChunk[];
  onMoveChunk?: (chunkId: string, direction: 'up' | 'down') => void;
  onUnassignItem?: (itemId: string) => void;
  onEditItem?: (itemId: string) => void;
}

export const DroppableSlot: React.FC<DroppableSlotProps> = ({ 
  id, 
  engineerId,
  engineerRegionId,
  date,
  startTime, 
  endTime, 
  assignedChunks, 
  capacity, 
  activeItem,
  works,
  dataCenters,
  travelMatrix,
  allChunks,
  onMoveChunk,
  onUnassignItem,
  onEditItem,
}) => {
  const currentLoad = assignedChunks.reduce((acc, c) => acc + c.durationHours, 0);
  
  // Рассчитываем доступное время с учётом переездов
  const availableHours = React.useMemo(() => {
    if (!activeItem) return capacity - currentLoad;
    return calculateAvailableTime(
      { startTime, endTime },
      allChunks,
      engineerId,
      date,
      activeItem.dataCenterId,
      travelMatrix
    );
  }, [activeItem, capacity, currentLoad, startTime, endTime, allChunks, engineerId, date, travelMatrix]);

  // Валидация слота для активного элемента (система "Светофор")
  const validation = React.useMemo(() => {
    if (!activeItem) return null;
    
    const slotInfo: SlotInfo = {
      engineerId,
      engineerRegionId,
      date,
      startTime,
      endTime,
      availableHours,
    };
    
    return validateSlotCompatibility(
      activeItem,
      slotInfo,
      dataCenters,
      allChunks,
      travelMatrix
    );
  }, [activeItem, engineerId, engineerRegionId, date, startTime, endTime, availableHours, dataCenters, allChunks, travelMatrix]);

  const compatibility = validation?.compatibility || 'green';
  const validationReasons = validation?.reasons || [];
  
  const { setNodeRef, isOver } = useDroppable({
    id: id,
    data: { type: 'slot', capacity, currentLoad, compatibility }
  });

  const freeSpace = capacity - currentLoad;
  const canFit = activeItem ? (compatibility !== 'red' && availableHours >= activeItem.durationHours) : true;
  const fillPercentage = Math.min((currentLoad / capacity) * 100, 100);

  // Sort chunks by their start time for display
  const sortedChunks = [...assignedChunks].sort((a, b) => 
    (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0)
  );

  // Calculate actual start/end times for each chunk, including travel blocks
  type SlotItem = 
    | { type: 'chunk'; chunk: WorkChunk; startTime: number; endTime: number; work?: Work; dcName?: string; canMoveUp: boolean; canMoveDown: boolean }
    | { type: 'travel'; fromDc: string; toDc: string; durationMinutes: number };

  const slotItems = React.useMemo(() => {
    const items: SlotItem[] = [];
    let currentTime = startTime;
    let prevDcId: string | undefined;
    
    sortedChunks.forEach((chunk, idx) => {
      const work = works.find(w => w.id === chunk.workId);
      const dcId = chunk.dataCenterId ?? work?.dataCenterId;
      const dc = dataCenters.find(d => d.id === dcId);
      
      // Add travel block if DC changed
      if (prevDcId && dcId && prevDcId !== dcId) {
        const travelMinutes = getTravelTime(prevDcId, dcId, travelMatrix);
        if (travelMinutes > 0) {
          items.push({
            type: 'travel',
            fromDc: prevDcId,
            toDc: dcId,
            durationMinutes: travelMinutes,
          });
          currentTime += travelMinutes / 60; // Convert to hours
        }
      }
      
      const chunkStart = currentTime;
      const chunkEnd = currentTime + chunk.durationHours;
      currentTime = chunkEnd;
      prevDcId = dcId;
      
      items.push({
        type: 'chunk',
        chunk,
        startTime: chunkStart,
        endTime: chunkEnd,
        work,
        dcName: dc?.name,
        canMoveUp: idx > 0,
        canMoveDown: idx < sortedChunks.length - 1,
      });
    });
    
    return items;
  }, [sortedChunks, startTime, works, dataCenters, travelMatrix]);

  // Visual states based on Traffic Light system
  let containerClass = "bg-muted/30 border-border";
  let headerClass = "text-muted-foreground";
  
  if (activeItem) {
    if (isOver) {
      // При наведении - яркая подсветка по цвету светофора
      switch (compatibility) {
        case 'green':
          containerClass = "bg-green-500/20 border-green-500 ring-2 ring-green-500/50";
          break;
        case 'yellow':
          containerClass = "bg-yellow-500/20 border-yellow-500 ring-2 ring-yellow-500/50";
          break;
        case 'red':
          containerClass = "bg-red-500/20 border-red-500 ring-2 ring-red-500/50 cursor-not-allowed";
          break;
      }
    } else {
      // Без наведения - приглушённая подсветка
      switch (compatibility) {
        case 'green':
          containerClass = "bg-green-500/5 border-green-500/50 border-dashed";
          headerClass = "text-green-600";
          break;
        case 'yellow':
          containerClass = "bg-yellow-500/5 border-yellow-500/50 border-dashed";
          headerClass = "text-yellow-600";
          break;
        case 'red':
          containerClass = "bg-muted/50 border-border opacity-40";
          break;
      }
    }
  } else if (freeSpace <= 0) {
    containerClass = "bg-warning/10 border-warning/50";
  }

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "min-h-[80px] border rounded-lg p-2 transition-all duration-200",
        containerClass
      )}
    >
      {/* Header */}
      <div className={clsx("flex items-center justify-between text-xs mb-2", headerClass)}>
        <span className="flex items-center gap-1 font-medium">
          <Clock size={12} />
          {startTime}:00 — {endTime}:00
        </span>
        <span className={clsx(
          "font-semibold",
          freeSpace <= 0 ? "text-warning" : "text-muted-foreground"
        )}>
          {currentLoad}/{capacity}ч
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-border rounded-full overflow-hidden mb-2">
        <div 
          className={clsx(
            "h-full rounded-full transition-all duration-300",
            fillPercentage >= 100 ? "bg-warning" : "bg-primary"
          )} 
          style={{ width: `${fillPercentage}%` }}
        />
      </div>

      {/* Chunks and Travel Blocks */}
      <div className="space-y-2">
        {slotItems.map((slotItem, idx) => {
          if (slotItem.type === 'travel') {
            // Travel block
            const fromDc = dataCenters.find(d => d.id === slotItem.fromDc);
            const toDc = dataCenters.find(d => d.id === slotItem.toDc);
            return (
              <div 
                key={`travel-${idx}`}
                className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded border border-dashed border-muted-foreground/30 text-xs text-muted-foreground"
              >
                <Car size={12} className="shrink-0" />
                <span className="truncate">
                  {fromDc?.name || '?'} → {toDc?.name || '?'}
                </span>
                <span className="ml-auto font-medium">{Math.round(slotItem.durationMinutes)}мин</span>
              </div>
            );
          }
          
          // Chunk block
          const { chunk, startTime: chunkStart, endTime: chunkEnd, work, dcName, canMoveUp, canMoveDown } = slotItem;
          const item = chunkToSchedulableItem(chunk, work);
          return (
            <DraggableItem 
              key={chunk.id} 
              item={item}
              variant="slot"
              dcName={dcName}
              calculatedStartTime={chunkStart}
              calculatedEndTime={chunkEnd}
              showReorderButtons={sortedChunks.length > 1}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveUp={() => onMoveChunk?.(chunk.id, 'up')}
              onMoveDown={() => onMoveChunk?.(chunk.id, 'down')}
              isPreview={(chunk as any).isPreview}
              onUnassign={() => onUnassignItem?.(chunk.id)}
              onEdit={() => onEditItem?.(chunk.id)}
            />
          );
        })}
        
        {/* Drop placeholder - Traffic Light feedback */}
        {isOver && activeItem && (
          <>
            {compatibility === 'green' && (
              <div className="h-12 border-2 border-dashed border-green-500 rounded-lg bg-green-500/10 flex items-center justify-center text-xs text-green-600 font-medium animate-pulse">
                + {activeItem.durationHours}ч
              </div>
            )}
            {compatibility === 'yellow' && (
              <div className="h-14 border-2 border-dashed border-yellow-500 rounded-lg bg-yellow-500/10 flex flex-col items-center justify-center text-xs text-yellow-600 font-medium">
                <div className="flex items-center gap-1">
                  <AlertTriangle size={12} />
                  + {activeItem.durationHours}ч
                </div>
                {validationReasons.length > 0 && (
                  <span className="text-[10px] opacity-75">{validationReasons[0]}</span>
                )}
              </div>
            )}
            {compatibility === 'red' && (
              <div className="h-14 border-2 border-dashed border-red-500 rounded-lg bg-red-500/10 flex flex-col items-center justify-center text-xs text-red-600 font-medium">
                <div className="flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Нельзя
                </div>
                {validationReasons.length > 0 && (
                  <span className="text-[10px] opacity-75">{validationReasons[0]}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
