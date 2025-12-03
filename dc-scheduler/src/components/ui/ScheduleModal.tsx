import React from 'react';
import { Modal } from './Modal';
import { Clock, Calendar, Plus, Trash2 } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import type { TimeSlot } from '../../types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineerName: string;
  engineerId: string;
  // For single slot mode
  selectedDate?: string;
  existingSlots?: TimeSlot[];
  onAddSlot: (engineerId: string, date: string, slot: TimeSlot) => void;
  onRemoveSlot: (engineerId: string, date: string, slotIndex: number) => void;
  // For pattern mode
  onApplyPattern: (
    engineerId: string,
    startDate: Date,
    weeks: number,
    pattern: { dayOfWeek: number; slots: TimeSlot[] }[]
  ) => void;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  engineerName,
  engineerId,
  selectedDate,
  existingSlots = [],
  onAddSlot,
  onRemoveSlot,
  onApplyPattern,
}) => {
  const [mode, setMode] = React.useState<'single' | 'pattern'>(selectedDate ? 'single' : 'pattern');
  
  // Single slot state
  const [startHour, setStartHour] = React.useState(9);
  const [endHour, setEndHour] = React.useState(18);
  
  // Pattern state
  const [selectedDays, setSelectedDays] = React.useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [patternStartHour, setPatternStartHour] = React.useState(9);
  const [patternEndHour, setPatternEndHour] = React.useState(18);
  const [weeksCount, setWeeksCount] = React.useState(4);
  const [patternStartDate, setPatternStartDate] = React.useState(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  );

  React.useEffect(() => {
    if (selectedDate) {
      setMode('single');
    }
  }, [selectedDate]);

  const handleAddSingleSlot = () => {
    if (!selectedDate) return;
    if (startHour >= endHour) {
      alert('Время начала должно быть меньше времени окончания');
      return;
    }
    onAddSlot(engineerId, selectedDate, { start: startHour, end: endHour });
  };

  const handleApplyPattern = () => {
    const pattern = selectedDays.map(day => ({
      dayOfWeek: day,
      slots: [{ start: patternStartHour, end: patternEndHour }]
    }));
    onApplyPattern(engineerId, new Date(patternStartDate), weeksCount, pattern);
    onClose();
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Рабочее время: ${engineerName}`}>
      <div className="space-y-4">
        {/* Mode Tabs */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setMode('single')}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
              mode === 'single' 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock size={16} />
            Один день
          </button>
          <button
            onClick={() => setMode('pattern')}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
              mode === 'pattern' 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar size={16} />
            По графику
          </button>
        </div>

        {mode === 'single' && selectedDate && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Дата: <span className="font-medium text-foreground">{format(new Date(selectedDate), 'd MMMM yyyy', { locale: ru })}</span>
            </div>

            {/* Existing slots */}
            {existingSlots.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Текущие слоты:</div>
                {existingSlots.map((slot, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-success/10 rounded-lg border border-success/20">
                    <span className="text-sm text-success font-medium">
                      {slot.start}:00 — {slot.end}:00
                    </span>
                    <button
                      onClick={() => onRemoveSlot(engineerId, selectedDate, idx)}
                      className="text-destructive hover:bg-destructive/10 p-1 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new slot */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Добавить слот:</div>
              <div className="flex items-center gap-2">
                <select 
                  value={startHour} 
                  onChange={e => setStartHour(Number(e.target.value))}
                  className="input flex-1"
                >
                  {hours.map(h => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </select>
                <span className="text-muted-foreground">—</span>
                <select 
                  value={endHour} 
                  onChange={e => setEndHour(Number(e.target.value))}
                  className="input flex-1"
                >
                  {hours.map(h => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </select>
                <button onClick={handleAddSingleSlot} className="btn-primary btn-icon">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'pattern' && (
          <div className="space-y-4">
            {/* Days selection */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Дни недели:</div>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    className={clsx(
                      "w-10 h-10 rounded-lg text-sm font-medium transition-all",
                      selectedDays.includes(day.value)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time range */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Рабочие часы:</div>
              <div className="flex items-center gap-2">
                <select 
                  value={patternStartHour} 
                  onChange={e => setPatternStartHour(Number(e.target.value))}
                  className="input flex-1"
                >
                  {hours.map(h => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </select>
                <span className="text-muted-foreground">—</span>
                <select 
                  value={patternEndHour} 
                  onChange={e => setPatternEndHour(Number(e.target.value))}
                  className="input flex-1"
                >
                  {hours.map(h => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Start date */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Начало периода:</div>
              <input
                type="date"
                value={patternStartDate}
                onChange={e => setPatternStartDate(e.target.value)}
                className="input"
              />
            </div>

            {/* Weeks count */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Количество недель:</div>
              <div className="flex gap-2">
                {[1, 2, 4, 8, 12].map(w => (
                  <button
                    key={w}
                    onClick={() => setWeeksCount(w)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      weeksCount === w
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Итого:</span> {selectedDays.length} дней в неделю × {weeksCount} недель = {selectedDays.length * weeksCount} рабочих дней
            </div>

            <button onClick={handleApplyPattern} className="btn-primary w-full">
              Применить график
            </button>
          </div>
        )}

        {mode === 'single' && !selectedDate && (
          <div className="text-center py-8 text-muted-foreground">
            Кликните на ячейку в таблице, чтобы добавить слот на конкретный день
          </div>
        )}
      </div>
    </Modal>
  );
};
