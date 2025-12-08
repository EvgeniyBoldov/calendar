import React from 'react';
import { useWorkStore } from '../stores/workStore';
import { useEngineerStore } from '../stores/engineerStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { 
  Calendar, Clock, MapPin, CheckCircle2, Circle, Timer, 
  ChevronLeft, ChevronRight, FileText, User
} from 'lucide-react';
import { format, addDays, startOfToday, startOfWeek, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { WorkChunk, ChunkStatus } from '../types';
import clsx from 'clsx';

const STATUS_CONFIG: Record<ChunkStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  created: { label: 'Создан', color: 'text-muted-foreground', bg: 'bg-muted', icon: Circle },
  planned: { label: 'Запланирован', color: 'text-warning', bg: 'bg-warning/10', icon: Timer },
  assigned: { label: 'Назначен', color: 'text-primary', bg: 'bg-primary/10', icon: Calendar },
  in_progress: { label: 'В работе', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Timer },
  completed: { label: 'Выполнен', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
};

export const EngineerDashboard: React.FC = () => {
  const { works, chunks, updateChunk } = useWorkStore();
  const { engineers } = useEngineerStore();
  const { dataCenters } = useDataCenterStore();
  
  // For demo, select first engineer or allow selection
  const [selectedEngineerId, setSelectedEngineerId] = React.useState<string | null>(null);
  const [weekOffset, setWeekOffset] = React.useState(0);
  
  // Select first engineer by default
  React.useEffect(() => {
    if (!selectedEngineerId && engineers.length > 0) {
      setSelectedEngineerId(engineers[0].id);
    }
  }, [engineers, selectedEngineerId]);
  
  // Week navigation
  const today = startOfToday();
  const baseWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekStart = addDays(baseWeekStart, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Get chunks assigned to this engineer
  const myChunks = React.useMemo(() => {
    if (!selectedEngineerId) return [];
    return chunks.filter(c => 
      c.assignedEngineerId === selectedEngineerId &&
      (c.status === 'assigned' || c.status === 'planned' || c.status === 'completed')
    );
  }, [chunks, selectedEngineerId]);
  
  // Group chunks by date
  const chunksByDate = React.useMemo(() => {
    const grouped: Record<string, WorkChunk[]> = {};
    myChunks.forEach(chunk => {
      if (chunk.assignedDate) {
        if (!grouped[chunk.assignedDate]) {
          grouped[chunk.assignedDate] = [];
        }
        grouped[chunk.assignedDate].push(chunk);
      }
    });
    // Sort by start time
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
    });
    return grouped;
  }, [myChunks]);
  
  // Today's tasks
  const todayKey = format(today, 'yyyy-MM-dd');
  const todayChunks = chunksByDate[todayKey] || [];
  
  // Stats
  const stats = React.useMemo(() => {
    const weekDates = days.map(d => format(d, 'yyyy-MM-dd'));
    const weekChunks = myChunks.filter(c => c.assignedDate && weekDates.includes(c.assignedDate));
    
    return {
      todayTasks: todayChunks.length,
      todayCompleted: todayChunks.filter(c => c.status === 'completed').length,
      weekTasks: weekChunks.length,
      weekCompleted: weekChunks.filter(c => c.status === 'completed').length,
      totalHoursToday: todayChunks.reduce((sum, c) => sum + c.durationHours, 0),
    };
  }, [myChunks, todayChunks, days]);
  
  // Handle status change
  const handleStatusChange = async (chunk: WorkChunk, newStatus: ChunkStatus) => {
    await updateChunk(chunk.workId, chunk.id, { status: newStatus });
  };
  
  // Get work info for a chunk
  const getWorkInfo = (chunk: WorkChunk) => {
    const work = works.find(w => w.id === chunk.workId);
    return work;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Кабинет инженера</h2>
          <p className="text-muted-foreground mt-1">Ваши задачи и расписание</p>
        </div>
        
        {/* Engineer selector */}
        <div className="flex items-center gap-3">
          <User size={18} className="text-muted-foreground" />
          <select
            value={selectedEngineerId || ''}
            onChange={(e) => setSelectedEngineerId(e.target.value)}
            className="input"
          >
            {engineers.map(eng => (
              <option key={eng.id} value={eng.id}>{eng.name}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.todayTasks}</p>
              <p className="text-sm text-muted-foreground">Задач сегодня</p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <CheckCircle2 size={20} className="text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.todayCompleted}/{stats.todayTasks}</p>
              <p className="text-sm text-muted-foreground">Выполнено сегодня</p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Clock size={20} className="text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.totalHoursToday}ч</p>
              <p className="text-sm text-muted-foreground">Часов сегодня</p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <FileText size={20} className="text-secondary-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.weekCompleted}/{stats.weekTasks}</p>
              <p className="text-sm text-muted-foreground">За неделю</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Today's Tasks */}
        <div className="col-span-2">
          <div className="card">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Задачи на сегодня</h3>
              <span className="text-sm text-muted-foreground">
                {format(today, 'd MMMM, EEEE', { locale: ru })}
              </span>
            </div>
            
            <div className="p-4">
              {todayChunks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Нет задач на сегодня</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayChunks.map(chunk => {
                    const work = getWorkInfo(chunk);
                    const statusConfig = STATUS_CONFIG[chunk.status];
                    const StatusIcon = statusConfig.icon;
                    const dc = dataCenters.find(d => d.id === (chunk.dataCenterId || work?.dataCenterId));
                    
                    return (
                      <div 
                        key={chunk.id}
                        className={clsx(
                          'p-4 rounded-lg border-2 transition-all',
                          chunk.status === 'completed' 
                            ? 'border-success/30 bg-success/5'
                            : 'border-border bg-card hover:border-primary/30'
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={clsx(
                                'text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1',
                                statusConfig.bg, statusConfig.color
                              )}>
                                <StatusIcon size={10} />
                                {statusConfig.label}
                              </span>
                              {chunk.assignedStartTime !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  {chunk.assignedStartTime}:00 - {chunk.assignedStartTime + chunk.durationHours}:00
                                </span>
                              )}
                            </div>
                            
                            <h4 className="font-semibold text-foreground">{chunk.title}</h4>
                            {work && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {work.name}
                              </p>
                            )}
                            
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
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
                          </div>
                          
                          {/* Actions */}
                          <div className="flex flex-col gap-2">
                            {chunk.status === 'assigned' && (
                              <button
                                onClick={() => handleStatusChange(chunk, 'completed')}
                                className="btn-success text-xs px-3 py-1.5"
                              >
                                <CheckCircle2 size={14} className="mr-1" />
                                Выполнено
                              </button>
                            )}
                            {chunk.status === 'completed' && (
                              <button
                                onClick={() => handleStatusChange(chunk, 'assigned')}
                                className="btn-ghost text-xs px-3 py-1.5"
                              >
                                Отменить
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Week Overview */}
        <div className="card">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Неделя</h3>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setWeekOffset(w => w - 1)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => setWeekOffset(0)}
                  className="text-xs text-primary hover:underline px-2"
                >
                  Сегодня
                </button>
                <button 
                  onClick={() => setWeekOffset(w => w + 1)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-2">
            {days.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayChunks = chunksByDate[dateKey] || [];
              const completedCount = dayChunks.filter(c => c.status === 'completed').length;
              const totalHours = dayChunks.reduce((sum, c) => sum + c.durationHours, 0);
              const isDayToday = isToday(day);
              
              return (
                <div 
                  key={dateKey}
                  className={clsx(
                    'p-3 rounded-lg mb-1 transition-colors',
                    isDayToday ? 'bg-primary/10' : 'hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={clsx(
                        'font-medium text-sm',
                        isDayToday ? 'text-primary' : 'text-foreground'
                      )}>
                        {format(day, 'EEEE', { locale: ru })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(day, 'd MMM', { locale: ru })}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      {dayChunks.length > 0 ? (
                        <>
                          <p className="text-sm font-medium">
                            {completedCount}/{dayChunks.length}
                          </p>
                          <p className="text-xs text-muted-foreground">{totalHours}ч</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Mini task indicators */}
                  {dayChunks.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {dayChunks.slice(0, 5).map(chunk => (
                        <div 
                          key={chunk.id}
                          className={clsx(
                            'w-2 h-2 rounded-full',
                            chunk.status === 'completed' ? 'bg-success' : 'bg-primary'
                          )}
                          title={chunk.title}
                        />
                      ))}
                      {dayChunks.length > 5 && (
                        <span className="text-xs text-muted-foreground">+{dayChunks.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
