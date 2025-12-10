import React from 'react';
import { 
  X, Plus, Trash2, Check, Circle, AlertCircle, XCircle, 
  Layers, ChevronDown, ChevronRight, Link as LinkIcon, 
  Unlink, Wand2, Clock, MapPin, GripVertical, Save, FileSpreadsheet, Loader2
} from 'lucide-react';
import type { Work, WorkTask, WorkChunk, DataCenter, TaskStatus, ChunkLinkType } from '../../types';
import { api } from '../../api/client';
import clsx from 'clsx';

interface WorkPlanModalProps {
  work: Work;
  dataCenters: DataCenter[];
  onClose: () => void;
  onUpdated?: () => void;
}

interface TaskFormData {
  id: string;
  title: string;
  description: string;
  dataCenterId: string;
  estimatedHours: number;
  quantity: number;
  status: TaskStatus;
  chunkId?: string;
  isNew?: boolean;
  isSelected?: boolean;
  isDeleted?: boolean;
}

interface ChunkFormData {
  id: string;
  title: string;
  dataCenterId?: string;
  isNew?: boolean;
  isExpanded?: boolean;
  isDeleted?: boolean;
}

interface ChunkLinkFormData {
  id: string;
  chunkId: string;
  linkedChunkId: string;
  linkType: ChunkLinkType;
  isNew?: boolean;
}

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

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  done: 'Выполнено',
  partial: 'Частично',
  cancelled: 'Отменено',
};

const MAX_CHUNK_HOURS = 8;

