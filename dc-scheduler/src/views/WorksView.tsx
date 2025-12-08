import React from 'react';
import { useWorkStore } from '../stores/workStore';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { Plus, Search, Edit2, Trash2, Calendar, ChevronDown, ChevronUp, FileText, ListTodo } from 'lucide-react';
import { WorkFormModal } from '../components/works/WorkFormModal';
import { WorkPlanModal } from '../components/works/WorkPlanModal';
import type { Work, Priority, WorkTask } from '../types';
import clsx from 'clsx';

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-slate-500/20 text-slate-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-amber-500/20 text-amber-400',
  critical: 'bg-red-500/20 text-red-400',
};

const WORK_TYPE_LABELS: Record<string, string> = {
  general: 'Работа',
  support: 'Сопровождение',
};

type TabType = 'active' | 'completed';

// Progress bar component
const ProgressBar: React.FC<{ tasks: WorkTask[] }> = ({ tasks }) => {
  const total = tasks.filter(t => t.status !== 'cancelled').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const partial = tasks.filter(t => t.status === 'partial').length;
  
  if (total === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  
  const donePercent = (done / total) * 100;
  const partialPercent = (partial / total) * 100;
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full flex">
          <div 
            className="bg-green-500 h-full" 
            style={{ width: `${donePercent}%` }}
          />
          <div 
            className="bg-amber-500 h-full" 
            style={{ width: `${partialPercent}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {done}/{total}
      </span>
    </div>
  );
};

export const WorksView: React.FC = () => {
  const { works, deleteWork, updateWork } = useWorkStore();
  const { dataCenters } = useDataCenterStore();
  
  // UI State
  const [activeTab, setActiveTab] = React.useState<TabType>('active');
  const [search, setSearch] = React.useState('');
  const [sortField, setSortField] = React.useState<'name' | 'priority' | 'dueDate'>('dueDate');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  
  // Modal State
  const [showWorkForm, setShowWorkForm] = React.useState(false);
  const [editingWork, setEditingWork] = React.useState<Work | null>(null);
  const [planningWork, setPlanningWork] = React.useState<Work | null>(null);

  // Filter and sort works
  const filteredWorks = React.useMemo(() => {
    let result = works;
    
    // Tab filter
    if (activeTab === 'active') {
      result = result.filter(w => !['completed', 'documented'].includes(w.status));
    } else {
      result = result.filter(w => ['completed', 'documented'].includes(w.status));
    }
    
    // Search filter
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(w => 
        w.name.toLowerCase().includes(s) || 
        w.description?.toLowerCase().includes(s)
      );
    }
    
    // Sort
    const priorityOrder: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortField === 'priority') {
        const pA = priorityOrder[a.priority] ?? 99;
        const pB = priorityOrder[b.priority] ?? 99;
        cmp = pA - pB;
      } else if (sortField === 'dueDate') {
        const dateA = a.dueDate || a.targetDate || '9999-12-31';
        const dateB = b.dueDate || b.targetDate || '9999-12-31';
        cmp = dateA.localeCompare(dateB);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    
    return result;
  }, [works, activeTab, search, sortField, sortDir]);

  // Counts
  const activeCount = works.filter(w => !['completed', 'documented'].includes(w.status)).length;
  const completedCount = works.filter(w => ['completed', 'documented'].includes(w.status)).length;

  // Handlers
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleWorkSaved = (work: Work) => {
    // Если это новая работа типа general, сразу открыть редактор плана
    if (!editingWork && work.workType === 'general') {
      setPlanningWork(work);
    }
    setEditingWork(null);
    setShowWorkForm(false);
  };

  const handlePlanUpdated = () => {
    // Refresh works list
    setPlanningWork(null);
  };

  const handleDelete = async (workId: string) => {
    if (confirm('Удалить работу?')) {
      await deleteWork(workId);
    }
  };

  const SortIcon: React.FC<{ field: typeof sortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Работы</h2>
          <p className="text-muted-foreground text-sm">Управление задачами и планирование</p>
        </div>
        <button onClick={() => setShowWorkForm(true)} className="btn-primary">
          <Plus size={16} className="mr-2" />
          Создать работу
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex items-center justify-between mb-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab('active')}
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              activeTab === 'active'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Активные
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              activeTab === 'completed'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Завершённые
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-muted-foreground/20">
              {completedCount}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto card">
        <table className="w-full">
          <thead className="sticky top-0 bg-card border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th 
                className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Название
                  <SortIcon field="name" />
                </div>
              </th>
              <th className="px-4 py-3 font-medium">Инициатор</th>
              <th className="px-4 py-3 font-medium">Тип</th>
              <th 
                className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('priority')}
              >
                <div className="flex items-center gap-1">
                  Приоритет
                  <SortIcon field="priority" />
                </div>
              </th>
              <th className="px-4 py-3 font-medium">Прогресс</th>
              <th 
                className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                onClick={() => handleSort('dueDate')}
              >
                <div className="flex items-center gap-1">
                  Дедлайн
                  <SortIcon field="dueDate" />
                </div>
              </th>
              <th className="px-4 py-3 font-medium text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredWorks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <FileText size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Нет работ для отображения</p>
                  <button
                    onClick={() => setShowWorkForm(true)}
                    className="mt-4 text-primary hover:underline text-sm"
                  >
                    Создать первую работу
                  </button>
                </td>
              </tr>
            ) : (
              filteredWorks.map(work => (
                <tr 
                  key={work.id} 
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-foreground">{work.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {work.authorId || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm">{WORK_TYPE_LABELS[work.workType] || work.workType}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "px-2 py-1 rounded text-xs font-medium",
                      PRIORITY_COLORS[work.priority]
                    )}>
                      {PRIORITY_LABELS[work.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar tasks={work.tasks || []} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatDate(work.dueDate || work.targetDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingWork(work)}
                        className="p-2 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Редактировать"
                      >
                        <Edit2 size={16} />
                      </button>
                      {work.workType === 'general' && (
                        <button
                          onClick={() => setPlanningWork(work)}
                          className="p-2 rounded hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                          title="Редактировать план"
                        >
                          <ListTodo size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(work.id)}
                        className="p-2 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        title="Удалить"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          // TODO: Navigate to calendar with this work selected
                          window.location.href = '/calendar';
                        }}
                        className="p-2 rounded hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                        title="Запланировать"
                      >
                        <Calendar size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Work Form Modal */}
      {(showWorkForm || editingWork) && (
        <WorkFormModal
          work={editingWork}
          dataCenters={dataCenters}
          onSaved={handleWorkSaved}
          onClose={() => {
            setShowWorkForm(false);
            setEditingWork(null);
          }}
        />
      )}

      {/* Work Plan Modal */}
      {planningWork && (
        <WorkPlanModal
          work={planningWork}
          dataCenters={dataCenters}
          onUpdated={handlePlanUpdated}
          onClose={() => setPlanningWork(null)}
        />
      )}
    </div>
  );
};
