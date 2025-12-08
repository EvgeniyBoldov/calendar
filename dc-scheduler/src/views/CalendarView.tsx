import React from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useWorkStore } from '../stores/workStore';
import { useEngineerStore } from '../stores/engineerStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { useDistanceStore } from '../stores/distanceStore';
import { DraggableItem } from '../components/calendar/DraggableItem';
import { DroppableSlot } from '../components/calendar/DroppableSlot';
import { addDays, format, startOfToday, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, ChevronRight, ChevronLeft, Calendar, Package, AlertTriangle, Check, Server, Briefcase, Flag, HeadphonesIcon, X } from 'lucide-react';
import { BulkPlanningMenu } from '../components/calendar/BulkPlanningMenu';
import { api } from '../api/client';
import type { SchedulableItem, Priority, WorkType, WorkChunk } from '../types';
import clsx from 'clsx';

const PRIORITY_LABELS: Record<Priority, string> = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const WORK_TYPE_LABELS: Record<WorkType, string> = { general: 'Работа', support: 'Сопровождение' };

interface ItemGroup {
  id: string;
  title: string;
  subtitle?: string;
  priority?: Priority;
  workType?: WorkType;
  items: SchedulableItem[];
}

export const CalendarView: React.FC = () => {
  const { 
    works, 
    chunks, 
    planItem, 
    unplanItem,
    confirmPlannedItems,
    cancelAllPlannedItems,
    hasPlannedItems,
    getPlannedItemsCount, 
    groupBy, 
    setGroupBy, 
    fetchWorks,
    getPendingItems,
    validateAssignment,
    updateChunk,
  } = useWorkStore();
  const { engineers } = useEngineerStore();
  const { regions, dataCenters } = useDataCenterStore();
  const { getTravelTime, fetchMatrix, matrix: travelMatrix } = useDistanceStore();

  const [activeItem, setActiveItem] = React.useState<SchedulableItem | null>(null);
  const [expandedRegions, setExpandedRegions] = React.useState<string[]>([]);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [dcConflictMessage, setDcConflictMessage] = React.useState<string | null>(null);
  
  // Bulk planning session state
  const [planningSession, setPlanningSession] = React.useState<any>(null);
  const [isPlanningLoading, setIsPlanningLoading] = React.useState(false);
  
  // Single item actions state
  const [loadingItemId, setLoadingItemId] = React.useState<string | null>(null);
  const [suggestedSlot, setSuggestedSlot] = React.useState<{
    itemId: string;
    suggestion: {
      engineerId: string;
      engineerName: string;
      date: string;
      startTime: number;
      endTime: number;
      durationHours: number;
    };
  } | null>(null);

  // Load distance matrix on mount
  React.useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const hasPending = hasPlannedItems();
  
  // Bulk planning handlers
  const handleCreatePlanningSession = async (strategy: string) => {
    setIsPlanningLoading(true);
    try {
      const session = await api.planning.createSession(strategy);
      setPlanningSession(session);
      return session;
    } catch (error) {
      console.error('Failed to create planning session:', error);
      throw error;
    } finally {
      setIsPlanningLoading(false);
    }
  };
  
  const handleApplyPlanningSession = async (sessionId: string) => {
    setIsPlanningLoading(true);
    try {
      await api.planning.applySession(sessionId);
      await fetchWorks(); // Refresh data
      setPlanningSession(null);
    } catch (error) {
      console.error('Failed to apply planning session:', error);
    } finally {
      setIsPlanningLoading(false);
    }
  };
  
  const handleCancelPlanningSession = async (sessionId: string) => {
    setIsPlanningLoading(true);
    try {
      await api.planning.cancelSession(sessionId);
      setPlanningSession(null);
    } catch (error) {
      console.error('Failed to cancel planning session:', error);
    } finally {
      setIsPlanningLoading(false);
    }
  };
  
  // Single item handlers
  const handleMoveChunk = (chunkId: string, direction: 'up' | 'down') => {
    const { chunks } = useWorkStore.getState();
    const chunk = chunks.find((c: WorkChunk) => c.id === chunkId);
    if (!chunk || !chunk.assignedEngineerId || !chunk.assignedDate) return;

    // Get all chunks in this slot
    const slotChunks = chunks.filter((c: WorkChunk) => 
      c.assignedEngineerId === chunk.assignedEngineerId && 
      c.assignedDate === chunk.assignedDate &&
      ['planned', 'assigned', 'in_progress', 'completed'].includes(c.status)
    ).sort((a: WorkChunk, b: WorkChunk) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));

    const currentIndex = slotChunks.findIndex((c: WorkChunk) => c.id === chunkId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= slotChunks.length) return;

    // Swap position in array
    const newOrder = [...slotChunks];
    [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];

    // Recalculate start times preserving the first start time (tight packing)
    let currentTime = Math.min(...slotChunks.map((c: WorkChunk) => c.assignedStartTime!));
    
    newOrder.forEach(async (c: WorkChunk) => {
        if (c.assignedStartTime !== currentTime) {
            await updateChunk(c.workId, c.id, { assignedStartTime: currentTime });
        }
        currentTime += c.durationHours;
    });
  };

  const handleSuggestSlot = async (item: SchedulableItem) => {
    setLoadingItemId(item.id);
    try {
      const result = await api.works.suggestSlot(item.workId, item.id);
      if (result.found && result.suggestion) {
        setSuggestedSlot({
          itemId: item.id,
          suggestion: result.suggestion
        });
      } else {
        setDcConflictMessage(result.reason || 'Не удалось найти подходящий слот');
        setTimeout(() => setDcConflictMessage(null), 5000);
      }
    } catch (error) {
      console.error('Failed to suggest slot:', error);
      setDcConflictMessage('Ошибка при поиске слота');
      setTimeout(() => setDcConflictMessage(null), 5000);
    } finally {
      setLoadingItemId(null);
    }
  };
  
  const handleAutoAssign = async (item: SchedulableItem) => {
    setLoadingItemId(item.id);
    try {
      await api.works.autoAssignChunk(item.workId, item.id);
      await fetchWorks(); // Refresh to get updated chunks
      setSuggestedSlot(null);
    } catch (error) {
      console.error('Failed to auto-assign:', error);
      setDcConflictMessage('Ошибка при авто-назначении');
      setTimeout(() => setDcConflictMessage(null), 5000);
    } finally {
      setLoadingItemId(null);
    }
  };
  
  const handleUnassignChunk = async (item: SchedulableItem) => {
    setLoadingItemId(item.id);
    try {
      await api.works.unassignChunk(item.workId, item.id);
      await fetchWorks();
    } catch (error) {
      console.error('Failed to unassign chunk:', error);
      setDcConflictMessage('Ошибка при отмене назначения');
      setTimeout(() => setDcConflictMessage(null), 5000);
    } finally {
      setLoadingItemId(null);
    }
  };
  
  const handleAcceptSuggestion = async () => {
    if (!suggestedSlot) return;
    const item = pendingItems.find(i => i.id === suggestedSlot.itemId);
    if (item) {
      await handleAutoAssign(item);
    }
    setSuggestedSlot(null);
  };

  React.useEffect(() => {
    setExpandedRegions(regions.map(r => r.id));
  }, [regions]);

  const toggleRegion = (id: string) => {
    setExpandedRegions(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const today = startOfToday();
  // Начало текущей недели (понедельник)
  const baseWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  // Смещаемся по неделям относительно текущей (weekOffset * 7 дней)
  const weekStart = addDays(baseWeekStart, weekOffset * 7);
  // Показываем полную неделю: понедельник–воскресенье
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const pendingItems = getPendingItems();
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: any) => {
    const item = event.active.data.current.item as SchedulableItem;
    // Don't allow dragging confirmed items
    if (item.status === 'assigned') return;
    setActiveItem(item);
    setDcConflictMessage(null);
  };

  // Get DC id for an item
  const getItemDcId = (item: SchedulableItem): string | undefined => {
    if (item.dataCenterId) return item.dataCenterId;
    const work = works.find(w => w.id === item.workId);
    return work?.dataCenterId;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const itemId = active.id as string;
    const slotId = over.id as string;

    if (!slotId.startsWith('slot:')) return;

    const [, engineerId, date, startTimeStr] = slotId.split(':');
    const startTime = parseInt(startTimeStr, 10);

    // Find the item being dragged
    const item = pendingItems.find(i => i.id === itemId);
    if (!item || item.status === 'assigned') return;

    // Validate date constraints
    const validation = validateAssignment(itemId, date);
    if (!validation.valid) {
      setDcConflictMessage(validation.error || 'Ошибка валидации');
      setTimeout(() => setDcConflictMessage(null), 5000);
      return;
    }

    // Check DC conflict with travel time consideration
    const itemDcId = getItemDcId(item);
    if (itemDcId) {
      const engineerChunksOnDate = chunks.filter(c => 
        (c.status === 'assigned' || c.status === 'planned') && 
        c.assignedEngineerId === engineerId && 
        c.assignedDate === date &&
        c.id !== itemId
      ).sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
      
      // Check if there's enough time for travel between DCs
      for (const existingChunk of engineerChunksOnDate) {
        const existingDcId = existingChunk.dataCenterId || works.find(w => w.id === existingChunk.workId)?.dataCenterId;
        
        if (existingDcId && existingDcId !== itemDcId) {
          const travelMinutes = getTravelTime(existingDcId, itemDcId);
          const travelHours = Math.ceil(travelMinutes / 60);
          
          // Check if new item starts after existing + travel time
          const existingEnd = (existingChunk.assignedStartTime ?? 0) + existingChunk.durationHours;
          const newStart = startTime;
          
          // Check if existing starts after new + travel time
          const newEnd = startTime + item.durationHours;
          const existingStart = existingChunk.assignedStartTime ?? 0;
          
          const hasTimeGapAfterExisting = newStart >= existingEnd + travelHours;
          const hasTimeGapBeforeExisting = existingStart >= newEnd + travelHours;
          
          if (!hasTimeGapAfterExisting && !hasTimeGapBeforeExisting) {
            const newDc = dataCenters.find(d => d.id === itemDcId);
            const existingDc = dataCenters.find(d => d.id === existingDcId);
            setDcConflictMessage(
              `Недостаточно времени на дорогу между ДЦ! ` +
              `"${existingDc?.name}" → "${newDc?.name}": ${travelMinutes} мин. ` +
              `Нужен перерыв минимум ${travelHours}ч между задачами.`
            );
            setTimeout(() => setDcConflictMessage(null), 5000);
            return;
          }
        }
      }
    }

    // Plan the item (not confirm yet)
    planItem(itemId, engineerId, date, startTime);
  };

  const getSlotChunks = (engineerId: string, date: string) => {
    // Get real chunks from store (already assigned or planned via drag-drop)
    const realChunks = chunks.filter(c => 
      (c.status === 'assigned' || c.status === 'planned') && 
      c.assignedEngineerId === engineerId && 
      c.assignedDate === date
    ).sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));

    // If there's an active planning session, add preview chunks from session assignments
    if (planningSession && planningSession.assignments) {
      const sessionAssignments = planningSession.assignments.filter((a: any) => 
        a.engineerId === engineerId && a.date === date
      );
      
      // Create preview chunks from session assignments
      const previewChunks = sessionAssignments.map((a: any) => {
        // Find the original chunk to get its data
        const originalChunk = chunks.find(c => c.id === a.chunkId);
        if (!originalChunk) return null;
        
        // Don't add preview if chunk is already in realChunks (already planned/assigned)
        if (realChunks.some(rc => rc.id === a.chunkId)) return null;
        
        return {
          ...originalChunk,
          status: 'planned' as const,
          assignedEngineerId: engineerId,
          assignedDate: date,
          assignedStartTime: a.startTime,
          durationHours: a.durationHours || originalChunk.durationHours,
          isPreview: true, // Mark as preview for styling
        };
      }).filter(Boolean) as WorkChunk[];
      
      // Combine and sort by start time
      return [...realChunks, ...previewChunks].sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
    }

    return realChunks;
  };

  // Group pending items based on groupBy setting
  const groupedPendingItems: ItemGroup[] = React.useMemo(() => {
    if (groupBy === 'work') {
      // Group by work type: General vs Support
      const generalItems = pendingItems.filter((i: SchedulableItem) => i.workType === 'general');
      const supportItems = pendingItems.filter((i: SchedulableItem) => i.workType === 'support');
      
      const groups: ItemGroup[] = [];
      
      if (generalItems.length > 0) {
        groups.push({
          id: 'general',
          title: 'Проектные работы',
          items: generalItems
        });
      }
      
      if (supportItems.length > 0) {
        groups.push({
          id: 'support',
          title: 'Сопровождение',
          items: supportItems
        });
      }
      
      return groups;
    } else if (groupBy === 'dc') {
      const dcGroups: Record<string, ItemGroup> = {};
      pendingItems.forEach((item: SchedulableItem) => {
        const dcId = item.dataCenterId ?? 'unknown';
        if (!dcGroups[dcId]) {
          const dc = dataCenters.find(d => d.id === dcId);
          dcGroups[dcId] = { id: dcId, title: dc?.name || 'Без ДЦ', items: [] };
        }
        dcGroups[dcId].items.push(item);
      });
      return Object.values(dcGroups);
    } else {
      // Group by priority
      const priorityGroups: Record<Priority, ItemGroup> = {
        critical: { id: 'critical', title: 'Критический', priority: 'critical', items: [] },
        high: { id: 'high', title: 'Высокий', priority: 'high', items: [] },
        medium: { id: 'medium', title: 'Средний', priority: 'medium', items: [] },
        low: { id: 'low', title: 'Низкий', priority: 'low', items: [] },
      };
      pendingItems.forEach(item => {
        const priority = item.priority ?? 'medium';
        priorityGroups[priority].items.push(item);
      });
      return Object.values(priorityGroups).filter(g => g.items.length > 0);
    }
  }, [pendingItems, works, dataCenters, groupBy]);

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
            <p className="text-muted-foreground mt-1">Распределение задач по инженерам по неделям</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Bulk Planning Menu */}
            <BulkPlanningMenu
              onCreateSession={handleCreatePlanningSession}
              onApplySession={handleApplyPlanningSession}
              onCancelSession={handleCancelPlanningSession}
              activeSession={planningSession}
              isLoading={isPlanningLoading}
            />
            
            {/* Confirmation banner for planned items */}
            {hasPending && !planningSession && (
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={16} />
                  <span className="text-sm font-medium">
                    Предложено {getPlannedItemsCount()} назначений
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={confirmPlannedItems}
                    className="btn-primary btn-sm flex items-center gap-1"
                  >
                    <Check size={14} />
                    Утвердить все
                  </button>
                  <button 
                    onClick={cancelAllPlannedItems}
                    className="btn-ghost btn-sm flex items-center gap-1 text-destructive hover:bg-destructive/10"
                  >
                    <X size={14} />
                    Отменить
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset(w => w - 1)} className="btn-ghost btn-icon" title="Предыдущая неделя">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setWeekOffset(0)} className="btn-secondary">
                <Calendar size={16} className="mr-2" />
                Текущая неделя
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="btn-ghost btn-icon" title="Следующая неделя">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Calendar Grid */}
          <div className="flex-1 card overflow-hidden">
            <div className="overflow-auto h-full">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-card border-b border-border">
                    <th className="text-left p-4 font-semibold text-foreground min-w-[180px] bg-card sticky left-0 z-30 border-r border-border shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                      Инженер
                    </th>
                    {days.map(day => {
                      const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                      return (
                        <th 
                          key={day.toString()} 
                          className={clsx(
                            "text-center p-3 min-w-[160px] bg-card border-b border-border",
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
                    // Показываем только инженеров с хотя бы одной сменой в видимом диапазоне дней
                    const dateKeys = days.map(day => format(day, 'yyyy-MM-dd'));
                    const regionEngineers = engineers.filter(e => {
                      if (e.regionId !== region.id) return false;
                      return dateKeys.some(dateKey => (e.schedule[dateKey] || []).length > 0);
                    });
                    const isExpanded = expandedRegions.includes(region.id);

                    if (regionEngineers.length === 0) return null;

                    return (
                      <React.Fragment key={region.id}>
                        <tr className="bg-muted/50">
                          <td colSpan={1} className="sticky left-0 z-10 bg-muted/95 border-r border-border backdrop-blur-sm">
                            <button 
                              onClick={() => toggleRegion(region.id)}
                              className="w-full px-4 py-2 font-semibold text-foreground flex items-center gap-2 hover:bg-muted transition-colors text-left"
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              {region.name}
                              <span className="badge-secondary ml-2">{regionEngineers.length}</span>
                            </button>
                          </td>
                          <td colSpan={7} className="bg-muted/50"></td>
                        </tr>
                        
                        {isExpanded && regionEngineers.map(engineer => (
                          <tr key={engineer.id} className="border-b border-border">
                            <td className="p-3 bg-card sticky left-0 z-10 border-r border-border shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                                  {engineer.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <span className="font-medium text-foreground text-sm">{engineer.name}</span>
                              </div>
                            </td>
                            {days.map(day => {
                              const dateKey = format(day, 'yyyy-MM-dd');
                              const allSlots = engineer.schedule[dateKey] || [];
                              // Filter duplicate slots
                              const slots = allSlots.filter((slot, index, self) => 
                                index === self.findIndex(s => s.start === slot.start && s.end === slot.end)
                              );
                              
                              const isToday = dateKey === format(today, 'yyyy-MM-dd');

                              return (
                                <td 
                                  key={dateKey} 
                                  className={clsx(
                                    "p-2 align-top border-b border-border",
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
                                            engineerId={engineer.id}
                                            engineerRegionId={engineer.regionId}
                                            date={dateKey}
                                            startTime={slot.start}
                                            endTime={slot.end}
                                            assignedChunks={assigned}
                                            capacity={slot.end - slot.start}
                                            activeItem={activeItem}
                                            works={works}
                                            dataCenters={dataCenters}
                                            travelMatrix={travelMatrix}
                                            allChunks={chunks}
                                            onMoveChunk={handleMoveChunk}
                                            onUnassignItem={(itemId: string) => {
                                              const chunk = assigned.find((c: WorkChunk) => c.id === itemId);
                                              if (chunk) {
                                                const work = works.find((w: { id: string }) => w.id === chunk.workId);
                                                handleUnassignChunk({
                                                  id: chunk.id,
                                                  type: 'chunk',
                                                  title: chunk.title,
                                                  durationHours: chunk.durationHours,
                                                  workId: chunk.workId,
                                                  workName: work?.name || '',
                                                  workType: work?.workType || 'general',
                                                  priority: work?.priority || 'medium',
                                                  status: chunk.status,
                                                });
                                              }
                                            }}
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
            
            {/* Show message when planning session is active */}
            {planningSession && planningSession.status === 'draft' ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check size={32} className="mx-auto mb-2 text-primary" />
                <p className="text-sm">Все задачи распределены</p>
                <p className="text-xs mt-1">Нажмите "Утвердить" для подтверждения</p>
              </div>
            ) : groupedPendingItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check size={32} className="mx-auto mb-2 text-primary" />
                <p className="text-sm">Все задачи распределены</p>
              </div>
            ) : (
              groupedPendingItems.map(group => (
              <div key={group.id} className="mb-4">
                <div className="text-sm font-medium text-foreground mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {group.workType && (
                      <span className={clsx(
                        "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                        group.workType === 'support' ? "bg-purple-50 text-purple-700" :
                        "bg-blue-50 text-blue-700"
                      )}>
                        {group.workType === 'support' && <HeadphonesIcon size={10} />}
                        {group.workType === 'general' && <Briefcase size={10} />}
                        {WORK_TYPE_LABELS[group.workType]}
                      </span>
                    )}
                    <span>{group.title}</span>
                    {group.subtitle && (
                      <span className="text-xs text-muted-foreground">({group.subtitle})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {group.priority && (
                      <span className={clsx(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        group.priority === 'critical' ? "bg-destructive/10 text-destructive" :
                        group.priority === 'high' ? "bg-warning/10 text-warning" :
                        group.priority === 'medium' ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {PRIORITY_LABELS[group.priority]}
                      </span>
                    )}
                    <span className="badge-secondary">{group.items.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.items.map(item => {
                    const dc = dataCenters.find(d => d.id === item.dataCenterId);
                    const isItemLoading = loadingItemId === item.id;
                    const hasSuggestion = suggestedSlot?.itemId === item.id;
                    
                    return (
                      <div key={item.id}>
                        <DraggableItem 
                          item={item} 
                          dcName={dc?.name}
                          isLoading={isItemLoading}
                          onSuggestSlot={() => handleSuggestSlot(item)}
                          onAutoAssign={() => handleAutoAssign(item)}
                        />
                        
                        {/* Suggestion preview */}
                        {hasSuggestion && suggestedSlot && (
                          <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                            <div className="font-medium text-primary mb-1">Предложенный слот:</div>
                            <div className="text-muted-foreground space-y-0.5">
                              <div>👤 {suggestedSlot.suggestion.engineerName}</div>
                              <div>📅 {new Date(suggestedSlot.suggestion.date).toLocaleDateString('ru-RU')}</div>
                              <div>🕐 {suggestedSlot.suggestion.startTime}:00 — {suggestedSlot.suggestion.endTime}:00</div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={handleAcceptSuggestion}
                                className="flex-1 px-2 py-1 bg-primary text-primary-foreground rounded text-[10px] hover:bg-primary/90"
                              >
                                Принять
                              </button>
                              <button
                                onClick={() => setSuggestedSlot(null)}
                                className="flex-1 px-2 py-1 bg-muted text-muted-foreground rounded text-[10px] hover:bg-muted/80"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
            )}

          </div>
        </div>
      </div>

      <DragOverlay>
        {activeItem ? <DraggableItem item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
