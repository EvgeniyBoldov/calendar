import React from 'react';
import { FileText, Calendar, MapPin, Flag, ChevronRight, Clock, HeadphonesIcon } from 'lucide-react';
import type { Work, WorkChunk, DataCenter, Priority, WorkType } from '../../types';
import clsx from 'clsx';

interface WorkCardProps {
  work: Work;
  chunks: WorkChunk[];
  dataCenters: DataCenter[];
  isSelected: boolean;
  onClick: () => void;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  low: { label: 'Низкий', color: 'text-muted-foreground', bg: 'bg-muted' },
  medium: { label: 'Средний', color: 'text-primary', bg: 'bg-primary/10' },
  high: { label: 'Высокий', color: 'text-warning', bg: 'bg-warning/10' },
  critical: { label: 'Критический', color: 'text-destructive', bg: 'bg-destructive/10' },
};

const WORK_TYPE_CONFIG: Record<WorkType, { label: string; icon: React.ElementType; color: string }> = {
  general: { label: 'Работа', icon: FileText, color: 'text-primary' },
  support: { label: 'Сопровождение', icon: HeadphonesIcon, color: 'text-success' },
};

export const WorkCard: React.FC<WorkCardProps> = ({
  work,
  chunks,
  dataCenters,
  isSelected,
  onClick,
}) => {
  const workChunks = chunks.filter(c => c.workId === work.id);
  const completedChunks = workChunks.filter(c => c.status === 'completed').length;
  const progress = workChunks.length > 0 ? (completedChunks / workChunks.length) * 100 : 0;
  
  const priorityConfig = PRIORITY_CONFIG[work.priority];
  const typeConfig = WORK_TYPE_CONFIG[work.workType];
  const TypeIcon = typeConfig.icon;
  
  const dc = dataCenters.find(d => d.id === work.dataCenterId);
  
  // Get relevant date based on work type
  const getDateDisplay = () => {
    if (work.workType === 'general' && work.dueDate) {
      return { label: 'Дедлайн', value: work.dueDate };
    }
    if (work.workType === 'support' && work.targetDate) {
      return { label: 'Дата', value: work.targetDate };
    }
    return null;
  };
  
  const dateInfo = getDateDisplay();

  return (
    <div
      onClick={onClick}
      className={clsx(
        'p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md',
        isSelected
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-border bg-card hover:border-primary/30'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={clsx('p-2 rounded-lg', priorityConfig.bg)}>
          <TypeIcon size={18} className={typeConfig.color} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate">{work.name}</h3>
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
            {work.description || 'Без описания'}
          </p>
          
          {/* Meta info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {dc && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {dc.name}
              </span>
            )}
            {dateInfo && (
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {dateInfo.value}
              </span>
            )}
            {work.workType === 'support' && work.durationHours && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {work.durationHours}ч
              </span>
            )}
          </div>
          
          {/* Progress for general works */}
          {work.workType === 'general' && workChunks.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Прогресс</span>
                <span className="font-medium">{completedChunks}/{workChunks.length}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          
        </div>
        
        {/* Arrow */}
        <ChevronRight 
          size={18} 
          className={clsx(
            'transition-colors',
            isSelected ? 'text-primary' : 'text-muted-foreground'
          )} 
        />
      </div>
      
      {/* Priority badge */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className={clsx('text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1', priorityConfig.bg, priorityConfig.color)}>
          <Flag size={10} />
          {priorityConfig.label}
        </span>
        <span className={clsx('text-xs px-2 py-0.5 rounded', typeConfig.color, 'bg-current/10')}>
          {typeConfig.label}
        </span>
      </div>
    </div>
  );
};
