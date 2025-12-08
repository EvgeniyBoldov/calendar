import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { SchedulableItem, WorkType, Priority, TaskStatus } from '../../types';
import { Clock, GripVertical, ChevronUp, ChevronDown, MapPin, Briefcase, HeadphonesIcon, MoreVertical, X, Wand2, Edit, Check, Circle, AlertCircle, XCircle, Layers, Calendar } from 'lucide-react';
import clsx from 'clsx';

interface DraggableItemProps {
  item: SchedulableItem;
  dcName?: string;
  variant?: 'sidebar' | 'slot';
  showReorderButtons?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  calculatedStartTime?: number;
  calculatedEndTime?: number;
  isPreview?: boolean;
  // Context menu actions
  onUnassign?: () => void;
  onAutoAssign?: () => void;
  onSuggestSlot?: () => void;
  onEdit?: () => void;
  // Loading state
  isLoading?: boolean;
}

const workTypeIcons: Record<WorkType, React.ReactNode> = {
  general: <Briefcase size={12} />,
  support: <HeadphonesIcon size={12} />,
};

const workTypeLabels: Record<WorkType, string> = {
  general: 'Работа',
  support: 'Сопровождение',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'border-l-green-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-orange-500',
  critical: 'border-l-red-500',
};

const TASK_STATUS_ICONS: Record<TaskStatus, React.ElementType> = {
  todo: Circle,
  done: Check,
  partial: AlertCircle,
  cancelled: XCircle,
};

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'text-muted-foreground',
  done: 'text-green-500',
  partial: 'text-amber-500',
  cancelled: 'text-red-500',
};

