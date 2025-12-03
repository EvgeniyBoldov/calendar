import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { WorkChunk, Work } from '../../types';
import { DraggableChunk } from './DraggableChunk';
import { Clock } from 'lucide-react';
import clsx from 'clsx';

interface DroppableSlotProps {
  id: string;
  startTime: number;
  endTime: number;
  assignedChunks: WorkChunk[];
  capacity: number;
  activeChunk: WorkChunk | null;
  works: Work[];
  dataCenters: { id: string; name: string }[];
  onMoveChunk?: (chunkId: string, direction: 'up' | 'down') => void;
}

export const DroppableSlot: React.FC<DroppableSlotProps> = ({ 
  id, 
  startTime, 
  endTime, 
  assignedChunks, 
  capacity, 
  activeChunk,
  works,
  dataCenters,
  onMoveChunk,
}) => {
  const currentLoad = assignedChunks.reduce((acc, c) => acc + c.durationHours, 0);
  
  const { setNodeRef, isOver } = useDroppable({
    id: id,
    data: { type: 'slot', capacity, currentLoad }
  });

  const freeSpace = capacity - currentLoad;
  const canFit = activeChunk ? (currentLoad + activeChunk.durationHours <= capacity) : true;
  const fillPercentage = Math.min((currentLoad / capacity) * 100, 100);

  // Sort chunks by their start time for display
  const sortedChunks = [...assignedChunks].sort((a, b) => 
    (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0)
  );

  // Calculate actual start/end times for each chunk
  const chunksWithTimes = React.useMemo(() => {
    let currentTime = startTime;
    return sortedChunks.map((chunk, idx) => {
      const chunkStart = currentTime;
      const chunkEnd = currentTime + chunk.durationHours;
      currentTime = chunkEnd;
      
      const work = works.find(w => w.id === chunk.workId);
      const dcId = chunk.dataCenterId ?? work?.dataCenterId;
      const dc = dataCenters.find(d => d.id === dcId);
      
      return {
        chunk,
        startTime: chunkStart,
        endTime: chunkEnd,
        work,
        dcName: dc?.name,
        canMoveUp: idx > 0,
        canMoveDown: idx < sortedChunks.length - 1,
      };
    });
  }, [sortedChunks, startTime, works, dataCenters]);

  // Visual states
  let containerClass = "bg-muted/30 border-border";
  let headerClass = "text-muted-foreground";
  
  if (activeChunk) {
    if (isOver) {
      containerClass = canFit 
        ? "bg-success/10 border-success ring-2 ring-success/30" 
        : "bg-destructive/10 border-destructive ring-2 ring-destructive/30";
    } else if (canFit) {
      containerClass = "bg-success/5 border-success/50 border-dashed";
      headerClass = "text-success";
    } else {
      containerClass = "bg-muted/50 border-border opacity-50";
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

      {/* Chunks */}
      <div className="space-y-2">
        {chunksWithTimes.map(({ chunk, startTime: chunkStart, endTime: chunkEnd, work, dcName, canMoveUp, canMoveDown }) => (
          <DraggableChunk 
            key={chunk.id} 
            chunk={chunk}
            variant="slot"
            workName={work?.name}
            workDescription={work?.description}
            dcName={dcName}
            calculatedStartTime={chunkStart}
            calculatedEndTime={chunkEnd}
            showReorderButtons={sortedChunks.length > 1}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={() => onMoveChunk?.(chunk.id, 'up')}
            onMoveDown={() => onMoveChunk?.(chunk.id, 'down')}
          />
        ))}
        
        {/* Drop placeholder */}
        {isOver && canFit && activeChunk && (
          <div className="h-12 border-2 border-dashed border-success rounded-lg bg-success/10 flex items-center justify-center text-xs text-success font-medium animate-pulse">
            + {activeChunk.durationHours}ч
          </div>
        )}
      </div>
    </div>
  );
};
