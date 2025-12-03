import React from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useWorkStore } from '../stores/workStore';
import { useEngineerStore } from '../stores/engineerStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { DraggableChunk } from '../components/calendar/DraggableChunk';
import { DroppableSlot } from '../components/calendar/DroppableSlot';
import { addDays, format, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, ChevronRight, ChevronLeft, Calendar, Package, AlertTriangle, Check, Server, Briefcase, Flag } from 'lucide-react';
import type { WorkChunk, Priority } from '../types';
import clsx from 'clsx';

const PRIORITY_LABELS: Record<Priority, string> = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' };

interface ChunkGroup {
  id: string;
  title: string;
  subtitle?: string;
  priority?: Priority;
  chunks: WorkChunk[];
}

export const CalendarView: React.FC = () => {
  const { works, chunks, planChunk, confirmPlannedChunks, hasPlannedChunks, moveChunkInSlot, groupBy, setGroupBy } = useWorkStore();
  const { engineers } = useEngineerStore();
  const { regions, dataCenters } = useDataCenterStore();

  const [activeChunk, setActiveChunk] = React.useState<WorkChunk | null>(null);
  const [expandedRegions, setExpandedRegions] = React.useState<string[]>([]);
  const [dayOffset, setDayOffset] = React.useState(0);
  const [dcConflictMessage, setDcConflictMessage] = React.useState<string | null>(null);

  const hasPending = hasPlannedChunks();

  React.useEffect(() => {
    setExpandedRegions(regions.map(r => r.id));
  }, [regions]);

  const toggleRegion = (id: string) => {
    setExpandedRegions(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const today = startOfToday();
  const startDate = addDays(today, dayOffset);
  const days = Array.from({ length: 5 }, (_, i) => addDays(startDate, i));

  const pendingChunks = chunks.filter(c => c.status === 'pending');
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: any) => {
    const chunk = event.active.data.current.chunk;
    // Don't allow dragging confirmed chunks
    if (chunk.status === 'assigned') return;
    setActiveChunk(chunk);
    setDcConflictMessage(null);
  };

  // Get DC id for a chunk (from chunk or from its work)
  const getChunkDcId = (chunk: WorkChunk): string | undefined => {
    if (chunk.dataCenterId) return chunk.dataCenterId;
    const work = works.find(w => w.id === chunk.workId);
    return work?.dataCenterId;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveChunk(null);

    if (!over) return;

    const chunkId = active.id as string;
    const slotId = over.id as string;

    if (!slotId.startsWith('slot:')) return;

    const [, engineerId, date, startTimeStr] = slotId.split(':');
    const startTime = parseInt(startTimeStr, 10);

    const chunk = chunks.find(c => c.id === chunkId);
    if (!chunk || chunk.status === 'assigned') return;

    // Check DC conflict: engineer can't work in different DCs on the same day
    const chunkDcId = getChunkDcId(chunk);
    if (chunkDcId) {
      const engineerChunksOnDate = chunks.filter(c => 
        (c.status === 'assigned' || c.status === 'planned') && 
        c.assignedEngineerId === engineerId && 
        c.assignedDate === date &&
        c.id !== chunkId
      );
      
      for (const existingChunk of engineerChunksOnDate) {
        const existingDcId = getChunkDcId(existingChunk);
        if (existingDcId && existingDcId !== chunkDcId) {
          const newDc = dataCenters.find(d => d.id === chunkDcId);
          const existingDc = dataCenters.find(d => d.id === existingDcId);
          setDcConflictMessage(
            `Инженер не может работать в разных ДЦ в один день! ` +
            `Уже назначен в "${existingDc?.name || existingDcId}", ` +
            `а вы пытаетесь назначить в "${newDc?.name || chunkDcId}".`
          );
          setTimeout(() => setDcConflictMessage(null), 5000);
          return;
        }
      }
    }

    // Plan the chunk (not confirm yet)
    planChunk(chunkId, engineerId, date, startTime);
  };

  const getSlotChunks = (engineerId: string, date: string) => {
    return chunks.filter(c => 
      (c.status === 'assigned' || c.status === 'planned') && 
      c.assignedEngineerId === engineerId && 
      c.assignedDate === date
    ).sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
  };

  // Group pending chunks based on groupBy setting
  const groupedPendingChunks: ChunkGroup[] = React.useMemo(() => {
    if (groupBy === 'work') {
      return works.map(work => ({
        id: work.id,
        title: work.name,
        subtitle: dataCenters.find(d => d.id === work.dataCenterId)?.name,
        priority: work.priority,
        chunks: pendingChunks.filter(c => c.workId === work.id),
      })).filter(g => g.chunks.length > 0);
    } else if (groupBy === 'dc') {
      const dcGroups: Record<string, ChunkGroup> = {};
      pendingChunks.forEach(chunk => {
        const dcId = chunk.dataCenterId ?? works.find(w => w.id === chunk.workId)?.dataCenterId ?? 'unknown';
        if (!dcGroups[dcId]) {
          const dc = dataCenters.find(d => d.id === dcId);
          dcGroups[dcId] = { id: dcId, title: dc?.name || 'Без ДЦ', chunks: [] };
        }
        dcGroups[dcId].chunks.push(chunk);
      });
      return Object.values(dcGroups);
    } else {
      // Group by priority
      const priorityGroups: Record<Priority, ChunkGroup> = {
        critical: { id: 'critical', title: 'Критический', priority: 'critical', chunks: [] },
        high: { id: 'high', title: 'Высокий', priority: 'high', chunks: [] },
        medium: { id: 'medium', title: 'Средний', priority: 'medium', chunks: [] },
        low: { id: 'low', title: 'Низкий', priority: 'low', chunks: [] },
      };
      pendingChunks.forEach(chunk => {
        const work = works.find(w => w.id === chunk.workId);
        const priority = chunk.priority ?? work?.priority ?? 'medium';
        priorityGroups[priority].chunks.push(chunk);
      });
      return Object.values(priorityGroups).filter(g => g.chunks.length > 0);
    }
  }, [pendingChunks, works, dataCenters, groupBy]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        {/* Header */}
        {/* DC Conflict Alert */}
        {dcConflictMessage && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-3">
            <AlertTriangle className="text-destructive" size={20} />
            <span className="text-destructive text-sm font-medium">{dcConflictMessage}</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Календарь работ</h2>
            <p className="text-muted-foreground mt-1">Распределение задач по инженерам</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Confirm button */}
            {hasPending && (
              <button 
                onClick={confirmPlannedChunks}
                className="btn-primary flex items-center gap-2 animate-pulse"
              >
                <Check size={16} />
                Утвердить план
              </button>
            )}
            
            <div className="flex items-center gap-2">
              <button onClick={() => setDayOffset(d => d - 5)} className="btn-ghost btn-icon">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setDayOffset(0)} className="btn-secondary">
                <Calendar size={16} className="mr-2" />
                Сегодня
              </button>
              <button onClick={() => setDayOffset(d => d + 5)} className="btn-ghost btn-icon">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Calendar Grid */}
          <div className="flex-1 card overflow-hidden">
            <div className="overflow-auto h-full">
              <table className="w-full">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border">
                    <th className="text-left p-4 font-semibold text-foreground min-w-[180px] bg-card">
                      Инженер
                    </th>
                    {days.map(day => {
                      const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                      return (
                        <th 
                          key={day.toString()} 
                          className={clsx(
                            "text-center p-3 min-w-[160px] bg-card",
                            isToday && "bg-primary/5"
                          )}
                        >
                          <div className={clsx(
                            "font-medium capitalize text-sm",
                            isToday ? "text-primary" : "text-foreground"
                          )}>
                            {format(day, 'EEEE', { locale: ru })}
                          </div>
                          <div className={clsx(
                            "text-xs",
                            isToday ? "text-primary" : "text-muted-foreground"
                          )}>
                            {format(day, 'dd.MM')}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {regions.map(region => {
                    const regionEngineers = engineers.filter(e => e.regionId === region.id);
                    const isExpanded = expandedRegions.includes(region.id);

                    if (regionEngineers.length === 0) return null;

                    return (
                      <React.Fragment key={region.id}>
                        <tr className="bg-muted/50">
                          <td colSpan={6}>
                            <button 
                              onClick={() => toggleRegion(region.id)}
                              className="w-full px-4 py-2 font-semibold text-foreground flex items-center gap-2 hover:bg-muted transition-colors text-left"
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              {region.name}
                              <span className="badge-secondary ml-2">{regionEngineers.length}</span>
                            </button>
                          </td>
                        </tr>
                        
                        {isExpanded && regionEngineers.map(engineer => (
                          <tr key={engineer.id} className="border-b border-border">
                            <td className="p-3 bg-card">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                                  {engineer.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <span className="font-medium text-foreground text-sm">{engineer.name}</span>
                              </div>
                            </td>
                            {days.map(day => {
                              const dateKey = format(day, 'yyyy-MM-dd');
                              const slots = engineer.schedule[dateKey] || [];
                              const isToday = dateKey === format(today, 'yyyy-MM-dd');

                              return (
                                <td 
                                  key={dateKey} 
                                  className={clsx(
                                    "p-2 align-top",
                                    isToday && "bg-primary/5"
                                  )}
                                >
                                  {slots.length > 0 ? (
                                    <div className="space-y-2">
                                      {slots.map((slot) => {
                                        const slotId = `slot:${engineer.id}:${dateKey}:${slot.start}`;
                                        const assigned = getSlotChunks(engineer.id, dateKey);
                                        return (
                                          <DroppableSlot 
                                            key={slotId}
                                            id={slotId}
                                            startTime={slot.start}
                                            endTime={slot.end}
                                            assignedChunks={assigned}
                                            capacity={slot.end - slot.start}
                                            activeChunk={activeChunk}
                                            works={works}
                                            dataCenters={dataCenters}
                                            onMoveChunk={moveChunkInSlot}
                                          />
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-center text-muted-foreground text-xs py-4">
                                      Нет смен
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar - Work Chunks */}
          <div className="w-80 card p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-primary" />
                <h3 className="font-semibold text-foreground">Задачи</h3>
              </div>
              {/* Group by selector */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <button
                  onClick={() => setGroupBy('work')}
                  className={clsx(
                    "p-1.5 rounded transition-colors",
                    groupBy === 'work' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="По работам"
                >
                  <Briefcase size={14} />
                </button>
                <button
                  onClick={() => setGroupBy('dc')}
                  className={clsx(
                    "p-1.5 rounded transition-colors",
                    groupBy === 'dc' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="По ДЦ"
                >
                  <Server size={14} />
                </button>
                <button
                  onClick={() => setGroupBy('priority')}
                  className={clsx(
                    "p-1.5 rounded transition-colors",
                    groupBy === 'priority' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="По приоритету"
                >
                  <Flag size={14} />
                </button>
              </div>
            </div>
            
            {groupedPendingChunks.map(group => (
              <div key={group.id} className="mb-4">
                <div className="text-sm font-medium text-foreground mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{group.title}</span>
                    {'subtitle' in group && group.subtitle && (
                      <span className="text-xs text-muted-foreground">({group.subtitle})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {'priority' in group && group.priority && (
                      <span className={clsx(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        group.priority === 'critical' ? "bg-destructive/10 text-destructive" :
                        group.priority === 'high' ? "bg-warning/10 text-warning" :
                        group.priority === 'medium' ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {PRIORITY_LABELS[group.priority as Priority]}
                      </span>
                    )}
                    <span className="badge-secondary">{group.chunks.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.chunks.map(chunk => {
                    const work = works.find(w => w.id === chunk.workId);
                    return (
                      <DraggableChunk key={chunk.id} chunk={chunk} workName={work?.name} />
                    );
                  })}
                </div>
              </div>
            ))}

            {pendingChunks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Все задачи распределены
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeChunk ? <DraggableChunk chunk={activeChunk} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
