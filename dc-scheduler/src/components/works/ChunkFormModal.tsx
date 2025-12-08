import React from 'react';
import { X, Link2, ArrowRight } from 'lucide-react';
import type { WorkChunk, DataCenter } from '../../types';
import clsx from 'clsx';

interface ChunkFormModalProps {
  chunk?: WorkChunk | null;
  workId: string;
  existingChunks: WorkChunk[];
  dataCenters: DataCenter[];
  workDataCenterId?: string;
  onSave: (data: Partial<WorkChunk>) => void;
  onClose: () => void;
}

export const ChunkFormModal: React.FC<ChunkFormModalProps> = ({
  chunk,
  workId,
  existingChunks,
  dataCenters,
  workDataCenterId,
  onSave,
  onClose,
}) => {
  const isEdit = !!chunk;
  
  const [formData, setFormData] = React.useState({
    title: chunk?.title || '',
    description: chunk?.description || '',
    dataCenterId: chunk?.dataCenterId || '',
  });

  // Available chunks for linking (exclude self)
  const availableForLinking = existingChunks.filter(c => {
    if (chunk && c.id === chunk.id) return false;
    return true;
  });
  
  // Current links
  const [syncLinks, setSyncLinks] = React.useState<string[]>(
    chunk?.links?.filter(l => l.linkType === 'sync').map(l => l.linkedChunkId) || []
  );
  const [dependencyLinks, setDependencyLinks] = React.useState<string[]>(
    chunk?.links?.filter(l => l.linkType === 'dependency').map(l => l.linkedChunkId) || []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const maxOrder = existingChunks.reduce((max, c) => Math.max(max, c.order), 0);
    
    // TODO: Handle links separately via API
    onSave({
      workId,
      title: formData.title,
      description: formData.description || undefined,
      dataCenterId: formData.dataCenterId || undefined,
      order: chunk?.order ?? maxOrder + 1,
    });
  };

  const toggleSyncLink = (id: string) => {
    setSyncLinks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  
  const toggleDependencyLink = (id: string) => {
    setDependencyLinks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">
            {isEdit ? 'Редактировать этап' : 'Новый этап'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Название</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="input w-full"
              placeholder="Например: Монтаж оборудования"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Описание</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input w-full min-h-[80px] resize-none"
              placeholder="Подробности этапа (опционально)"
            />
          </div>

          {/* Data Center */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Дата-центр</label>
            <select
              value={formData.dataCenterId}
              onChange={e => setFormData(prev => ({ ...prev, dataCenterId: e.target.value }))}
              className="input w-full"
            >
              <option value="">
                {workDataCenterId 
                  ? `По умолчанию: ${dataCenters.find(d => d.id === workDataCenterId)?.name}`
                  : 'Выберите ДЦ'
                }
              </option>
              {dataCenters.map(dc => (
                <option key={dc.id} value={dc.id}>{dc.name}</option>
              ))}
            </select>
          </div>

          {/* Dependencies */}
          {availableForLinking.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <ArrowRight size={14} className="inline mr-1" />
                Зависимости (выполнить после)
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableForLinking.map(c => (
                  <label
                    key={c.id}
                    className={clsx(
                      'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                      dependencyLinks.includes(c.id)
                        ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={dependencyLinks.includes(c.id)}
                      onChange={() => toggleDependencyLink(c.id)}
                      className="rounded"
                    />
                    <span className="text-sm">#{c.order} {c.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Sync Links */}
          {availableForLinking.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Link2 size={14} className="inline mr-1" />
                Синхронные этапы
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableForLinking.map(c => (
                  <label
                    key={c.id}
                    className={clsx(
                      'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                      syncLinks.includes(c.id)
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={syncLinks.includes(c.id)}
                      onChange={() => toggleSyncLink(c.id)}
                      className="rounded"
                    />
                    <span className="text-sm">#{c.order} {c.title}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Синхронные этапы выполняются одновременно
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button type="button" onClick={onClose} className="btn-ghost">
            Отмена
          </button>
          <button type="submit" onClick={handleSubmit} className="btn-primary">
            {isEdit ? 'Сохранить' : 'Создать этап'}
          </button>
        </div>
      </div>
    </div>
  );
};
