import React from 'react';
import { Clock, MapPin, Link2, ArrowRight, Edit2, Trash2, CheckCircle2, Circle, Timer, UserCheck } from 'lucide-react';
import type { WorkChunk, DataCenter, ChunkStatus } from '../../types';
import clsx from 'clsx';

interface ChunkCardProps {
  chunk: WorkChunk;
  allChunks: WorkChunk[];
  dataCenters: DataCenter[];
  workDataCenterId?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

const STATUS_CONFIG: Record<ChunkStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  created: { label: 'Создан', color: 'text-muted-foreground', bg: 'bg-muted', icon: Circle },
  planned: { label: 'Запланирован', color: 'text-warning', bg: 'bg-warning/10', icon: Timer },
  assigned: { label: 'Назначен', color: 'text-primary', bg: 'bg-primary/10', icon: UserCheck },
  in_progress: { label: 'В работе', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Timer },
  completed: { label: 'Выполнен', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
};

export const ChunkCard: React.FC<ChunkCardProps> = ({
  chunk,
  allChunks,
  dataCenters,
  workDataCenterId,
  onEdit,
  onDelete,
  compact = false,
}) => {
  const statusConfig = STATUS_CONFIG[chunk.status];
  const StatusIcon = statusConfig.icon;
  
  const dcId = chunk.dataCenterId || workDataCenterId;
  const dc = dataCenters.find(d => d.id === dcId);
  
  // Get links info from chunk.links
  const syncLinks = chunk.links?.filter(l => l.linkType === 'sync') || [];
  const dependencyLinks = chunk.links?.filter(l => l.linkType === 'dependency') || [];
  
  const syncChunks = syncLinks
    .map(l => allChunks.find(c => c.id === l.linkedChunkId))
    .filter(Boolean) as WorkChunk[];
  
  const dependencyChunks = dependencyLinks
    .map(l => allChunks.find(c => c.id === l.linkedChunkId))
    .filter(Boolean) as WorkChunk[];

  if (compact) {
    return (
      <div className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all group',
        statusConfig.bg,
        'border-transparent'
      )}>
        <StatusIcon size={14} className={statusConfig.color} />
        <span className="font-medium text-sm flex-1 truncate">{chunk.title}</span>
        <span className="text-xs text-muted-foreground">{chunk.durationHours}ч</span>
      </div>
    );
  }

  return (
    <div className={clsx(
      'p-3 rounded-lg border-2 transition-all group',
      chunk.status === 'completed' 
        ? 'border-success/30 bg-success/5'
        : chunk.status === 'assigned'
        ? 'border-primary/30 bg-primary/5'
        : chunk.status === 'planned'
        ? 'border-warning/30 bg-warning/5'
        : 'border-border bg-card hover:border-primary/30'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">#{chunk.order}</span>
          <h4 className="font-medium text-foreground">{chunk.title}</h4>
        </div>
        
        {chunk.status === 'created' && (onEdit || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
              >
                <Edit2 size={12} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Description */}
      {chunk.description && (
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
          {chunk.description}
        </p>
      )}
      
      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {chunk.durationHours}ч
        </span>
        {dc && (
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {dc.name}
          </span>
        )}
      </div>
      
      {/* Links */}
      {(dependencyChunks.length > 0 || syncChunks.length > 0) && (
        <div className="pt-2 border-t border-border space-y-1">
          {dependencyChunks.map(dep => (
            <div key={dep.id} className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight size={10} />
              <span>После: <span className="font-medium">{dep.title}</span></span>
            </div>
          ))}
          {syncChunks.map(sync => (
            <div key={sync.id} className="flex items-center gap-1 text-xs text-primary">
              <Link2 size={10} />
              <span>Синхронно с: <span className="font-medium">{sync.title}</span></span>
            </div>
          ))}
        </div>
      )}
      
      {/* Status badge */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className={clsx('text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1', statusConfig.bg, statusConfig.color)}>
          <StatusIcon size={10} />
          {statusConfig.label}
        </span>
        
        {chunk.assignedDate && (
          <span className="text-xs text-muted-foreground">
            {chunk.assignedDate}
          </span>
        )}
      </div>
    </div>
  );
};
