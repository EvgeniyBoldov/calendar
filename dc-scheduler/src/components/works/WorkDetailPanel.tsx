import React from 'react';
import { 
  X, Edit2, Trash2, Plus, Calendar, MapPin, Flag, Clock, 
  CheckCircle2, Circle, Timer, Play
} from 'lucide-react';
import type { Work, WorkChunk, DataCenter, Priority, WorkStatus } from '../../types';
import { ChunkCard } from './ChunkCard';
import { FileUpload } from './FileUpload';
import clsx from 'clsx';

interface WorkDetailPanelProps {
  work: Work;
  chunks: WorkChunk[];
  dataCenters: DataCenter[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChunk: () => void;
  onEditChunk: (chunk: WorkChunk) => void;
  onDeleteChunk: (chunkId: string) => void;
  onUpdateStatus: (status: WorkStatus) => void;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  low: { label: 'Низкий', color: 'text-muted-foreground', bg: 'bg-muted' },
  medium: { label: 'Средний', color: 'text-primary', bg: 'bg-primary/10' },
  high: { label: 'Высокий', color: 'text-warning', bg: 'bg-warning/10' },
  critical: { label: 'Критический', color: 'text-destructive', bg: 'bg-destructive/10' },
};

const STATUS_CONFIG: Record<WorkStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft: { label: 'Черновик', color: 'text-muted-foreground', bg: 'bg-muted', icon: Circle },
  created: { label: 'Создано', color: 'text-muted-foreground', bg: 'bg-muted', icon: Circle },
  ready: { label: 'Готово', color: 'text-primary', bg: 'bg-primary/10', icon: CheckCircle2 },
  scheduling: { label: 'Назначение', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: Timer },
  assigned: { label: 'Назначено', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: CheckCircle2 },
  in_progress: { label: 'В работе', color: 'text-warning', bg: 'bg-warning/10', icon: Timer },
  completed: { label: 'Выполнено', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
};

export const WorkDetailPanel: React.FC<WorkDetailPanelProps> = ({
  work,
  chunks,
  dataCenters,
  onClose,
  onEdit,
  onDelete,
  onAddChunk,
  onEditChunk,
  onDeleteChunk,
  onUpdateStatus,
}) => {
  const workChunks = chunks.filter(c => c.workId === work.id).sort((a, b) => a.order - b.order);
  const completedChunks = workChunks.filter(c => c.status === 'completed').length;
  const progress = workChunks.length > 0 ? (completedChunks / workChunks.length) * 100 : 0;
  
  const priorityConfig = PRIORITY_CONFIG[work.priority];
  const statusConfig = STATUS_CONFIG[work.status];
  const StatusIcon = statusConfig.icon;
  
  const dc = dataCenters.find(d => d.id === work.dataCenterId);

  // TODO: Group chunks by status for kanban-like view (future feature)
  // const chunksByStatus = { created, planned, assigned, completed }

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1', statusConfig.bg, statusConfig.color)}>
                <StatusIcon size={10} />
                {statusConfig.label}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground">{work.name}</h2>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
              title="Редактировать"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => {
                if (confirm('Удалить работу и все её этапы?')) {
                  onDelete();
                }
              }}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
              title="Удалить"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        
        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={clsx('px-2 py-1 rounded flex items-center gap-1', priorityConfig.bg, priorityConfig.color)}>
            <Flag size={12} />
            {priorityConfig.label}
          </span>
          
          {dc && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin size={14} />
              {dc.name}
            </span>
          )}
          
          {work.dueDate && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar size={14} />
              До {work.dueDate}
            </span>
          )}
          
          {work.workType === 'support' && work.durationHours && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock size={14} />
              {work.durationHours}ч
            </span>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        {work.description && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Описание</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{work.description}</p>
          </div>
        )}
        
        {/* Progress */}
        {work.workType === 'general' && workChunks.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-foreground">Прогресс</span>
              <span className="text-muted-foreground">{completedChunks}/{workChunks.length} этапов</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Chunks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Этапы работ</h3>
            <button
              onClick={onAddChunk}
              className="text-xs flex items-center gap-1 text-primary hover:underline font-medium"
            >
              <Plus size={12} />
              Добавить
            </button>
          </div>
          
          {workChunks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border rounded-lg">
              <Clock size={24} className="mx-auto mb-2 opacity-50" />
              <p>Нет этапов</p>
              <button
                onClick={onAddChunk}
                className="mt-2 text-primary hover:underline text-xs"
              >
                Добавить первый этап
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {workChunks.map(chunk => (
                <ChunkCard
                  key={chunk.id}
                  chunk={chunk}
                  allChunks={workChunks}
                  dataCenters={dataCenters}
                  workDataCenterId={work.dataCenterId}
                  onEdit={() => onEditChunk(chunk)}
                  onDelete={() => {
                    if (confirm('Удалить этап?')) {
                      onDeleteChunk(chunk.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Attachments - always show upload area */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Файлы</h3>
          <FileUpload
            workId={work.id}
            attachments={work.attachments || []}
            onUploadComplete={() => {
              // Trigger refresh - parent should refetch
              onUpdateStatus(work.status);
            }}
            onDeleteComplete={() => {
              onUpdateStatus(work.status);
            }}
          />
        </div>
      </div>
      
      {/* Footer actions */}
      <div className="p-4 border-t border-border bg-muted/30">
        <div className="flex items-center gap-2">
          {work.status === 'created' && (
            <button
              onClick={() => onUpdateStatus('in_progress')}
              className="btn-primary flex-1 text-sm"
            >
              <Play size={14} className="mr-1" />
              Начать работу
            </button>
          )}
          {work.status === 'in_progress' && (
            <>
              <button
                onClick={() => onUpdateStatus('completed')}
                className="btn-success flex-1 text-sm"
              >
                <CheckCircle2 size={14} className="mr-1" />
                Завершить
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
