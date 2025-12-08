const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const toCamelCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamelCase(v));
  } else if (obj !== null && typeof obj === 'object' && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const newKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      result[newKey] = toCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
};

export const toSnakeCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => toSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object' && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const newKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      result[newKey] = toSnakeCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
};

interface RequestOptions extends RequestInit {
  params?: Record<string, string | string[] | number | boolean | undefined>;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_URL}/api${endpoint}`;
  
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) return;
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, v));
      } else {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return toCamelCase(await response.json());
}

export const api = {
  // Regions
  regions: {
    list: () => request<any[]>('/regions'),
    get: (id: string) => request<any>(`/regions/${id}`),
    create: (data: any) => request<any>('/regions', { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    update: (id: string, data: any) => request<any>(`/regions/${id}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    delete: (id: string) => request<any>(`/regions/${id}`, { method: 'DELETE' }),
  },
  
  // Data Centers
  dataCenters: {
    list: (regionId?: string) => request<any[]>('/datacenters', { params: { region_id: regionId } }),
    get: (id: string) => request<any>(`/datacenters/${id}`),
    create: (data: any) => request<any>('/datacenters', { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    update: (id: string, data: any) => request<any>(`/datacenters/${id}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    delete: (id: string) => request<any>(`/datacenters/${id}`, { method: 'DELETE' }),
  },
  
  // Engineers
  engineers: {
    list: (regionId?: string) => request<any[]>('/engineers', { params: { region_id: regionId } }),
    get: (id: string) => request<any>(`/engineers/${id}`),
    create: (data: any) => request<any>('/engineers', { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    update: (id: string, data: any) => request<any>(`/engineers/${id}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    delete: (id: string) => request<any>(`/engineers/${id}`, { method: 'DELETE' }),
    addSlot: (engineerId: string, data: any) => request<any>(`/engineers/${engineerId}/slots`, { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    removeSlot: (engineerId: string, slotId: string) => request<any>(`/engineers/${engineerId}/slots/${slotId}`, { method: 'DELETE' }),
  },
  
  // Works
  works: {
    list: (params?: {
      page?: number;
      page_size?: number;
      status?: string[];
      priority?: string[];
      data_center_id?: string;
      author_id?: string;
      search?: string;
      active_only?: boolean;
      completed_only?: boolean;
    }) => request<any>('/works', { params }),
    get: (id: string) => request<any>(`/works/${id}`),
    create: (data: any) => request<any>('/works', { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    update: (id: string, data: any) => request<any>(`/works/${id}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    delete: (id: string) => request<any>(`/works/${id}`, { method: 'DELETE' }),
    
    // Chunks
    createChunk: (workId: string, data: any) => request<any>(`/works/${workId}/chunks`, { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    updateChunk: (workId: string, chunkId: string, data: any) => request<any>(`/works/${workId}/chunks/${chunkId}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    deleteChunk: (workId: string, chunkId: string) => request<any>(`/works/${workId}/chunks/${chunkId}`, { method: 'DELETE' }),
    confirmPlanned: () => request<any>('/works/chunks/confirm-planned', { method: 'POST' }),
    
    // Auto-assignment
    suggestSlot: (workId: string, chunkId: string) => request<any>(`/works/${workId}/chunks/${chunkId}/suggest-slot`),
    autoAssignChunk: (workId: string, chunkId: string) => request<any>(`/works/${workId}/chunks/${chunkId}/auto-assign`, { method: 'POST' }),
    unassignChunk: (workId: string, chunkId: string) => request<any>(`/works/${workId}/chunks/${chunkId}/unassign`, { method: 'POST' }),
    autoAssignWork: (workId: string) => request<any>(`/works/${workId}/auto-assign`, { method: 'POST' }),
    cancelAllChunks: (workId: string) => request<any>(`/works/${workId}/cancel-all-chunks`, { method: 'POST' }),
    
    // Attachments
    getAttachments: (workId: string) => request<any>(`/works/${workId}/attachments`),
    uploadAttachment: async (workId: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/works/${workId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }
      return toCamelCase(await response.json());
    },
    downloadAttachment: (workId: string, attachmentId: string) => {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      return `${API_URL}/api/works/${workId}/attachments/${attachmentId}/download`;
    },
    deleteAttachment: (workId: string, attachmentId: string) => request<any>(`/works/${workId}/attachments/${attachmentId}`, { method: 'DELETE' }),
    
    // Tasks (план работ)
    getTasks: (workId: string) => request<any[]>(`/works/${workId}/tasks`),
    createTask: (workId: string, data: any) => request<any>(`/works/${workId}/tasks`, { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    updateTask: (workId: string, taskId: string, data: any) => request<any>(`/works/${workId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    deleteTask: (workId: string, taskId: string) => request<any>(`/works/${workId}/tasks/${taskId}`, { method: 'DELETE' }),
    createTasksBulk: (workId: string, tasks: any[]) => request<any[]>(`/works/${workId}/tasks/bulk`, { method: 'POST', body: JSON.stringify(toSnakeCase(tasks)) }),
    assignTaskToChunk: (workId: string, taskId: string, chunkId: string) => 
      request<any>(`/works/${workId}/tasks/${taskId}/assign-to-chunk`, { method: 'POST', params: { chunk_id: chunkId } }),
  },
  
  // Sync
  sync: {
    status: () => request<any>('/sync/status'),
  },
  
  // Planning sessions
  planning: {
    getStrategies: () => request<any>('/planning/strategies'),
    createSession: (strategy: string) => request<any>('/planning/sessions', { 
      method: 'POST', 
      body: JSON.stringify({ strategy }) 
    }),
    getSession: (id: string) => request<any>(`/planning/sessions/${id}`),
    listSessions: (status?: string) => request<any>(`/planning/sessions${status ? `?status=${status}` : ''}`),
    applySession: (id: string) => request<any>(`/planning/sessions/${id}/apply`, { method: 'POST' }),
    cancelSession: (id: string) => request<any>(`/planning/sessions/${id}/cancel`, { method: 'POST' }),
    deleteSession: (id: string) => request<any>(`/planning/sessions/${id}`, { method: 'DELETE' }),
  },
  
  // Distance Matrix
  distances: {
    list: () => request<any[]>('/distances'),
    getMatrix: () => request<Record<string, Record<string, number>>>('/distances/matrix'),
    getTravelTime: (fromDcId: string, toDcId: string) => 
      request<{ fromDcId: string; toDcId: string; durationMinutes: number; found: boolean }>(
        '/distances/travel-time', 
        { params: { from_dc_id: fromDcId, to_dc_id: toDcId } }
      ),
    create: (data: { fromDcId: string; toDcId: string; durationMinutes: number }) => 
      request<any>('/distances', { method: 'POST', body: JSON.stringify(toSnakeCase(data)) }),
    bulkCreate: (entries: { fromDcId: string; toDcId: string; durationMinutes: number }[]) =>
      request<any[]>('/distances/bulk', { method: 'POST', body: JSON.stringify(toSnakeCase({ entries })) }),
    update: (id: string, data: { durationMinutes: number }) =>
      request<any>(`/distances/${id}`, { method: 'PATCH', body: JSON.stringify(toSnakeCase(data)) }),
    delete: (id: string) => request<any>(`/distances/${id}`, { method: 'DELETE' }),
  },
};

export const getSyncStreamUrl = () => `${API_URL}/api/sync/stream`;
