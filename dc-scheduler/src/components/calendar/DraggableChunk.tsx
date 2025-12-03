import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { WorkChunk } from '../../types';
import { Clock, GripVertical, ChevronUp, ChevronDown, MapPin } from 'lucide-react';
import clsx from 'clsx';

interface DraggableChunkProps {
  chunk: WorkChunk;
  workName?: string;
  workDescription?: string;
  dcName?: string;
  variant?: 'sidebar' | 'slot';
  showReorderButtons?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  calculatedStartTime?: number;
  calculatedEndTime?: number;
}

export const DraggableChunk: React.FC<DraggableChunkProps> = ({ 
  chunk, 
  workName,
  workDescription,
  dcName,
  variant = 'sidebar',
  showReorderButtons = false,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  calculatedStartTime,
  calculatedEndTime,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: chunk.id,
    data: { chunk },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  // Sidebar variant - compact view for task list
  if (variant === 'sidebar') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={clsx(
          "group p-3 bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing",
          "hover:border-primary/50 hover:shadow-soft transition-all duration-200",
          "select-none touch-none",
          isDragging && "opacity-50 ring-2 ring-primary shadow-lg z-50"
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical size={14} className="text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground text-sm truncate">
              {chunk.title || workName || chunk.workId}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {chunk.durationHours}ч
              </span>
              <span className="badge-outline text-[10px] py-0">
                Этап {chunk.order}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Slot variant - detailed view with time, description, reorder buttons
  const startHour = calculatedStartTime ?? chunk.assignedStartTime ?? 0;
  const endHour = calculatedEndTime ?? (startHour + chunk.durationHours);
  const isConfirmed = chunk.status === 'assigned';
  const isPlanned = chunk.status === 'planned';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={clsx(
        "group bg-card border rounded-lg transition-all duration-200 select-none touch-none",
        isConfirmed 
          ? "border-success/50 bg-success/5 cursor-default" 
          : "border-border cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-soft",
        isDragging && "opacity-50 ring-2 ring-primary shadow-lg z-50"
      )}
    >
      {/* Time header */}
      <div className={clsx(
        "flex items-center justify-between px-3 py-1.5 border-b rounded-t-lg text-xs",
        isConfirmed ? "bg-success/10 border-success/20" : isPlanned ? "bg-warning/10 border-warning/20" : "bg-muted/50 border-border"
      )}>
        <span className="font-medium text-foreground">
          {startHour}:00 — {endHour}:00
        </span>
        <div className="flex items-center gap-2">
          {dcName && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin size={10} />
              {dcName}
            </span>
          )}
          {isConfirmed && <span className="badge-success text-[10px] py-0">Утверждено</span>}
          {isPlanned && <span className="badge-warning text-[10px] py-0">План</span>}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-3">
        {/* Title row: name + duration */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-medium text-foreground text-sm truncate flex-1">
            {chunk.title || workName}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <Clock size={12} />
            {chunk.durationHours}ч
          </span>
        </div>
        
        {/* Description - full width */}
        {workDescription && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {workDescription}
          </p>
        )}
      </div>

      {/* Reorder buttons - only for non-confirmed chunks */}
      {showReorderButtons && !isConfirmed && (
        <div className="flex items-center justify-end gap-1 px-2 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
            disabled={!canMoveUp}
            className={clsx(
              "p-1 rounded transition-colors",
              canMoveUp 
                ? "hover:bg-muted text-muted-foreground hover:text-foreground" 
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
            disabled={!canMoveDown}
            className={clsx(
              "p-1 rounded transition-colors",
              canMoveDown 
                ? "hover:bg-muted text-muted-foreground hover:text-foreground" 
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
