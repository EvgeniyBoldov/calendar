import React from 'react';
import { X, Upload, Download, Trash2, FileText, Clock, Calendar, MapPin, AlertTriangle, ChevronRight, Plus } from 'lucide-react';
import type { Work, WorkChunk, WorkAttachment, DataCenter } from '../../types';
import { api } from '../../api/client';
import clsx from 'clsx';

interface WorkDetailModalProps {
  work: Work;
  chunks: WorkChunk[];
  dataCenters: DataCenter[];
  onClose: () => void;
  onUpdate: () => void;
  onAddChunk?: (workId: string) => void;
  onDeleteChunk?: (workId: string, chunkId: string) => void;
}

const PRIORITY_CONFIG = {
  critical: { label: 'Критический', color: 'text-red-500 bg-red-500/10' },
  high: { label: 'Высокий', color: 'text-orange-500 bg-orange-500/10' },
  medium: { label: 'Средний', color: 'text-yellow-500 bg-yellow-500/10' },
  low: { label: 'Низкий', color: 'text-green-500 bg-green-500/10' },
};

const STATUS_CONFIG = {
  draft: { label: 'Черновик', color: 'text-muted-foreground bg-muted' },
  created: { label: 'Создано', color: 'text-muted-foreground bg-muted' },
  ready: { label: 'Готово', color: 'text-primary bg-primary/10' },
  scheduling: { label: 'Назначение', color: 'text-yellow-500 bg-yellow-500/10' },
  assigned: { label: 'Назначено', color: 'text-blue-500 bg-blue-500/10' },
  in_progress: { label: 'В работе', color: 'text-blue-500 bg-blue-500/10' },
  completed: { label: 'Выполнено', color: 'text-green-500 bg-green-500/10' },
};

const WORK_TYPE_CONFIG = {
  general: { label: 'Работа', icon: FileText },
  support: { label: 'Сопровождение', icon: Calendar },
};

const CHUNK_STATUS_CONFIG = {
  created: { label: 'Создан', color: 'bg-muted text-muted-foreground' },
  planned: { label: 'Запланирован', color: 'bg-yellow-500/10 text-yellow-500' },
  assigned: { label: 'Назначен', color: 'bg-blue-500/10 text-blue-500' },
  in_progress: { label: 'В работе', color: 'bg-blue-500/10 text-blue-500' },
  completed: { label: 'Выполнен', color: 'bg-green-500/10 text-green-500' },
};

type TabType = 'info' | 'chunks' | 'files';

export const WorkDetailModal: React.FC<WorkDetailModalProps> = ({
  work,
  chunks,
  dataCenters,
  onClose,
  onUpdate,
  onAddChunk,
  onDeleteChunk,
}) => {
  const [activeTab, setActiveTab] = React.useState<TabType>('info');
  const [attachments, setAttachments] = React.useState<WorkAttachment[]>(work.attachments || []);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const workChunks = chunks.filter(c => c.workId === work.id);
  const dc = dataCenters.find(d => d.id === work.dataCenterId);
  const TypeIcon = WORK_TYPE_CONFIG[work.workType]?.icon || FileText;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await api.works.uploadAttachment(work.id, file);
        setAttachments(prev => [...prev, attachment]);
      }
      onUpdate();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await api.works.deleteAttachment(work.id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      onUpdate();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleCancelAllChunks = async () => {
    if (!confirm('Отменить все назначения чанков?')) return;
    
    setIsCancelling(true);
    try {
      await api.works.cancelAllChunks(work.id);
      onUpdate();
    } catch (error) {
      console.error('Cancel failed:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className={clsx('p-2 rounded-lg', PRIORITY_CONFIG[work.priority].color)}>
                <TypeIcon size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground truncate">{work.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', STATUS_CONFIG[work.status].color)}>
                    {STATUS_CONFIG[work.status].label}
                  </span>
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', PRIORITY_CONFIG[work.priority].color)}>
                    {PRIORITY_CONFIG[work.priority].label}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                    {WORK_TYPE_CONFIG[work.workType].label}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {(['info', 'chunks', 'files'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'info' && 'Информация'}
              {tab === 'chunks' && `Этапы (${workChunks.length})`}
              {tab === 'files' && `Файлы (${attachments.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              {work.description && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Описание</h4>
                  <p className="text-foreground">{work.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {dc && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={16} className="text-muted-foreground" />
                    <span className="text-muted-foreground">ДЦ:</span>
                    <span className="text-foreground font-medium">{dc.name}</span>
                  </div>
                )}

                {work.workType === 'general' && work.dueDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={16} className="text-muted-foreground" />
                    <span className="text-muted-foreground">Дедлайн:</span>
                    <span className="text-foreground font-medium">{formatDate(work.dueDate)}</span>
                  </div>
                )}

                {work.workType === 'support' && (
                  <>
                    {work.targetDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-muted-foreground" />
                        <span className="text-muted-foreground">Дата:</span>
                        <span className="text-foreground font-medium">{formatDate(work.targetDate)}</span>
                      </div>
                    )}
                    {work.durationHours && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock size={16} className="text-muted-foreground" />
                        <span className="text-muted-foreground">Продолжительность:</span>
                        <span className="text-foreground font-medium">{work.durationHours}ч</span>
                      </div>
                    )}
                    {work.targetTime !== undefined && work.targetTime !== null && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock size={16} className="text-muted-foreground" />
                        <span className="text-muted-foreground">Время:</span>
                        <span className="text-foreground font-medium">{work.targetTime}:00</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-border">
                {workChunks.some(c => c.status === 'planned' || c.status === 'assigned') && (
                  <button
                    onClick={handleCancelAllChunks}
                    disabled={isCancelling}
                    className="btn-ghost text-destructive hover:bg-destructive/10 flex items-center gap-2"
                  >
                    <AlertTriangle size={16} />
                    {isCancelling ? 'Отмена...' : 'Отменить все назначения'}
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'chunks' && (
            <div className="space-y-3">
              {work.workType === 'general' ? (
                <>
                  {workChunks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Нет этапов. Добавьте первый этап работы.
                    </div>
                  ) : (
                    workChunks.map(chunk => (
                      <div
                        key={chunk.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-6">#{chunk.order}</span>
                          <div>
                            <div className="font-medium text-foreground">{chunk.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Clock size={12} />
                              {chunk.durationHours}ч
                              {chunk.assignedDate && (
                                <>
                                  <ChevronRight size={12} />
                                  {formatDate(chunk.assignedDate)}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', CHUNK_STATUS_CONFIG[chunk.status].color)}>
                            {CHUNK_STATUS_CONFIG[chunk.status].label}
                          </span>
                          {onDeleteChunk && chunk.status === 'created' && (
                            <button
                              onClick={() => onDeleteChunk(work.id, chunk.id)}
                              className="p-1 hover:bg-destructive/10 rounded text-destructive"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {onAddChunk && (
                    <button
                      onClick={() => onAddChunk(work.id)}
                      className="w-full py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={16} />
                      Добавить этап
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Сопровождение не имеет этапов. Назначается на конкретную дату.
                </div>
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              {/* Upload area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isUploading
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary hover:bg-primary/5'
                )}
              >
                <Upload size={32} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isUploading ? 'Загрузка...' : 'Нажмите или перетащите файлы сюда'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* File list */}
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map(attachment => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={20} className="text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{attachment.filename}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.size)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={api.works.downloadAttachment(work.id, attachment.id)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          title="Скачать"
                        >
                          <Download size={16} className="text-muted-foreground" />
                        </a>
                        <button
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={16} className="text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Нет прикреплённых файлов
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
