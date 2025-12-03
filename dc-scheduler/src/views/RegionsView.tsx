import React from 'react';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { useWorkStore } from '../stores/workStore';
import { ChevronRight, ChevronDown, Server, MapPin, Plus, Clock, ChevronLeft } from 'lucide-react';
import { GenericAddModal } from '../components/ui/GenericAddModal';
import type { FieldConfig } from '../components/ui/GenericAddModal';
import { addDays, format, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';

export const RegionsView: React.FC = () => {
  const { regions, dataCenters, addRegion, addDataCenter } = useDataCenterStore();
  const { chunks, works } = useWorkStore();
  const [expandedRegions, setExpandedRegions] = React.useState<string[]>([]);
  const [expandedDcId, setExpandedDcId] = React.useState<string | null>(null);
  const [weekOffset, setWeekOffset] = React.useState(0);
  
  const [isRegionModalOpen, setIsRegionModalOpen] = React.useState(false);
  const [isDCModalOpen, setIsDCModalOpen] = React.useState(false);
  const [selectedRegionId, setSelectedRegionId] = React.useState<string | null>(null);
  
  const today = startOfToday();
  const startDate = addDays(today, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  
  // Get chunks for a specific DC on a date
  const getDcChunksForDate = (dcId: string, date: string) => {
    return chunks.filter(c => {
      if ((c.status !== 'assigned' && c.status !== 'planned') || c.assignedDate !== date) return false;
      const chunkDcId = c.dataCenterId ?? works.find(w => w.id === c.workId)?.dataCenterId;
      return chunkDcId === dcId;
    }).sort((a, b) => (a.assignedStartTime ?? 0) - (b.assignedStartTime ?? 0));
  };
  
  // Get stats for a DC
  const getDcStats = (dcId: string) => {
    const dcChunks = chunks.filter(c => {
      const chunkDcId = c.dataCenterId ?? works.find(w => w.id === c.workId)?.dataCenterId;
      return chunkDcId === dcId;
    });
    return {
      planned: dcChunks.filter(c => c.status === 'planned').length,
      assigned: dcChunks.filter(c => c.status === 'assigned').length,
      total: dcChunks.length,
    };
  };

  const toggleRegion = (id: string) => {
    setExpandedRegions(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  React.useEffect(() => {
    setExpandedRegions(regions.map(r => r.id));
  }, [regions]);

  const handleAddRegion = (data: any) => {
    addRegion({
      id: `r${Date.now()}`,
      name: data.name,
    });
  };

  const handleAddDC = (data: any) => {
    if (!selectedRegionId) return;
    addDataCenter({
      id: `dc${Date.now()}`,
      regionId: selectedRegionId,
      name: data.name,
      description: data.description,
    });
  };

  const regionFields: FieldConfig[] = [
    { name: 'name', label: 'Название региона', type: 'text', required: true, placeholder: 'Например: Москва' },
  ];

  const dcFields: FieldConfig[] = [
    { name: 'name', label: 'Название датацентра', type: 'text', required: true, placeholder: 'Например: ДЦ-1' },
    { name: 'description', label: 'Описание', type: 'textarea', required: true, placeholder: 'Адрес, особенности...' },
  ];

  const openDCModal = (regionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRegionId(regionId);
    setIsDCModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Регионы и ДЦ</h2>
          <p className="text-muted-foreground mt-1">Управление датацентрами по регионам</p>
        </div>
        <button onClick={() => setIsRegionModalOpen(true)} className="btn-primary">
          <MapPin size={16} className="mr-2" />
          Добавить регион
        </button>
      </div>

      <div className="space-y-3">
        {regions.map(region => {
          const dcs = dataCenters.filter(dc => dc.regionId === region.id);
          const isExpanded = expandedRegions.includes(region.id);
          
          return (
            <div key={region.id} className="card overflow-hidden">
              <button 
                onClick={() => toggleRegion(region.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "p-2 rounded-lg transition-colors",
                    isExpanded ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-foreground">{region.name}</div>
                    <div className="text-sm text-muted-foreground">{dcs.length} датацентров</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => openDCModal(region.id, e)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus size={14} />
                    ДЦ
                  </button>
                  <span className="badge-secondary">{dcs.length}</span>
                </div>
              </button>
              
              {isExpanded && (
                <div className="border-t border-border bg-muted/30 p-4 space-y-2 animate-slide-in">
                  {dcs.length > 0 ? (
                    dcs.map(dc => {
                      const isDcExpanded = expandedDcId === dc.id;
                      const dcStats = getDcStats(dc.id);
                      
                      return (
                        <div key={dc.id} className="space-y-2">
                          <div 
                            onClick={() => setExpandedDcId(isDcExpanded ? null : dc.id)}
                            className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border hover:border-primary/50 hover:shadow-soft transition-all cursor-pointer"
                          >
                            <div className={clsx(
                              "p-2 rounded-lg transition-colors",
                              isDcExpanded ? "bg-primary text-primary-foreground" : "bg-primary/10"
                            )}>
                              {isDcExpanded ? <ChevronDown size={20} /> : <Server className="text-primary" size={20} />}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-foreground">{dc.name}</div>
                              <div className="text-sm text-muted-foreground">{dc.description}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {dcStats.planned > 0 && (
                                <span className="badge-warning text-[10px]">План: {dcStats.planned}</span>
                              )}
                              {dcStats.assigned > 0 && (
                                <span className="badge-success text-[10px]">Утв: {dcStats.assigned}</span>
                              )}
                              <span className="badge-success">Активен</span>
                            </div>
                          </div>
                          
                          {/* Expanded DC calendar */}
                          {isDcExpanded && (
                            <div className="ml-12 p-4 bg-card rounded-lg border border-border">
                              {/* Week navigation */}
                              <div className="flex items-center justify-between mb-4">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setWeekOffset(w => w - 1); }}
                                  className="btn-ghost btn-icon"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <span className="text-sm font-medium text-foreground">
                                  {format(days[0], 'd MMM', { locale: ru })} — {format(days[6], 'd MMM yyyy', { locale: ru })}
                                </span>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setWeekOffset(w => w + 1); }}
                                  className="btn-ghost btn-icon"
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                              
                              {/* Days grid */}
                              <div className="grid grid-cols-7 gap-2">
                                {days.map(day => {
                                  const dateKey = format(day, 'yyyy-MM-dd');
                                  const dayChunks = getDcChunksForDate(dc.id, dateKey);
                                  const isToday = dateKey === format(today, 'yyyy-MM-dd');
                                  
                                  return (
                                    <div 
                                      key={dateKey}
                                      className={clsx(
                                        "min-h-[120px] p-2 rounded-lg border",
                                        isToday ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"
                                      )}
                                    >
                                      <div className="text-xs font-medium text-foreground mb-1 capitalize">
                                        {format(day, 'EEE', { locale: ru })}
                                      </div>
                                      <div className="text-xs text-muted-foreground mb-2">
                                        {format(day, 'dd.MM')}
                                      </div>
                                      {dayChunks.length > 0 ? (
                                        <div className="space-y-1">
                                          {dayChunks.map(chunk => {
                                            const work = works.find(w => w.id === chunk.workId);
                                            const startTime = chunk.assignedStartTime ?? 0;
                                            
                                            return (
                                              <div 
                                                key={chunk.id}
                                                className="p-1.5 bg-primary/10 border border-primary/20 rounded text-xs"
                                              >
                                                <div className="font-medium text-foreground truncate">
                                                  {chunk.title}
                                                </div>
                                                <div className="flex items-center justify-between text-muted-foreground mt-0.5">
                                                  <span>{startTime}:00-{startTime + chunk.durationHours}:00</span>
                                                  <span className="flex items-center gap-0.5">
                                                    <Clock size={10} />
                                                    {chunk.durationHours}ч
                                                  </span>
                                                </div>
                                                {work && (
                                                  <div className="text-muted-foreground truncate mt-0.5">
                                                    {work.name}
                                                  </div>
                                                )}
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
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Нет датацентров в этом регионе
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <GenericAddModal
        isOpen={isRegionModalOpen}
        onClose={() => setIsRegionModalOpen(false)}
        title="Добавить новый регион"
        fields={regionFields}
        onSubmit={handleAddRegion}
      />

      <GenericAddModal
        isOpen={isDCModalOpen}
        onClose={() => setIsDCModalOpen(false)}
        title="Добавить датацентр"
        fields={dcFields}
        onSubmit={handleAddDC}
      />
    </div>
  );
};
