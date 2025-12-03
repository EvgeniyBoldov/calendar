import React from 'react';
import { Modal } from './Modal';

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'textarea';
  options?: { label: string; value: string }[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
}

interface GenericAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FieldConfig[];
  onSubmit: (data: Record<string, any>) => void;
  submitLabel?: string;
  initialData?: Record<string, any>;
}

export const GenericAddModal: React.FC<GenericAddModalProps> = ({
  isOpen,
  onClose,
  title,
  fields,
  onSubmit,
  submitLabel = 'Добавить',
  initialData,
}) => {
  const [formData, setFormData] = React.useState<Record<string, any>>({});

  // Initialize default values when modal opens
  React.useEffect(() => {
    if (isOpen) {
      const data: Record<string, any> = {};
      fields.forEach(field => {
        data[field.name] = initialData?.[field.name] ?? field.defaultValue ?? '';
      });
      setFormData(data);
    }
  }, [isOpen, fields, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  const handleChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1">
            <label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            
            {field.type === 'select' ? (
              <select
                required={field.required}
                value={formData[field.name] || ''}
                onChange={(e) => handleChange(field.name, e.target.value)}
                className="input"
              >
                <option value="" disabled>Выберите...</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                required={field.required}
                value={formData[field.name] || ''}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="input min-h-[80px] py-2"
              />
            ) : (
              <input
                type={field.type}
                required={field.required}
                value={formData[field.name] || ''}
                onChange={(e) => handleChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={field.placeholder}
                className="input"
              />
            )}
          </div>
        ))}
        
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="btn-ghost">
            Отмена
          </button>
          <button type="submit" className="btn-primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};
