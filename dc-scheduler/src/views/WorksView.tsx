import React from 'react';
import { useWorkStore } from '../stores/workStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { Clock, FileText, Calendar, Plus, MapPin, Flag, Edit2, Trash2 } from 'lucide-react';
import { GenericAddModal } from '../components/ui/GenericAddModal';
import type { FieldConfig } from '../components/ui/GenericAddModal';
import type { Work, WorkChunk, Priority } from '../types';
import clsx from 'clsx';

const PRIORITY_OPTIONS = [
  { label: 'Низкий', value: 'low' },
  { label: 'Средний', value: 'medium' },
  { label: 'Высокий', value: 'high' },
  { label: 'Критический', value: 'critical' },
];

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-primary/10 text-primary',
  high: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive',
};

export const WorksView: React.FC = () => {
  const { works, chunks, addWork, addChunk, updateWork, updateChunk, deleteWork, deleteChunk } = useWorkStore();
  const { dataCenters } = useDataCenterStore();
  
  const [isWorkModalOpen, setIsWorkModalOpen] = React.useState(false);
  const [isChunkModalOpen, setIsChunkModalOpen] = React.useState(false);
  const [selectedWorkId, setSelectedWorkId] = React.useState<string | null>(null);
  const [editingWork, setEditingWork] = React.useState<Work | null>(null);
  const [editingChunk, setEditingChunk] = React.useState<WorkChunk | null>(null);

  const handleAddWork = (data: any) => {
    addWork({
      id: `w${Date.now()}`,
      name: data.name,
      description: data.description,
      dueDate: data.dueDate,
      totalDurationHours: 0,
      dataCenterId: data.dataCenterId || undefined,
      priority: data.priority || 'medium',
    });
  };

  const handleEditWork = (data: any) => {
    if (!editingWork) return;
    updateWork(editingWork.id, {
      name: data.name,
      description: data.description,
      dueDate: data.dueDate,
      dataCenterId: data.dataCenterId || undefined,
      priority: data.priority || 'medium',
    });
    setEditingWork(null);
  };

  const handleAddChunk = (data: any) => {
    if (!selectedWorkId) return;
    const workChunks = chunks.filter(c => c.workId === selectedWorkId);
    const maxOrder = workChunks.reduce((max, c) => Math.max(max, c.order), 0);
    
    const work = works.find(w => w.id === selectedWorkId);
    const dcId = data.dataCenterId || work?.dataCenterId;

    addChunk({
      id: `c${Date.now()}`,
      workId: selectedWorkId,
      title: data.title,
      durationHours: Number(data.durationHours),
      order: maxOrder + 1,
      status: 'pending',
      dataCenterId: dcId,
      priority: data.priority || undefined,
    });
  };

  const handleEditChunk = (data: any) => {
    if (!editingChunk) return;
    updateChunk(editingChunk.id, {
      title: data.title,
      durationHours: Number(data.durationHours),
      dataCenterId: data.dataCenterId || undefined,
      priority: data.priority || undefined,
    });
    setEditingChunk(null);
  };

  const openChunkModal = (workId: string) => {
    setSelectedWorkId(workId);
    setIsChunkModalOpen(true);
  };

  const dcOptions = dataCenters.map(dc => ({ label: dc.name, value: dc.id }));

  const workFields: FieldConfig[] = [
    { name: 'name', label: 'Название работы', type: 'text', required: true, placeholder: 'Например: Обслуживание серверов' },
    { name: 'description', label: 'Описание', type: 'textarea', required: true, placeholder: 'Подробности...' },
    { name: 'dueDate', label: 'Срок выполнения', type: 'date', required: true },
    { name: 'dataCenterId', label: 'Датацентр', type: 'select', required: false, options: dcOptions, placeholder: 'Выберите ДЦ' },
    { name: 'priority', label: 'Приоритет', type: 'select', required: true, options: PRIORITY_OPTIONS, defaultValue: 'medium' },
  ];

  const selectedWork = works.find(w => w.id === selectedWorkId);
  const chunkFields: FieldConfig[] = [
    { name: 'title', label: 'Название этапа', type: 'text', required: true, placeholder: 'Например: Чанк 1.1' },
    { name: 'durationHours', label: 'Длительность (часы)', type: 'number', required: true, placeholder: '4' },
    { 
      name: 'dataCenterId', 
      label: 'Датацентр', 
      type: 'select', 
      required: false, 
      options: dcOptions, 
      placeholder: selectedWork?.dataCenterId 
        ? `По умолчанию: ${dataCenters.find(d => d.id === selectedWork.dataCenterId)?.name || 'ДЦ работы'}`
        : 'Выберите ДЦ'
    },
    { 
      name: 'priority', 
      label: 'Приоритет', 
      type: 'select', 
      required: false, 
      options: PRIORITY_OPTIONS, 
      placeholder: `По умолчанию: ${selectedWork?.priority || 'medium'}`
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <span className="badge-success">Утверждено</span>;
      case 'planned':
        return <span className="badge-warning">Запланировано</span>;
      case 'completed':
        return <span className="badge-secondary">Завершено</span>;
      default:
        return <span className="badge-outline">Ожидает</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Список работ</h2>
          <p className="text-muted-foreground mt-1">Управление задачами и этапами работ</p>
        </div>
        <button onClick={() => setIsWorkModalOpen(true)} className="btn-primary">
          <Plus size={16} className="mr-2" />
          Создать работу
        </button>
      </div>

      <div className="grid gap-4">
        {works.map(work => {
          const workChunks = chunks.filter(c => c.workId === work.id);
          const completedChunks = workChunks.filter(c => c.status === 'completed').length;
          const progress = workChunks.length > 0 ? (completedChunks / workChunks.length) * 100 : 0;
          
          return (
            <div key={work.id} className="card overflow-hidden hover:shadow-soft transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className={clsx("p-3 rounded-xl", PRIORITY_COLORS[work.priority])}>
                      <FileText size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{work.name}</h3>
                        <span className={clsx("text-xs px-2 py-0.5 rounded font-medium", PRIORITY_COLORS[work.priority])}>
                          <Flag size={10} className="inline mr-1" />
                          {PRIORITY_OPTIONS.find(p => p.value === work.priority)?.label}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1">{work.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {work.dataCenterId && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MapPin size={14} />
                        <span className="text-sm">{dataCenters.find(d => d.id === work.dataCenterId)?.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar size={14} />
                      <span className="text-sm">До {work.dueDate}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingWork(work)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                        title="Редактировать"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Удалить работу и все её этапы?')) {
                            deleteWork(work.id);
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Прогресс</span>
                    <span className="font-medium text-foreground">{completedChunks}/{workChunks.length} этапов</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Chunks */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Clock size={14} />
                      Этапы работ
                    </h4>
                    <button 
                        onClick={() => openChunkModal(work.id)}
                        className="text-xs flex items-center gap-1 text-primary hover:underline font-medium"
                    >
                        <Plus size={12} />
                        Добавить этап
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {workChunks.map(chunk => (
                      <div 
                        key={chunk.id} 
                        className={clsx(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all group",
                          chunk.status === 'completed' 
                            ? "bg-success/10 border-success/30 text-success" 
                            : chunk.status === 'assigned'
                            ? "bg-success/5 border-success/30 text-foreground"
                            : chunk.status === 'planned'
                            ? "bg-warning/10 border-warning/30 text-foreground"
                            : "bg-card border-border text-foreground hover:border-primary/50"
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{chunk.title}</span>
                          <span className="text-[11px] text-muted-foreground">Этап {chunk.order} • {chunk.durationHours}ч</span>
                        </div>
                        {getStatusBadge(chunk.status)}
                        {chunk.status === 'pending' && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setSelectedWorkId(work.id);
                                setEditingChunk(chunk);
                              }}
                              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                              title="Редактировать"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Удалить этап?')) {
                                  deleteChunk(chunk.id);
                                }
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                              title="Удалить"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {workChunks.length === 0 && (
                        <div className="text-sm text-muted-foreground italic">Нет этапов</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <GenericAddModal
        isOpen={isWorkModalOpen}
        onClose={() => setIsWorkModalOpen(false)}
        title="Создать новую работу"
        fields={workFields}
        onSubmit={handleAddWork}
      />

      <GenericAddModal
        isOpen={isChunkModalOpen}
        onClose={() => setIsChunkModalOpen(false)}
        title="Добавить этап работы"
        fields={chunkFields}
        onSubmit={handleAddChunk}
        submitLabel="Добавить этап"
      />

      {/* Edit Work Modal */}
      <GenericAddModal
        isOpen={!!editingWork}
        onClose={() => setEditingWork(null)}
        title="Редактировать работу"
        fields={workFields}
        onSubmit={handleEditWork}
        submitLabel="Сохранить"
        initialData={editingWork ? {
          name: editingWork.name,
          description: editingWork.description,
          dueDate: editingWork.dueDate,
          dataCenterId: editingWork.dataCenterId,
          priority: editingWork.priority,
        } : undefined}
      />

      {/* Edit Chunk Modal */}
      <GenericAddModal
        isOpen={!!editingChunk}
        onClose={() => setEditingChunk(null)}
        title="Редактировать этап"
        fields={chunkFields}
        onSubmit={handleEditChunk}
        submitLabel="Сохранить"
        initialData={editingChunk ? {
          title: editingChunk.title,
          durationHours: editingChunk.durationHours,
          dataCenterId: editingChunk.dataCenterId,
          priority: editingChunk.priority,
        } : undefined}
      />
    </div>
  );
};
