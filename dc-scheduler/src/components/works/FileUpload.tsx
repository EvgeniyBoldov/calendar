import React from 'react';
import { Upload, Paperclip, Download, Trash2, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { WorkAttachment } from '../../types';
import clsx from 'clsx';

interface FileUploadProps {
  workId: string;
  attachments: WorkAttachment[];
  onUploadComplete: () => void;
  onDeleteComplete: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  workId,
  attachments,
  onUploadComplete,
  onDeleteComplete,
}) => {
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Загрузка ${file.name}...`);
      
      try {
        await api.works.uploadAttachment(workId, file);
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки');
      }
    }

    setIsUploading(false);
    setUploadProgress(null);
    onUploadComplete();
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm('Удалить файл?')) return;
    
    try {
      await api.works.deleteAttachment(workId, attachmentId);
      onDeleteComplete();
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления');
    }
  };

  const handleDownload = (attachment: WorkAttachment) => {
    const url = api.works.downloadAttachment(workId, attachment.id);
    window.open(url, '_blank');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div 
        className={clsx(
          "relative border-2 border-dashed rounded-lg p-4 text-center transition-colors",
          isUploading 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50 bg-muted/30"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onChange={handleFileSelect}
          disabled={isUploading}
        />
        <div className="flex flex-col items-center gap-2 text-muted-foreground pointer-events-none">
          {isUploading ? (
            <>
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-sm text-primary">{uploadProgress}</span>
            </>
          ) : (
            <>
              <Upload size={24} />
              <span className="text-sm">Нажмите или перетащите файлы</span>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map(att => (
            <div 
              key={att.id} 
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg group"
            >
              <Paperclip size={14} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{att.filename}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(att.size)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDownload(att)}
                  className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded"
                  title="Скачать"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => handleDelete(att.id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                  title="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
