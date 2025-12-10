import { useState, useEffect, useRef } from 'react';
import { X, Upload, Download, Trash2, FileText, FileSpreadsheet, Image, File, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import type { Work, WorkAttachment, AttachmentType } from '../../types';
import clsx from 'clsx';

interface AttachmentsModalProps {
  work: Work;
  onClose: () => void;
  onUpdated?: () => void;
}

const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  work_plan: 'План работ',
  report: 'Отчёт',
  calculation: 'Расчёт',
  scheme: 'Схема',
  photo: 'Фото',
  other: 'Прочее',
};

const ATTACHMENT_TYPE_ICONS: Record<AttachmentType, React.ComponentType<{ size?: number; className?: string }>> = {
  work_plan: FileSpreadsheet,
  report: FileText,
  calculation: FileText,
  scheme: Image,
  photo: Image,
  other: File,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsModal({ work, onClose, onUpdated }: AttachmentsModalProps) {
  const [attachments, setAttachments] = useState<WorkAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AttachmentType>('other');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.works.getAttachments(work.id);
      setAttachments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [work.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      await api.works.uploadAttachment(work.id, file, selectedType);
      await fetchAttachments();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (attachment: WorkAttachment) => {
    if (!confirm(`Удалить файл "${attachment.filename}"?`)) return;

    try {
      await api.works.deleteAttachment(work.id, attachment.id);
      await fetchAttachments();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const handleDownload = (attachment: WorkAttachment) => {
    const url = api.works.downloadAttachment(work.id, attachment.id);
    window.open(url, '_blank');
  };

  // Проверяем есть ли уже файл плана работ
  const hasWorkPlan = attachments.some(a => a.attachmentType === 'work_plan');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Файлы</h2>
            <p className="text-sm text-muted-foreground">{work.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg h-10 w-10 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload section */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-4">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as AttachmentType)}
              className="input w-48"
            >
              {(Object.keys(ATTACHMENT_TYPE_LABELS) as AttachmentType[]).map(type => (
                <option key={type} value={type}>
                  {ATTACHMENT_TYPE_LABELS[type]}
                  {type === 'work_plan' && hasWorkPlan ? ' (заменить)' : ''}
                </option>
              ))}
            </select>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className={clsx(
                "btn btn-primary cursor-pointer",
                isUploading && "opacity-50 pointer-events-none"
              )}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Загрузить файл
            </label>
          </div>
          {selectedType === 'work_plan' && (
            <p className="text-xs text-muted-foreground mt-2">
              Для плана работ разрешён только один файл. При загрузке нового старый будет заменён.
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto underline">Закрыть</button>
          </div>
        )}

        {/* Files list */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Нет загруженных файлов</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map(attachment => {
                const Icon = ATTACHMENT_TYPE_ICONS[attachment.attachmentType] || File;
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{attachment.filename}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-muted">
                          {ATTACHMENT_TYPE_LABELS[attachment.attachmentType]}
                        </span>
                        <span>{formatFileSize(attachment.size)}</span>
                        <span>{new Date(attachment.createdAt).toLocaleDateString('ru-RU')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownload(attachment)}
                        className="btn-ghost rounded-lg h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-primary"
                        title="Скачать"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(attachment)}
                        className="btn-ghost rounded-lg h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-red-500"
                        title="Удалить"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
