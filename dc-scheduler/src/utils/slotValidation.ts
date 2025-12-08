/**
 * Утилиты для валидации слотов при drag-and-drop (система "Светофор").
 * 
 * Вся логика работает на основе constraints, которые приходят с бэкенда.
 * Это позволяет валидировать слоты мгновенно без запросов к API.
 */

import type { 
  SchedulableItem, 
  WorkChunk,
  SlotCompatibility
} from '../types';

// Simplified DataCenter type for validation (doesn't need all fields)
type SimpleDC = { id: string; name: string; regionId?: string };

export interface SlotInfo {
  engineerId: string;
  engineerRegionId: string;
  date: string;           // YYYY-MM-DD
  startTime: number;      // 0-23
  endTime: number;        // 1-24
  availableHours: number; // Свободное время в слоте
}

export interface ValidationResult {
  compatibility: SlotCompatibility;
  reasons: string[];
}

/**
 * Проверить совместимость элемента со слотом.
 * Возвращает цвет светофора и причины.
 */
export function validateSlotCompatibility(
  item: SchedulableItem,
  slot: SlotInfo,
  _dataCenters: SimpleDC[],
  assignedChunks: WorkChunk[],
  travelMatrix: Record<string, Record<string, number>>
): ValidationResult {
  const reasons: string[] = [];
  let compatibility: SlotCompatibility = 'green';
  
  const constraints = item.constraints;
  if (!constraints) {
    // Нет constraints - разрешаем всё (fallback)
    return { compatibility: 'green', reasons: [] };
  }
  
  // 1. Проверка региона
  if (constraints.allowedRegionIds.length > 0) {
    if (!constraints.allowedRegionIds.includes(slot.engineerRegionId)) {
      return {
        compatibility: 'red',
        reasons: ['Слот в другом регионе']
      };
    }
  }
  
  // 2. Проверка даты
  if (constraints.fixedDate) {
    // Фиксированная дата (support)
    if (slot.date !== constraints.fixedDate) {
      return {
        compatibility: 'red',
        reasons: ['Работа привязана к другой дате']
      };
    }
  } else {
    // Окно дат
    if (constraints.minDate && slot.date < constraints.minDate) {
      return {
        compatibility: 'red',
        reasons: ['Дата раньше минимально допустимой (зависимости)']
      };
    }
    if (constraints.maxDate && slot.date > constraints.maxDate) {
      return {
        compatibility: 'red',
        reasons: ['Дата позже дедлайна']
      };
    }
  }
  
  // 3. Проверка времени (для support с фиксированным временем)
  if (constraints.fixedTime !== undefined && constraints.fixedTime !== null) {
    if (slot.startTime > constraints.fixedTime || slot.endTime < constraints.fixedTime + constraints.durationHours) {
      return {
        compatibility: 'red',
        reasons: ['Слот не покрывает требуемое время']
      };
    }
  }
  
  // 4. Проверка длительности
  if (slot.availableHours < constraints.durationHours) {
    return {
      compatibility: 'red',
      reasons: ['Недостаточно времени в слоте']
    };
  }
  
  // 5. Проверка зависимостей (Finish-to-Start)
  if (constraints.dependsOnChunkIds.length > 0) {
    for (const depId of constraints.dependsOnChunkIds) {
      const depChunk = assignedChunks.find(c => c.id === depId);
      if (depChunk) {
        if (!depChunk.assignedDate) {
          reasons.push('Зависимый чанк ещё не назначен');
          compatibility = 'yellow';
        } else if (depChunk.assignedDate >= slot.date) {
          return {
            compatibility: 'red',
            reasons: ['Зависимый чанк назначен на эту же или более позднюю дату']
          };
        }
      }
    }
  }
  
  // 6. Проверка синхронных чанков (Start-to-Start)
  if (constraints.syncChunkIds.length > 0) {
    for (const syncId of constraints.syncChunkIds) {
      const syncChunk = assignedChunks.find(c => c.id === syncId);
      if (syncChunk && syncChunk.assignedDate) {
        if (syncChunk.assignedDate !== slot.date) {
          return {
            compatibility: 'red',
            reasons: ['Синхронный чанк назначен на другую дату']
          };
        }
      }
    }
  }
  
  // 7. Проверка переездов (travel time)
  const itemDcId = constraints.dataCenterId;
  if (itemDcId) {
    // Находим чанки этого инженера в этот день
    const sameDayChunks = assignedChunks.filter(
      c => c.assignedEngineerId === slot.engineerId && 
           c.assignedDate === slot.date &&
           c.dataCenterId
    );
    
    for (const chunk of sameDayChunks) {
      if (chunk.dataCenterId && chunk.dataCenterId !== itemDcId) {
        // Есть работа в другом ДЦ - проверяем время на дорогу
        const travelTime = getTravelTime(chunk.dataCenterId, itemDcId, travelMatrix);
        if (travelTime > 0) {
          reasons.push(`Переезд ${Math.round(travelTime / 60)}ч из другого ДЦ`);
          if (compatibility === 'green') {
            compatibility = 'yellow';
          }
        }
      }
    }
  }
  
  return { compatibility, reasons };
}

