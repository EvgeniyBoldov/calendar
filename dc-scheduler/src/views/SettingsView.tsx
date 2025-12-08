import React from 'react';
import { useDataCenterStore } from '../stores/dataCenterStore';
import { useDistanceStore } from '../stores/distanceStore';
import { api } from '../api/client';
import { MapPin, Clock, Save, Plus, Trash2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface DistanceEntry {
  fromDcId: string;
  toDcId: string;
  durationMinutes: number;
}

export const SettingsView: React.FC = () => {
  const { dataCenters } = useDataCenterStore();
  const { matrix, fetchMatrix } = useDistanceStore();
  
  const [entries, setEntries] = React.useState<DistanceEntry[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing entries from matrix
  React.useEffect(() => {
    const loadedEntries: DistanceEntry[] = [];
    Object.entries(matrix).forEach(([fromDcId, destinations]) => {
      Object.entries(destinations).forEach(([toDcId, minutes]) => {
        loadedEntries.push({ fromDcId, toDcId, durationMinutes: minutes });
      });
    });
    setEntries(loadedEntries);
  }, [matrix]);

  const addEntry = () => {
    if (dataCenters.length < 2) return;
    setEntries([...entries, { 
      fromDcId: dataCenters[0]?.id || '', 
      toDcId: dataCenters[1]?.id || dataCenters[0]?.id || '', 
      durationMinutes: 60 
    }]);
  };

  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof DistanceEntry, value: string | number) => {
    setEntries(entries.map((e, i) => 
      i === index ? { ...e, [field]: value } : e
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      // Filter out invalid entries
      const validEntries = entries.filter(e => 
        e.fromDcId && e.toDcId && e.fromDcId !== e.toDcId && e.durationMinutes > 0
      );
      
      if (validEntries.length === 0) {
        setMessage({ type: 'error', text: 'Нет валидных записей для сохранения' });
        setIsSaving(false);
        return;
      }
      
      await api.distances.bulkCreate(validEntries);
      await fetchMatrix();
      setMessage({ type: 'success', text: 'Матрица расстояний сохранена!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Ошибка сохранения' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Настройки</h2>
          <p className="text-muted-foreground mt-1">Матрица расстояний между дата-центрами</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchMatrix()} 
            className="btn-ghost"
            title="Обновить"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            onClick={handleSave} 
            className="btn-primary"
            disabled={isSaving}
          >
            <Save size={16} className="mr-2" />
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={clsx(
          'p-4 rounded-lg',
          message.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        )}>
          {message.text}
        </div>
      )}

      {/* Distance Matrix */}
      <div className="card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-primary" />
            <h3 className="font-semibold text-foreground">Время перемещения между ДЦ</h3>
          </div>
          <button onClick={addEntry} className="btn-secondary text-sm">
            <Plus size={14} className="mr-1" />
            Добавить
          </button>
        </div>

        <div className="p-4">
          {dataCenters.length < 2 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin size={32} className="mx-auto mb-2 opacity-50" />
              <p>Нужно минимум 2 дата-центра для настройки расстояний</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>Нет записей о расстояниях</p>
              <button onClick={addEntry} className="mt-2 text-primary hover:underline text-sm">
                Добавить первую запись
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-4 gap-4 text-sm font-medium text-muted-foreground px-2">
                <div>Откуда</div>
                <div>Куда</div>
                <div>Время (мин)</div>
                <div></div>
              </div>
              
              {/* Entries */}
              {entries.map((entry, index) => (
                <div 
                  key={index} 
                  className="grid grid-cols-4 gap-4 items-center p-2 bg-muted/30 rounded-lg"
                >
                  <select
                    value={entry.fromDcId}
                    onChange={(e) => updateEntry(index, 'fromDcId', e.target.value)}
                    className="input text-sm"
                  >
                    {dataCenters.map(dc => (
                      <option key={dc.id} value={dc.id}>{dc.name}</option>
                    ))}
                  </select>
                  
                  <select
                    value={entry.toDcId}
                    onChange={(e) => updateEntry(index, 'toDcId', e.target.value)}
                    className="input text-sm"
                  >
                    {dataCenters.map(dc => (
                      <option key={dc.id} value={dc.id}>{dc.name}</option>
                    ))}
                  </select>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={entry.durationMinutes}
                      onChange={(e) => updateEntry(index, 'durationMinutes', parseInt(e.target.value) || 0)}
                      className="input text-sm w-20"
                    />
                    <span className="text-xs text-muted-foreground">
                      ({Math.floor(entry.durationMinutes / 60)}ч {entry.durationMinutes % 60}м)
                    </span>
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      onClick={() => removeEntry(index)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Matrix View */}
      {dataCenters.length >= 2 && Object.keys(matrix).length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Матрица (визуализация)</h3>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left text-muted-foreground">От \ До</th>
                  {dataCenters.map(dc => (
                    <th key={dc.id} className="p-2 text-center text-muted-foreground">{dc.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataCenters.map(fromDc => (
                  <tr key={fromDc.id}>
                    <td className="p-2 font-medium">{fromDc.name}</td>
                    {dataCenters.map(toDc => {
                      const minutes = fromDc.id === toDc.id 
                        ? 0 
                        : (matrix[fromDc.id]?.[toDc.id] || matrix[toDc.id]?.[fromDc.id] || null);
                      return (
                        <td key={toDc.id} className="p-2 text-center">
                          {fromDc.id === toDc.id ? (
                            <span className="text-muted-foreground">—</span>
                          ) : minutes !== null ? (
                            <span className="text-foreground">{minutes}м</span>
                          ) : (
                            <span className="text-muted-foreground/50">?</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