export const WorkPlanModal: React.FC<WorkPlanModalProps> = ({
  work,
  dataCenters,
  onClose,
  onUpdated,
}) => {
  // === Tasks ===
  const [tasks, setTasks] = React.useState<TaskFormData[]>(() => {
    if (work.tasks) {
      return work.tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        dataCenterId: t.dataCenterId || '',
        estimatedHours: t.estimatedHours,
        quantity: t.quantity || 1,
        status: t.status,
        chunkId: t.chunkId,
      }));
    }
    return [];
  });

  // === Chunks ===
  const [chunks, setChunks] = React.useState<ChunkFormData[]>(() => {
    if (work.chunks) {
      return work.chunks.map(c => ({
        id: c.id,
        title: c.title,
        dataCenterId: c.dataCenterId,
        isExpanded: true,
      }));
    }
    return [];
  });

  // === Chunk Links ===
  const [chunkLinks, setChunkLinks] = React.useState<ChunkLinkFormData[]>(() => {
    if (work.chunks) {
      const links: ChunkLinkFormData[] = [];
      work.chunks.forEach(c => {
        c.links?.forEach(l => {
          links.push({
            id: l.id,
            chunkId: l.chunkId,
            linkedChunkId: l.linkedChunkId,
            linkType: l.linkType,
          });
        });
      });
      return links;
    }
    return [];
  });

  const [newTaskTitle, setNewTaskTitle] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [linkingChunkId, setLinkingChunkId] = React.useState<string | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [isReady, setIsReady] = React.useState(work.status !== 'draft');

  // === Computed ===
  const activeTasks = tasks.filter(t => !t.isDeleted);
  const activeChunks = chunks.filter(c => !c.isDeleted);
  const selectedTasksCount = activeTasks.filter(t => t.isSelected && !t.chunkId).length;
  const hasSelection = selectedTasksCount > 0;
  const unassignedTasks = activeTasks.filter(t => !t.chunkId);
  const allTasksAssigned = activeTasks.length > 0 && unassignedTasks.length === 0;
  const totalTaskHours = activeTasks.reduce((sum, t) => sum + t.estimatedHours * t.quantity, 0);

  // === Helpers ===
  const generateId = () => `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const getChunkTasks = (chunkId: string) => activeTasks.filter(t => t.chunkId === chunkId);
  
  const getChunkDuration = (chunkId: string) => {
    return getChunkTasks(chunkId).reduce((sum, t) => sum + t.estimatedHours * t.quantity, 0);
  };

  const getChunkDC = (chunkId: string) => {
    const chunkTasks = getChunkTasks(chunkId);
    if (chunkTasks.length === 0) return null;
    const dcId = chunkTasks[0].dataCenterId;
    return chunkTasks.every(t => t.dataCenterId === dcId) ? dcId : null;
  };

  const getChunkLinks = (chunkId: string) => chunkLinks.filter(l => l.chunkId === chunkId);

  const markChanged = () => setHasChanges(true);

  // === Task Actions ===
  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    setTasks(prev => [...prev, {
      id: generateId(),
      title: newTaskTitle.trim(),
      description: '',
      dataCenterId: '',
      estimatedHours: 1,
      quantity: 1,
      status: 'todo',
      isNew: true,
    }]);
    setNewTaskTitle('');
    markChanged();
  };

  const removeTask = (taskId: string) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId 
        ? (t.isNew ? { ...t, isDeleted: true } : { ...t, isDeleted: true })
        : t
    ));
    markChanged();
  };

  const updateTask = (taskId: string, updates: Partial<TaskFormData>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    markChanged();
  };

  const toggleTaskSelection = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isSelected: !t.isSelected } : t));
  };

  const toggleAllUnassigned = () => {
    const allSelected = unassignedTasks.every(t => t.isSelected);
    setTasks(prev => prev.map(t => !t.chunkId && !t.isDeleted ? { ...t, isSelected: !allSelected } : t));
  };

  // === Chunk Actions ===
  const createChunkFromSelection = () => {
    const selectedTasks = activeTasks.filter(t => t.isSelected && !t.chunkId);
    if (selectedTasks.length === 0) return;

    const dcId = selectedTasks[0].dataCenterId;
    const sameDC = selectedTasks.every(t => t.dataCenterId === dcId);

    if (!sameDC) {
      alert('Нельзя объединять задачи из разных дата-центров в один этап!');
      return;
    }

    const newChunkId = generateId();
    
    setChunks(prev => [...prev, {
      id: newChunkId,
      title: `Этап ${activeChunks.length + 1}`,
      dataCenterId: dcId || undefined,
      isNew: true,
      isExpanded: true,
    }]);

    setTasks(prev => prev.map(t => 
      t.isSelected && !t.chunkId 
        ? { ...t, chunkId: newChunkId, isSelected: false } 
        : t
    ));
    markChanged();
  };

  const updateChunk = (chunkId: string, updates: Partial<ChunkFormData>) => {
    setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, ...updates } : c));
    if (!('isExpanded' in updates)) markChanged();
  };

  const deleteChunk = (chunkId: string) => {
    setTasks(prev => prev.map(t => t.chunkId === chunkId ? { ...t, chunkId: undefined } : t));
    setChunks(prev => prev.map(c => 
      c.id === chunkId 
        ? (c.isNew ? { ...c, isDeleted: true } : { ...c, isDeleted: true })
        : c
    ));
    setChunkLinks(prev => prev.filter(l => l.chunkId !== chunkId && l.linkedChunkId !== chunkId));
    markChanged();
  };

  const removeTaskFromChunk = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, chunkId: undefined } : t));
    markChanged();
  };

  // === Import from Excel ===
  const handleImportFromExcel = async () => {
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await api.works.importPlan(work.id);
      if (result.imported > 0) {
        // Перезагружаем работу чтобы получить новые задачи
        const updatedWork = await api.works.get(work.id);
        if (updatedWork.tasks) {
          setTasks(updatedWork.tasks.map((t: WorkTask) => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            dataCenterId: t.dataCenterId || '',
            estimatedHours: t.estimatedHours,
            quantity: t.quantity || 1,
            status: t.status,
            chunkId: t.chunkId,
          })));
        }
        alert(`Импортировано ${result.imported} задач${result.skipped > 0 ? `, пропущено ${result.skipped} дубликатов` : ''}`);
      } else {
        setImportError(result.message || 'Нет задач для импорта');
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Ошибка импорта');
    } finally {
      setIsImporting(false);
    }
  };

  // === Auto-create chunks ===
  const autoCreateChunks = () => {
    if (unassignedTasks.length === 0) return;

    const tasksByDC: Record<string, TaskFormData[]> = {};
    unassignedTasks.forEach(t => {
      const dc = t.dataCenterId || 'no_dc';
      if (!tasksByDC[dc]) tasksByDC[dc] = [];
      tasksByDC[dc].push(t);
    });

    const newChunks: ChunkFormData[] = [];
    const taskUpdates: Record<string, string> = {};

    Object.entries(tasksByDC).forEach(([dcId, dcTasks]) => {
      let currentChunk: { id: string; hours: number } | null = null;

      dcTasks.forEach(task => {
        const taskHours = task.estimatedHours * task.quantity;
        
        if (!currentChunk || currentChunk.hours + taskHours > MAX_CHUNK_HOURS) {
          const newChunkId = generateId();
          currentChunk = { id: newChunkId, hours: 0 };
          newChunks.push({
            id: newChunkId,
            title: `Этап ${activeChunks.length + newChunks.length + 1}`,
            dataCenterId: dcId === 'no_dc' ? undefined : dcId,
            isNew: true,
            isExpanded: true,
          });
        }

        currentChunk.hours += taskHours;
        taskUpdates[task.id] = currentChunk.id;
      });
    });

    setChunks(prev => [...prev, ...newChunks]);
    setTasks(prev => prev.map(t => taskUpdates[t.id] ? { ...t, chunkId: taskUpdates[t.id] } : t));
    markChanged();
  };

  // === Chunk Linking ===
  const startLinking = (chunkId: string) => setLinkingChunkId(chunkId);
  const cancelLinking = () => setLinkingChunkId(null);

  const createLink = (linkedChunkId: string, linkType: ChunkLinkType) => {
    if (!linkingChunkId || linkingChunkId === linkedChunkId) return;
    
    const exists = chunkLinks.some(l => 
      (l.chunkId === linkingChunkId && l.linkedChunkId === linkedChunkId) ||
      (l.chunkId === linkedChunkId && l.linkedChunkId === linkingChunkId && l.linkType === 'sync')
    );
    if (exists) {
      setLinkingChunkId(null);
      return;
    }

    setChunkLinks(prev => [...prev, {
      id: generateId(),
      chunkId: linkingChunkId,
      linkedChunkId,
      linkType,
      isNew: true,
    }]);
    setLinkingChunkId(null);
    markChanged();
  };

  const removeLink = (linkId: string) => {
    setChunkLinks(prev => prev.filter(l => l.id !== linkId));
    markChanged();
  };

  // === Save ===
  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const chunkIdMap: Record<string, string> = {};

      // Delete removed chunks (existing ones)
      for (const chunk of chunks.filter(c => c.isDeleted && !c.isNew)) {
        await api.works.deleteChunk(work.id, chunk.id);
      }

      // Create/update chunks
      let chunkOrder = 0;
      for (const chunk of activeChunks) {
        if (chunk.isNew) {
          const created = await api.works.createChunk(work.id, {
            title: chunk.title,
            order: chunkOrder++,
            dataCenterId: chunk.dataCenterId,
          });
          chunkIdMap[chunk.id] = created.id;
        } else {
          await api.works.updateChunk(work.id, chunk.id, {
            title: chunk.title,
            order: chunkOrder++,
            dataCenterId: chunk.dataCenterId,
          });
          chunkIdMap[chunk.id] = chunk.id;
        }
      }

      // Delete removed tasks (existing ones)
      for (const task of tasks.filter(t => t.isDeleted && !t.isNew)) {
        await api.works.deleteTask(work.id, task.id);
      }

      // Create/update tasks
      let taskOrder = 0;
      for (const task of activeTasks) {
        const realChunkId = task.chunkId ? (chunkIdMap[task.chunkId] || task.chunkId) : undefined;
        const finalChunkId = realChunkId?.startsWith('new_') ? undefined : realChunkId;

        if (task.isNew) {
          await api.works.createTask(work.id, {
            title: task.title,
            description: task.description || undefined,
            chunkId: finalChunkId,
            dataCenterId: task.dataCenterId || undefined,
            estimatedHours: task.estimatedHours,
            quantity: task.quantity,
            order: taskOrder++,
            status: task.status,
          });
        } else {
          await api.works.updateTask(work.id, task.id, {
            title: task.title,
            description: task.description || undefined,
            chunkId: finalChunkId,
            dataCenterId: task.dataCenterId || undefined,
            estimatedHours: task.estimatedHours,
            quantity: task.quantity,
            order: taskOrder++,
            status: task.status,
          });
        }
      }

      // TODO: Save chunk links when API is ready

      // Update work status if needed
      if (isReady && work.status === 'draft') {
        await api.works.update(work.id, { status: 'ready' });
      } else if (!isReady && work.status !== 'draft') {
        await api.works.update(work.id, { status: 'draft' });
      }

      if (onUpdated) onUpdated();
      onClose();
    } catch (error) {
      console.error('Error saving plan:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // === Render Task Row ===
  const renderTaskRow = (task: TaskFormData, inChunk = false) => {
    const StatusIcon = TASK_STATUS_ICONS[task.status];
    return (
      <div key={task.id} className={clsx(
        "flex items-center gap-2 p-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 group transition-colors",
        task.isSelected && "bg-primary/5"
      )}>
        {!inChunk && (
          <input
            type="checkbox"
            checked={!!task.isSelected}
            onChange={() => toggleTaskSelection(task.id)}
            className="rounded border-border w-4 h-4 cursor-pointer accent-primary"
          />
        )}

        <button
          type="button"
          onClick={() => {
            const next: Record<TaskStatus, TaskStatus> = {
              todo: 'done', done: 'partial', partial: 'cancelled', cancelled: 'todo',
            };
            updateTask(task.id, { status: next[task.status] });
          }}
          className={clsx(TASK_STATUS_COLORS[task.status], "shrink-0 p-0.5 rounded hover:bg-muted/50")}
          title={TASK_STATUS_LABELS[task.status]}
        >
          <StatusIcon size={16} />
        </button>

        <input
          type="text"
          value={task.title}
          onChange={e => updateTask(task.id, { title: e.target.value })}
          className={clsx(
            "flex-1 min-w-0 bg-transparent border-none p-0 text-sm focus:outline-none focus:ring-0",
            task.status === 'cancelled' && 'line-through text-muted-foreground'
          )}
          placeholder="Название задачи"
        />

        <select
          value={task.dataCenterId}
          onChange={e => updateTask(task.id, { dataCenterId: e.target.value })}
          className="w-28 text-xs bg-muted/50 border border-border/50 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary/50"
        >
          <option value="">ДЦ</option>
          {dataCenters.map(dc => (
            <option key={dc.id} value={dc.id}>{dc.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>×</span>
          <input
            type="number"
            min="1"
            value={task.quantity}
            onChange={e => updateTask(task.id, { quantity: parseInt(e.target.value) || 1 })}
            className="w-10 text-xs bg-muted/50 border border-border/50 rounded px-1 py-1 text-center focus:ring-1 focus:ring-primary/50"
            title="Количество"
          />
        </div>

        <div className="flex items-center gap-1">
          <input
            type="number"
            min="1"
            max="24"
            value={task.estimatedHours}
            onChange={e => updateTask(task.id, { estimatedHours: parseInt(e.target.value) || 1 })}
            className="w-12 text-xs bg-muted/50 border border-border/50 rounded px-1 py-1 text-center focus:ring-1 focus:ring-primary/50"
          />
          <span className="text-xs text-muted-foreground">ч</span>
        </div>

        {inChunk ? (
          <button
            type="button"
            onClick={() => removeTaskFromChunk(task.id)}
            className="p-1.5 text-muted-foreground hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Убрать из этапа"
          >
            <Unlink size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => removeTask(task.id)}
            className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            title="Удалить задачу"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  };

  // === Render Chunk ===
  const renderChunk = (chunk: ChunkFormData) => {
    const chunkTasks = getChunkTasks(chunk.id);
    const duration = getChunkDuration(chunk.id);
    const dcId = getChunkDC(chunk.id);
    const dcName = dcId ? dataCenters.find(d => d.id === dcId)?.name : null;
    const links = getChunkLinks(chunk.id);
    const isLinkTarget = linkingChunkId && linkingChunkId !== chunk.id;
    const isOverLimit = duration > MAX_CHUNK_HOURS;

    return (
      <div key={chunk.id} className={clsx(
        "border rounded-xl overflow-hidden bg-card transition-all",
        isLinkTarget ? "ring-2 ring-primary/50 border-primary/30" : "border-border",
        isOverLimit && "border-amber-500/50"
      )}>
        {/* Chunk Header */}
        <div className="flex items-center gap-2 p-3 bg-muted/30 border-b border-border group/chunk">
          <button
            type="button"
            onClick={() => updateChunk(chunk.id, { isExpanded: !chunk.isExpanded })}
            className="p-0.5 hover:bg-background rounded transition-colors"
          >
            {chunk.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          <Layers size={16} className="text-primary shrink-0" />
          
          <input
            type="text"
            value={chunk.title}
            onChange={e => updateChunk(chunk.id, { title: e.target.value })}
            className="flex-1 bg-transparent border-none p-0 text-sm font-semibold focus:ring-0"
          />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {dcName && (
              <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded">
                <MapPin size={12} /> {dcName}
              </span>
            )}
            <span className={clsx(
              "flex items-center gap-1 px-2 py-0.5 rounded",
              isOverLimit ? "bg-amber-500/20 text-amber-400" : "bg-muted/50"
            )}>
              <Clock size={12} /> {duration}ч
            </span>
            {links.length > 0 && (
              <span className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded">
                <LinkIcon size={12} /> {links.length}
              </span>
            )}
          </div>

          {isLinkTarget ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => createLink(chunk.id, 'sync')}
                className="px-2.5 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
              >
                Синхронно
              </button>
              <button
                type="button"
                onClick={() => createLink(chunk.id, 'dependency')}
                className="px-2.5 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
              >
                После
              </button>
            </div>
          ) : (
            <div className="flex gap-1 opacity-0 group-hover/chunk:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => startLinking(chunk.id)}
                className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-muted/50 transition-colors"
                title="Связать с другим этапом"
              >
                <LinkIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => deleteChunk(chunk.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted/50 transition-colors"
                title="Удалить этап"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Chunk Links */}
        {links.length > 0 && chunk.isExpanded && (
          <div className="px-3 py-2 bg-muted/10 border-b border-border/50 flex flex-wrap gap-1.5">
            {links.map(link => {
              const linkedChunk = activeChunks.find(c => c.id === link.linkedChunkId);
              if (!linkedChunk) return null;
              return (
                <span 
                  key={link.id}
                  className={clsx(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                    link.linkType === 'sync' ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"
                  )}
                >
                  {link.linkType === 'sync' ? '⇄' : '→'} {linkedChunk.title}
                  <button
                    type="button"
                    onClick={() => removeLink(link.id)}
                    className="hover:text-destructive transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Chunk Tasks */}
        {chunk.isExpanded && (
          <div>
            {chunkTasks.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Перетащите задачи сюда или выберите и нажмите "В этап"
              </div>
            ) : (
              chunkTasks.map(task => renderTaskRow(task, true))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold">План работ</h2>
            <p className="text-sm text-muted-foreground">{work.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-muted/10">
          {linkingChunkId && (
            <button
              type="button"
              onClick={cancelLinking}
              className="btn-ghost h-8 text-xs"
            >
              Отмена связи
            </button>
          )}

          {hasSelection && !linkingChunkId && (
            <button 
              type="button"
              onClick={createChunkFromSelection}
              className="btn-secondary h-8 text-xs flex items-center gap-1.5"
            >
              <Layers size={14} />
              В этап ({selectedTasksCount})
            </button>
          )}

          {unassignedTasks.length > 0 && !linkingChunkId && (
            <button 
              type="button"
              onClick={autoCreateChunks}
              className="btn-secondary h-8 text-xs flex items-center gap-1.5"
              title="Автоматически разбить на этапы по ДЦ и не более 8ч"
            >
              <Wand2 size={14} />
              Авто-разбивка
            </button>
          )}

          {!linkingChunkId && (
            <button 
              type="button"
              onClick={handleImportFromExcel}
              disabled={isImporting}
              className="btn-secondary h-8 text-xs flex items-center gap-1.5"
              title="Импортировать задачи из Excel файла (тип 'План работ')"
            >
              {isImporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              Импорт из Excel
            </button>
          )}

          <div className="flex-1" />

          <div className="flex gap-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTask())}
              placeholder="Новая задача..."
              className="input h-8 text-sm w-56"
            />
            <button
              type="button"
              onClick={addTask}
              disabled={!newTaskTitle.trim()}
              className="btn-primary h-8 px-3 flex items-center gap-1.5"
            >
              <Plus size={16} />
              Добавить
            </button>
          </div>
        </div>

        {/* Import Error */}
        {importError && (
          <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={16} />
            {importError}
            <button onClick={() => setImportError(null)} className="ml-auto underline">Закрыть</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Unassigned Tasks */}
          {unassignedTasks.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="flex items-center gap-2 p-3 bg-muted/30 border-b border-border text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={unassignedTasks.length > 0 && unassignedTasks.every(t => t.isSelected)}
                  onChange={toggleAllUnassigned}
                  className="rounded border-border w-4 h-4 accent-primary"
                />
                <span className="flex-1">Нераспределённые задачи</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {unassignedTasks.length} задач • {unassignedTasks.reduce((s, t) => s + t.estimatedHours * t.quantity, 0)}ч
                </span>
              </div>
              <div>
                {unassignedTasks.map(task => renderTaskRow(task, false))}
              </div>
            </div>
          )}

          {/* Chunks */}
          {activeChunks.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Этапы ({activeChunks.length})
              </div>
              {activeChunks.map(chunk => renderChunk(chunk))}
            </div>
          )}

          {/* Empty State */}
          {activeTasks.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
              <Layers size={48} className="opacity-20 mb-4" />
              <p className="text-lg font-medium">План работ пуст</p>
              <p className="text-sm mt-1">Добавьте задачи через поле выше</p>
            </div>
          )}

          {/* Ready indicator */}
          {allTasksAssigned && activeTasks.length > 0 && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
              <Check size={24} className="inline-block text-green-500 mr-2" />
              <span className="text-green-400 font-medium">
                Все задачи распределены по этапам. Работа готова к назначению.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/10">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Задач: <strong className="text-foreground">{activeTasks.length}</strong></span>
            <span>Этапов: <strong className="text-foreground">{activeChunks.length}</strong></span>
            <span>Всего: <strong className="text-foreground">{totalTaskHours}ч</strong></span>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={isReady}
                onChange={e => {
                  setIsReady(e.target.checked);
                  setHasChanges(true);
                }}
                className="rounded border-border w-4 h-4 accent-primary"
              />
              <span>План готов к выполнению</span>
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-ghost">
                {hasChanges ? 'Отмена' : 'Закрыть'}
              </button>
              <button 
                onClick={handleSave}
                className="btn-primary flex items-center gap-2"
                disabled={isSaving || !hasChanges}
              >
                <Save size={16} />
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
