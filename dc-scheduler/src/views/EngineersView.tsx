import React from 'react';
import { useEngineerStore } from '../stores/engineerStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { useWorkStore } from '../stores/workStore';
import { addDays, format, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, UserPlus, Users, CalendarPlus, Plus, ChevronDown, Clock, MapPin } from 'lucide-react';
import { GenericAddModal } from '../components/ui/GenericAddModal';
import { ScheduleModal } from '../components/ui/ScheduleModal';
import type { FieldConfig } from '../components/ui/GenericAddModal';
import clsx from 'clsx';

export const EngineersView: React.FC = () => {
  const { engineers, addEngineer, addSlot, removeSlot, applySchedulePattern } = useEngineerStore();
  const { regions, dataCenters } = useDataCenterStore();
  const { chunks, works } = useWorkStore();
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  
  // Schedule modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = React.useState(false);
  const [selectedEngineer, setSelectedEngineer] = React.useState<{ id: string; name: string } | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | undefined>(undefined);
  
  // Expanded engineer for showing assigned chunks
  const [expandedEngineerId, setExpandedEngineerId] = React.useState<string | null>(null);

  const today = startOfToday();
  const startDate = addDays(today, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  
  // Get assigned chunks for an engineer on a specific date
  const getEngineerChunksForDate = (engineerId: string, date: string) => {
    return chunks.filter(c => 
      (c.status === 'assigned' || c.status === 'planned') && 
      c.assignedEngineerId === engineerId && 
      c.assignedDate === date
    ).sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
  };
  
  // Calculate utilization for a slot
  const getSlotUtilization = (engineerId: string, date: string, slotStart: number, slotEnd: number) => {
    const slotChunks = chunks.filter(c => 
      (c.status === 'assigned' || c.status === 'planned') && 
      c.assignedEngineerId === engineerId && 
      c.assignedDate === date
    );
    const usedHours = slotChunks.reduce((acc, c) => acc + c.durationHours, 0);
    const totalHours = slotEnd - slotStart;
    return { usedHours, totalHours, percentage: totalHours > 0 ? (usedHours / totalHours) * 100 : 0 };
  };
  
  // Get stats for an engineer
  const getEngineerStats = (engineerId: string) => {
    const engineerChunks = chunks.filter(c => c.assignedEngineerId === engineerId);
    return {
      planned: engineerChunks.filter(c => c.status === 'planned').length,
      assigned: engineerChunks.filter(c => c.status === 'assigned').length,
      total: engineerChunks.length,
    };
  };

  const handleAddEngineer = (data: any) => {
    addEngineer({
      id: `e${Date.now()}`,
      name: data.name,
      regionId: data.regionId,
      schedule: {},
    });
  };

  const openScheduleModal = (engineer: { id: string; name: string }, date?: string) => {
    setSelectedEngineer(engineer);
    setSelectedDate(date);
    setIsScheduleModalOpen(true);
  };

  const closeScheduleModal = () => {
    setIsScheduleModalOpen(false);
    setSelectedEngineer(null);
    setSelectedDate(undefined);
  };

  const fields: FieldConfig[] = [
    { name: 'name', label: 'ФИО Инженера', type: 'text', required: true, placeholder: 'Иванов И.И.' },
    { 
      name: 'regionId', 
      label: 'Регион', 
      type: 'select', 
      required: true,
      options: regions.map(r => ({ label: r.name, value: r.id }))
    },
  ];

  const engineersByRegion = React.useMemo(() => {
    const grouped: Record<string, typeof engineers> = {};
    regions.forEach(r => grouped[r.id] = []);
    engineers.forEach(e => {
      if (grouped[e.regionId]) {
        grouped[e.regionId].push(e);
      }
    });
    return grouped;
  }, [engineers, regions]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Инженеры</h2>
          <p className="text-muted-foreground mt-1">График работы инженеров по регионам</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
          <UserPlus size={16} className="mr-2" />
          Добавить инженера
        </button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => setWeekOffset(w => w - 1)}
          className="btn-ghost btn-icon"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <span className="font-medium text-foreground">
            {format(days[0], 'd MMMM', { locale: ru })} — {format(days[6], 'd MMMM yyyy', { locale: ru })}
          </span>
        </div>
        <button 
          onClick={() => setWeekOffset(w => w + 1)}
          className="btn-ghost btn-icon"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Schedule Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 font-semibold text-foreground min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    Инженер
                  </div>
                </th>
                {days.map(day => {
                  const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                  return (
                    <th 
                      key={day.toString()} 
                      className={clsx(
                        "text-center p-4 min-w-[120px]",
                        isToday && "bg-primary/5"
                      )}
                    >
                      <div className={clsx(
                        "font-medium capitalize",
                        isToday ? "text-primary" : "text-foreground"
                      )}>
                        {format(day, 'EEEE', { locale: ru })}
                      </div>
                      <div className={clsx(
                        "text-sm",
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
                const regionEngineers = engineersByRegion[region.id];
                if (!regionEngineers || regionEngineers.length === 0) return null;

                return (
                  <React.Fragment key={region.id}>
                    <tr className="bg-muted/30">
                      <td colSpan={8} className="px-4 py-2 font-semibold text-foreground">
                        {region.name}
                      </td>
                    </tr>
                    {regionEngineers.map(engineer => {
                      const isExpanded = expandedEngineerId === engineer.id;
                      
                      return (
                        <React.Fragment key={engineer.id}>
                          <tr className="border-b border-border hover:bg-muted/20 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setExpandedEngineerId(isExpanded ? null : engineer.id)}
                                  className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm hover:bg-primary/20 transition-colors"
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : engineer.name.split(' ').map(n => n[0]).join('')}
                                </button>
                                <div className="flex flex-col">
                                  <span 
                                    className="font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
                                    onClick={() => setExpandedEngineerId(isExpanded ? null : engineer.id)}
                                  >
                                    {engineer.name}
                                  </span>
                                  {(() => {
                                    const stats = getEngineerStats(engineer.id);
                                    if (stats.total === 0) return null;
                                    return (
                                      <div className="flex items-center gap-2 text-[10px]">
                                        {stats.planned > 0 && (
                                          <span className="text-warning">План: {stats.planned}</span>
                                        )}
                                        {stats.assigned > 0 && (
                                          <span className="text-success">Утв: {stats.assigned}</span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <button
                                  onClick={() => openScheduleModal({ id: engineer.id, name: engineer.name })}
                                  className="ml-auto text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                                  title="Настроить график"
                                >
                                  <CalendarPlus size={16} />
                                </button>
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
                                    "p-2 text-center relative group",
                                    isToday && "bg-primary/5"
                                  )}
                                >
                                  {slots.length > 0 ? (
                                    <div 
                                      className="space-y-1 cursor-pointer"
                                      onClick={() => openScheduleModal({ id: engineer.id, name: engineer.name }, dateKey)}
                                    >
                                      {slots.map((slot, idx) => {
                                        const util = getSlotUtilization(engineer.id, dateKey, slot.start, slot.end);
                                        const isFull = util.percentage >= 100;
                                        const hasWork = util.usedHours > 0;
                                        
                                        return (
                                          <div 
                                            key={idx} 
                                            className={clsx(
                                              "text-xs px-2 py-1.5 rounded-md font-medium border transition-colors",
                                              isFull 
                                                ? "bg-warning/10 text-warning border-warning/20" 
                                                : hasWork
                                                  ? "bg-primary/10 text-primary border-primary/20"
                                                  : "bg-success/10 text-success border-success/20 hover:bg-success/20"
                                            )}
                                          >
                                            <div className="flex items-center justify-between gap-1">
                                              <span>{slot.start}:00 — {slot.end}:00</span>
                                              <span className="text-[10px] opacity-75">
                                                {util.usedHours}/{util.totalHours}ч
                                              </span>
                                            </div>
                                            {hasWork && (
                                              <div className="h-1 bg-current/20 rounded-full mt-1 overflow-hidden">
                                                <div 
                                                  className="h-full bg-current rounded-full transition-all"
                                                  style={{ width: `${Math.min(util.percentage, 100)}%` }}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => openScheduleModal({ id: engineer.id, name: engineer.name }, dateKey)}
                                      className="w-full h-full min-h-[40px] flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors group"
                                    >
                                      <span className="group-hover:hidden">—</span>
                                      <Plus size={16} className="hidden group-hover:block text-primary" />
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                          
                          {/* Expanded row with assigned chunks */}
                          {isExpanded && (
                            <tr className="bg-muted/20">
                              <td colSpan={8} className="p-4">
                                <div className="text-sm font-medium text-foreground mb-3">
                                  Назначенные работы
                                </div>
                                <div className="grid grid-cols-7 gap-2">
                                  {days.map(day => {
                                    const dateKey = format(day, 'yyyy-MM-dd');
                                    const dayChunks = getEngineerChunksForDate(engineer.id, dateKey);
                                    const isToday = dateKey === format(today, 'yyyy-MM-dd');
                                    
                                    return (
                                      <div 
                                        key={dateKey}
                                        className={clsx(
                                          "min-h-[100px] p-2 rounded-lg border",
                                          isToday ? "bg-primary/5 border-primary/20" : "bg-card border-border"
                                        )}
                                      >
                                        <div className="text-xs text-muted-foreground mb-2">
                                          {format(day, 'dd.MM')}
                                        </div>
                                        {dayChunks.length > 0 ? (
                                          <div className="space-y-1.5">
                                            {dayChunks.map(chunk => {
                                              const work = works.find(w => w.id === chunk.workId);
                                              const dcId = chunk.dataCenterId ?? work?.dataCenterId;
                                              const dc = dataCenters.find(d => d.id === dcId);
                                              const startTime = chunk.assignedStartTime ?? 0;
                                              
                                              return (
                                                <div 
                                                  key={chunk.id}
                                                  className="p-2 bg-primary/5 border border-primary/20 rounded text-xs"
                                                >
                                                  <div className="flex items-center justify-between gap-1 mb-1">
                                                    <span className="font-medium text-foreground truncate">
                                                      {chunk.title}
                                                    </span>
                                                    <span className="text-muted-foreground flex items-center gap-0.5">
                                                      <Clock size={10} />
                                                      {chunk.durationHours}ч
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center justify-between text-muted-foreground">
                                                    <span>{startTime}:00-{startTime + chunk.durationHours}:00</span>
                                                    {dc && (
                                                      <span className="flex items-center gap-0.5">
                                                        <MapPin size={10} />
                                                        {dc.name}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-muted-foreground text-center py-4">
                                            —
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <GenericAddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Добавить инженера"
        fields={fields}
        onSubmit={handleAddEngineer}
      />

      {selectedEngineer && (
        <ScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={closeScheduleModal}
          engineerName={selectedEngineer.name}
          engineerId={selectedEngineer.id}
          selectedDate={selectedDate}
          existingSlots={selectedDate ? (engineers.find(e => e.id === selectedEngineer.id)?.schedule[selectedDate] || []) : []}
          onAddSlot={addSlot}
          onRemoveSlot={removeSlot}
          onApplyPattern={applySchedulePattern}
        />
      )}
    </div>
  );
};
