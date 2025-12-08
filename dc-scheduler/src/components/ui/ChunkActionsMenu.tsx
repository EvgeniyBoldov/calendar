import React from 'react';
import { MoreVertical, Wand2, X, Check, CheckCircle } from 'lucide-react';
import type { WorkChunk } from '../../types';
import clsx from 'clsx';

interface ChunkActionsMenuProps {
  chunk: WorkChunk;
  workId: string;
  onAutoAssign?: () => void;
  onUnassign?: () => void;
  onMarkCompleted?: () => void;
  onConfirm?: () => void;
  className?: string;
}

export const ChunkActionsMenu: React.FC<ChunkActionsMenuProps> = ({
  chunk,
  onAutoAssign,
  onUnassign,
  onMarkCompleted,
  onConfirm,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const canAutoAssign = chunk.status === 'created';
  const canUnassign = chunk.status === 'planned' || chunk.status === 'assigned';
  const canConfirm = chunk.status === 'planned';
  const canComplete = chunk.status === 'assigned';

  const hasActions = canAutoAssign || canUnassign || canConfirm || canComplete;

  if (!hasActions) return null;

  return (
    <div ref={menuRef} className={clsx("relative", className)}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Действия"
      >
        <MoreVertical size={14} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-popover border border-border rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
          {canAutoAssign && onAutoAssign && (
            <button
              onClick={() => handleAction(onAutoAssign)}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
            >
              <Wand2 size={14} className="text-primary" />
              <span>Автоназначение</span>
            </button>
          )}

          {canConfirm && onConfirm && (
            <button
              onClick={() => handleAction(onConfirm)}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
            >
              <Check size={14} className="text-success" />
              <span>Подтвердить назначение</span>
            </button>
          )}

          {canComplete && onMarkCompleted && (
            <button
              onClick={() => handleAction(onMarkCompleted)}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
            >
              <CheckCircle size={14} className="text-success" />
              <span>Отметить выполненным</span>
            </button>
          )}

          {canUnassign && onUnassign && (
            <>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => {
                  if (chunk.status === 'assigned') {
                    if (confirm('Вы уверены, что хотите отменить назначение? Это действие нельзя отменить.')) {
                      handleAction(onUnassign);
                    } else {
                      setIsOpen(false);
                    }
                  } else {
                    handleAction(onUnassign);
                  }
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-destructive/10 text-destructive transition-colors"
              >
                <X size={14} />
                <span>Отменить назначение</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
