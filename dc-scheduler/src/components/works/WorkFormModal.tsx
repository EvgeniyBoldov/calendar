import React from 'react';
import { X, FileText, Calendar, MapPin, Clock, Phone } from 'lucide-react';
import type { Work, WorkType, Priority, DataCenter } from '../../types';
import { useWorkStore } from '../../stores/workStore';
import clsx from 'clsx';

interface WorkFormModalProps {
  work?: Work | null;
  dataCenters: DataCenter[];
  onClose: () => void;
  onSaved?: (work: Work) => void;
}

const WORK_TYPES: { value: WorkType; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'general', label: 'Работа', description: 'Проект с планом', icon: FileText },
  { value: 'support', label: 'Сопровождение', description: 'Выезд в ДЦ', icon: Calendar },
];

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'low', label: 'Низкий', color: 'bg-green-500' },
  { value: 'medium', label: 'Средний', color: 'bg-yellow-500' },
  { value: 'high', label: 'Высокий', color: 'bg-orange-500' },
  { value: 'critical', label: 'Критический', color: 'bg-red-500' },
];

export const WorkFormModal: React.FC<WorkFormModalProps> = ({
  work,
  dataCenters,
  onClose,
  onSaved,
}) => {
  const isEdit = !!work;
  const { addWork, updateWork } = useWorkStore();
  
  const [formData, setFormData] = React.useState({
    name: work?.name || '',
    description: work?.description || '',
    workType: work?.workType || 'general' as WorkType,
    priority: work?.priority || 'medium' as Priority,
    // For general
    dueDate: work?.dueDate || '',
    // For support
    dataCenterId: work?.dataCenterId || '',
    targetDate: work?.targetDate || '',
    targetTime: work?.targetTime?.toString() || '',
    durationHours: work?.durationHours?.toString() || '4',
    contactInfo: work?.contactInfo || '',
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isSupport = formData.workType === 'support';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    
    try {
      const data: any = {
        name: formData.name,
        description: formData.description || undefined,
        workType: formData.workType,
        priority: formData.priority,
        status: work?.status || (isSupport ? 'created' : 'draft'),
      };

      if (isSupport) {
        data.dataCenterId = formData.dataCenterId;
        data.targetDate = formData.targetDate;
        data.targetTime = formData.targetTime ? parseInt(formData.targetTime) : undefined;
        data.durationHours = parseInt(formData.durationHours) || 4;
        data.contactInfo = formData.contactInfo || undefined;
      } else {
        data.dueDate = formData.dueDate || undefined;
      }

      let savedWork: Work | null = null;

      if (isEdit && work) {
        savedWork = await updateWork(work.id, data);
      } else {
        savedWork = await addWork(data);
      }

      if (savedWork && onSaved) {
        onSaved(savedWork);
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving work:', err);
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-bold">
            {isEdit ? 'Редактировать' : 'Создать'} {isSupport ? 'сопровождение' : 'работу'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Work Type */}
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
              Тип
            </label>
            <div className="flex p-1 bg-muted/50 rounded-lg">
              {WORK_TYPES.map(type => {
                const Icon = type.icon;
                const selected = formData.workType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, workType: type.value }))}
                    className={clsx(
                      "flex-1 py-2.5 px-3 rounded-md flex items-center justify-center gap-2 transition-all",
                      selected ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={18} />
                    <span className="text-sm font-medium">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 block">
              Название *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input w-full"
              placeholder={isSupport ? "Сопровождение клиента X" : "Название работы"}
              required
              autoFocus
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 block">
              Приоритет
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, priority: p.value }))}
                  className={clsx(
                    'flex-1 py-2 px-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-1.5 transition-all',
                    formData.priority === p.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/30'
                  )}
                >
                  <span className={clsx('w-2 h-2 rounded-full', p.color)} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 block">
              Описание
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input w-full min-h-[80px] resize-none"
              placeholder="Дополнительная информация..."
            />
          </div>

          {/* Type-specific fields */}
          {isSupport ? (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                Параметры сопровождения
              </div>
              
              {/* Data Center */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                  <MapPin size={12} /> Дата-центр *
                </label>
                <select
                  value={formData.dataCenterId}
                  onChange={e => setFormData(prev => ({ ...prev, dataCenterId: e.target.value }))}
                  className="input w-full"
                  required
                >
                  <option value="">Выберите ДЦ</option>
                  {dataCenters.map(dc => (
                    <option key={dc.id} value={dc.id}>{dc.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Target Date */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                    <Calendar size={12} /> Дата *
                  </label>
                  <input
                    type="date"
                    value={formData.targetDate}
                    onChange={e => setFormData(prev => ({ ...prev, targetDate: e.target.value }))}
                    className="input w-full"
                    required
                  />
                </div>

                {/* Target Time */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                    <Clock size={12} /> Время
                  </label>
                  <select
                    value={formData.targetTime}
                    onChange={e => setFormData(prev => ({ ...prev, targetTime: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="">Не указано</option>
                    {Array.from({ length: 13 }, (_, i) => i + 7).map(h => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 block">
                  Продолжительность: {formData.durationHours}ч
                </label>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={formData.durationHours}
                  onChange={e => setFormData(prev => ({ ...prev, durationHours: e.target.value }))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1ч</span>
                  <span>12ч</span>
                </div>
              </div>

              {/* Contact */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                  <Phone size={12} /> Контакт
                </label>
                <input
                  type="text"
                  value={formData.contactInfo}
                  onChange={e => setFormData(prev => ({ ...prev, contactInfo: e.target.value }))}
                  className="input w-full"
                  placeholder="Телефон или email"
                />
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-border">
              {/* Due Date */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
                  <Calendar size={12} /> Дедлайн
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={e => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="input w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer (fixed inside modal) */}
        <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3 bg-card">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Отмена
          </button>
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={isSaving}
          >
            {isSaving ? 'Сохранение...' : (isEdit ? 'Сохранить' : 'Создать')}
          </button>
        </div>
      </form>
    </div>
  </div>
  );
};