/**
 * Получить время переезда между ДЦ в минутах.
 */
export function getTravelTime(
  fromDcId: string,
  toDcId: string,
  travelMatrix: Record<string, Record<string, number>>
): number {
  if (fromDcId === toDcId) return 0;
  
  // Прямое направление
  if (travelMatrix[fromDcId]?.[toDcId] !== undefined) {
    return travelMatrix[fromDcId][toDcId];
  }
  
  // Обратное направление
  if (travelMatrix[toDcId]?.[fromDcId] !== undefined) {
    return travelMatrix[toDcId][fromDcId];
  }
  
  // Не найдено - возвращаем дефолт (60 минут)
  return 60;
}

/**
 * Рассчитать доступное время в слоте с учётом уже назначенных чанков и переездов.
 */
export function calculateAvailableTime(
  slot: { startTime: number; endTime: number },
  assignedChunks: WorkChunk[],
  engineerId: string,
  date: string,
  newItemDcId: string | undefined,
  travelMatrix: Record<string, Record<string, number>>
): number {
  // Находим чанки этого инженера в этот день
  const dayChunks = assignedChunks.filter(
    c => c.assignedEngineerId === engineerId && 
         c.assignedDate === date &&
         c.assignedStartTime !== undefined
  );
  
  // Сортируем по времени начала
  dayChunks.sort((a, b) => (a.assignedStartTime || 0) - (b.assignedStartTime || 0));
  
  // Считаем занятое время
  let usedTime = 0;
  let prevDcId: string | undefined;
  
  for (const chunk of dayChunks) {
    // Добавляем время переезда если ДЦ разные
    if (prevDcId && chunk.dataCenterId && prevDcId !== chunk.dataCenterId) {
      usedTime += getTravelTime(prevDcId, chunk.dataCenterId, travelMatrix) / 60;
    }
    
    usedTime += chunk.durationHours;
    prevDcId = chunk.dataCenterId;
  }
  
  // Добавляем время переезда для нового элемента
  if (prevDcId && newItemDcId && prevDcId !== newItemDcId) {
    usedTime += getTravelTime(prevDcId, newItemDcId, travelMatrix) / 60;
  }
  
  const totalSlotTime = slot.endTime - slot.startTime;
  return Math.max(0, totalSlotTime - usedTime);
}

/**
 * Получить цвет для отображения совместимости.
 */
export function getCompatibilityColor(compatibility: SlotCompatibility): string {
  switch (compatibility) {
    case 'green':
      return 'bg-green-500/20 border-green-500';
    case 'yellow':
      return 'bg-yellow-500/20 border-yellow-500';
    case 'red':
      return 'bg-red-500/20 border-red-500 opacity-50';
    default:
      return '';
  }
}

/**
 * Получить цвет фона для слота при drag-over.
 */
export function getSlotHighlightClass(compatibility: SlotCompatibility): string {
  switch (compatibility) {
    case 'green':
      return 'ring-2 ring-green-500 bg-green-500/10';
    case 'yellow':
      return 'ring-2 ring-yellow-500 bg-yellow-500/10';
    case 'red':
      return 'ring-2 ring-red-500 bg-red-500/10 cursor-not-allowed';
    default:
      return '';
  }
}