export const DraggableItem: React.FC<DraggableItemProps> = ({ 
  item, 
  dcName,
  variant = 'sidebar',
  showReorderButtons = false,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  calculatedStartTime,
  calculatedEndTime,
  isPreview = false,
  onUnassign,
  onAutoAssign,
  onSuggestSlot,
  onEdit,
  isLoading = false,
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
    disabled: isPreview,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const isSupport = item.type === 'support';
  const priorityColor = PRIORITY_COLORS[item.priority] || 'border-l-gray-300';
  
  // Context menu component
  const ContextMenu = () => (
    <div 
      className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
      onMouseLeave={() => setShowContextMenu(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {onSuggestSlot && (
        <button
          onClick={(e) => { e.stopPropagation(); onSuggestSlot(); setShowContextMenu(false); }}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
        >
          <Wand2 size={14} className="text-primary" />
          Предложить слот
        </button>
      )}
      {onAutoAssign && (
        <button
          onClick={(e) => { e.stopPropagation(); onAutoAssign(); setShowContextMenu(false); }}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
        >
          <Check size={14} className="text-success" />
          Назначить авто
        </button>
      )}
      {(onSuggestSlot || onAutoAssign) && (onUnassign || onEdit) && (
        <div className="my-1 border-b border-border" />
      )}
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); setShowContextMenu(false); }}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
        >
          <Edit size={14} />
          Редактировать
        </button>
      )}
      {onUnassign && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnassign(); setShowContextMenu(false); }}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2 text-destructive"
        >
          <X size={14} />
          Снять с плана
        </button>
      )}
    </div>
  );

  // Sidebar variant - compact view
  if (variant === 'sidebar') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={clsx(
          "group p-3 bg-card border border-l-4 rounded-r-lg rounded-l-none cursor-grab active:cursor-grabbing",
          "hover:shadow-soft transition-all duration-200",
          "select-none touch-none relative",
          priorityColor,
          isDragging && "opacity-50 ring-2 ring-primary shadow-lg z-50",
          isLoading && "opacity-70 pointer-events-none"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Icon Column */}
          <div className={clsx(
            "mt-0.5 text-muted-foreground",
            item.workType === 'general' ? "text-primary" : "text-orange-500"
          )}>
            {workTypeIcons[item.workType]}
          </div>

          {/* Content Column */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-foreground text-sm leading-tight line-clamp-2">
                {item.title}
              </span>
              
              {/* Menu Button */}
              {(onSuggestSlot || onAutoAssign || onEdit) && (
                <div className="relative shrink-0">
                  <button
                    onClick={(e) => { 
                      e.stopPropagation();
                      // Prevent drag start on button click is handled by dnd-kit usually, but explicit stopPropagation helps
                      setShowContextMenu(!showContextMenu); 
                    }}
                    className="p-1 -mt-1 -mr-1 rounded hover:bg-muted text-muted-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {showContextMenu && <ContextMenu />}
                </div>
              )}
            </div>

            {/* Work Name for context */}
            {!isSupport && item.workName && (
              <div
                className="text-[11px] text-muted-foreground truncate mt-0.5"
                title={item.workName}
              >
                {item.workName}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 bg-muted/30 px-1.5 py-0.5 rounded">
                <Clock size={12} />
                {item.durationHours}ч
              </span>

              {isSupport && (item.targetDate || item.targetTime !== undefined) && (
                <span
                  className="flex items-center gap-1.5 bg-muted/30 px-1.5 py-0.5 rounded max-w-[140px]"
                  title="Дата/время сопровождения"
                >
                  <Calendar size={12} />
                  <span className="truncate">
                    {item.targetDate
                      ? new Date(item.targetDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
                      : 'Дата ?'}
                    {item.targetTime !== undefined && item.targetTime !== null &&
                      ` · ${item.targetTime}:00`}
                  </span>
                </span>
              )}

              {item.tasks && item.tasks.length > 0 && (
                <span
                  className="flex items-center gap-1.5 bg-muted/30 px-1.5 py-0.5 rounded"
                  title="Задачи"
                >
                  <Layers size={12} />
                  {item.tasks.filter(t => t.status === 'done').length}/{item.tasks.length}
                </span>
              )}

              {dcName && (
                <span
                  className="flex items-center gap-1.5 bg-muted/20 px-1.5 py-0.5 rounded max-w-[120px]"
                  title="Дата-центр"
                >
                  <MapPin size={10} />
                  <span className="truncate">{dcName}</span>
                </span>
              )}

              {!isSupport && item.order !== undefined && (
                <span className="text-[10px] text-muted-foreground/70">
                  Этап {item.order}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Slot variant - detailed 60/40 view
  const startHour = calculatedStartTime ?? item.assignedStartTime ?? 0;
  const endHour = calculatedEndTime ?? (startHour + item.durationHours);
  const isConfirmed = item.status === 'assigned';
  const isPlanned = item.status === 'planned';
  
  const hasTasks = item.tasks && item.tasks.length > 0;
  const visibleTasks = item.tasks?.slice(0, 3) || [];
  const remainingTasksCount = (item.tasks?.length || 0) - visibleTasks.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!isPreview ? listeners : {})}
      {...(!isPreview ? attributes : {})}
      className={clsx(
        "group bg-card border border-l-4 rounded-r-lg rounded-l-sm transition-all duration-200 select-none touch-none relative flex overflow-hidden",
        priorityColor,
        isPreview
          ? "border-primary/50 bg-primary/5 border-dashed cursor-default opacity-80"
          : isConfirmed 
            ? "bg-success/5 cursor-default" 
            : isPlanned
              ? "bg-amber-50 dark:bg-amber-950/20 border-dashed border-amber-400 cursor-grab active:cursor-grabbing hover:shadow-md"
              : "cursor-grab active:cursor-grabbing hover:shadow-md",
        isDragging && "opacity-50 ring-2 ring-primary shadow-lg z-50"
      )}
    >
      {/* Left Part (60%) */}
      <div className="flex-1 flex flex-col border-r border-border/50 min-w-0">
        {/* Top: Title (approx 30% visually via padding) */}
        <div className="p-2 border-b border-border/50 bg-muted/10 pr-6">
          <div className="font-medium text-foreground text-xs truncate" title={item.title}>
            {item.title}
          </div>
          {!isSupport && item.workName && (
            <div className="text-[10px] text-muted-foreground truncate" title={item.workName}>
              {item.workName}
            </div>
          )}
        </div>
        
        {/* Bottom: Tasks (approx 70%) */}
        <div className="flex-1 p-2 bg-background">
          {hasTasks ? (
            <div className="space-y-1">
              {visibleTasks.map((task, idx) => {
                const StatusIcon = TASK_STATUS_ICONS[task.status];
                return (
                  <div key={task.id || idx} className="flex items-center gap-1.5 text-[10px] max-w-full">
                    <StatusIcon size={10} className={clsx('shrink-0', TASK_STATUS_COLORS[task.status])} />
                    <span className={clsx(
                      "truncate text-muted-foreground",
                      task.status === 'done' && "line-through opacity-70",
                      task.status === 'cancelled' && "line-through opacity-50"
                    )}>
                      {task.title}
                    </span>
                  </div>
                );
              })}
              {remainingTasksCount > 0 && (
                <div className="text-[9px] text-muted-foreground pl-4">
                  + еще {remainingTasksCount}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center items-center text-muted-foreground/40">
              <Layers size={16} />
              <span className="text-[9px] mt-1">Нет задач</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Part (40%) - Meta info */}
      <div className="w-[40%] bg-muted/5 p-2 flex flex-col gap-1.5 min-w-[90px] relative">
        
        {/* Context Menu Button - Absolute Top Right */}
        {(onUnassign || onAutoAssign || onEdit) && !isPreview && (
          <div className="absolute top-1 right-1 z-20">
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                e.preventDefault(); // Prevent focus stealing if needed
                setShowContextMenu(!showContextMenu); 
              }}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
            >
              <MoreVertical size={14} />
            </button>
            {showContextMenu && <ContextMenu />}
          </div>
        )}

        {/* Time Header */}
        <div className={clsx(
          "text-[10px] font-medium rounded px-1.5 py-0.5 mb-1 text-center border mr-4", // mr-4 to avoid overlap with menu
          isConfirmed ? "bg-success/10 text-success border-success/20" :
          isPlanned ? "bg-warning/10 text-warning-foreground border-warning/20" :
          "bg-muted text-muted-foreground border-border"
        )}>
          {startHour}:00 — {endHour}:00
        </div>

        {/* Details list */}
        <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5" title="Длительность">
            <Clock size={10} className="shrink-0" />
            <span className="truncate">{item.durationHours}ч</span>
          </div>
          
          {dcName && (
            <div className="flex items-center gap-1.5" title="Дата-центр">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{dcName}</span>
            </div>
          )}
          
          <div className="flex items-center gap-1.5" title="Тип работы">
             <span className="shrink-0">{workTypeIcons[item.workType]}</span>
             <span className="truncate">{workTypeLabels[item.workType]}</span>
          </div>

          {!isSupport && item.order !== undefined && (
             <div className="flex items-center gap-1.5">
               <span className="badge-outline text-[9px] py-0 px-1 w-full justify-center">
                 Этап {item.order}
               </span>
             </div>
          )}
        </div>
      </div>

      {/* Reorder buttons - absolute positioned on the divider */}
      {showReorderButtons && !isConfirmed && !isPreview && (
        <div className="absolute right-[40%] top-1/2 -translate-y-1/2 translate-x-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background rounded-full border shadow-sm p-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
            disabled={!canMoveUp}
            className={clsx(
              "p-0.5 rounded-full transition-colors hover:bg-muted",
              canMoveUp ? "text-foreground hover:text-primary" : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
            disabled={!canMoveDown}
            className={clsx(
              "p-0.5 rounded-full transition-colors hover:bg-muted",
              canMoveDown ? "text-foreground hover:text-primary" : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
