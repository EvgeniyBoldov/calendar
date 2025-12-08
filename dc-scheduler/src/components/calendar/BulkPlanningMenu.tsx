import React from 'react';
import { Wand2, ChevronDown, Users, Zap, Target, Sparkles, X, Check, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface PlanningStrategy {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
}

const STRATEGIES: PlanningStrategy[] = [
  {
    id: 'balanced',
    name: 'Оптимальное',
    description: 'Равномерное распределение по всем инженерам',
    icon: Users,
  },
  {
    id: 'dense',
    name: 'Экономное',
    description: 'Плотная загрузка минимального числа инженеров',
    icon: Target,
  },
  {
    id: 'sla',
    name: 'Приоритетное',
    description: 'Сначала критические задачи и ближайшие дедлайны',
    icon: Zap,
  },
];

interface PlanningSession {
  id: string;
  strategy: string;
  status: string;
  assignments: Array<{
    chunk_id: string;
    engineer_id: string;
    date: string;
    start_time: number;
    duration_hours: number;
    dc_id?: string;
  }>;
  stats: {
    total_chunks: number;
    assigned: number;
    failed: number;
    by_engineer?: Record<string, { chunks: number; hours: number }>;
  };
}

interface BulkPlanningMenuProps {
  onCreateSession: (strategy: string) => Promise<PlanningSession>;
  onApplySession: (sessionId: string) => Promise<void>;
  onCancelSession: (sessionId: string) => Promise<void>;
  activeSession: PlanningSession | null;
  isLoading?: boolean;
}

export const BulkPlanningMenu: React.FC<BulkPlanningMenuProps> = ({
  onCreateSession,
  onApplySession,
  onCancelSession,
  activeSession,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectStrategy = async (strategyId: string) => {
    setIsCreating(true);
    try {
      await onCreateSession(strategyId);
      setIsOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleApply = async () => {
    if (!activeSession) return;
    await onApplySession(activeSession.id);
  };

  const handleCancel = async () => {
    if (!activeSession) return;
    await onCancelSession(activeSession.id);
  };

  // Если есть активная сессия - показываем её статус
  if (activeSession && activeSession.status === 'draft') {
    const strategy = STRATEGIES.find(s => s.id === activeSession.strategy);
    
    return (
      <div className="flex items-center gap-2">
        {/* Session info */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg">
          <Wand2 size={14} className="text-primary" />
          <span className="text-sm font-medium text-primary">
            {strategy?.name}: {activeSession.stats.assigned}/{activeSession.stats.total_chunks} задач
          </span>
          {activeSession.stats.failed > 0 && (
            <span className="text-xs text-destructive">
              ({activeSession.stats.failed} не распределено)
            </span>
          )}
        </div>

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={isLoading}
          className="btn-primary flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Check size={16} />
          )}
          Утвердить
        </button>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          disabled={isLoading}
          className="btn-ghost flex items-center gap-2 text-destructive hover:bg-destructive/10"
        >
          <X size={16} />
          Отменить
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || isCreating}
        className="btn-secondary flex items-center gap-2"
      >
        {isCreating ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Wand2 size={16} />
        )}
        Автораспределение
        <ChevronDown size={14} className={clsx("transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-popover border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="p-3 border-b border-border bg-muted/50">
            <h4 className="font-semibold text-sm text-foreground">Выберите стратегию</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Распределение всех неназначенных задач
            </p>
          </div>
          
          <div className="p-2">
            {STRATEGIES.map((strategy) => {
              const Icon = strategy.icon;
              return (
                <button
                  key={strategy.id}
                  onClick={() => handleSelectStrategy(strategy.id)}
                  disabled={isCreating}
                  className="w-full p-3 text-left rounded-lg hover:bg-muted transition-colors flex items-start gap-3 group"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">
                      {strategy.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {strategy.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
