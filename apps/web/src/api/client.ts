import {
  User,
  Model,
  Channel,
  Conversation,
  Message,
  AuditLog,
  MediaUpload,
  SystemStats,
  AnalyticsData,
} from '../types/index.js';

// Base Request Helper
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `请求失败 (${res.status})`);
  }

  return data as T;
}

// 1. Auth APIs
export const authApi = {
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data: { username: string; password: string; email?: string }) =>
    request<{ token?: string; message: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<{ user: User }>('/api/auth/me'),
  logout: () => Promise.resolve({ success: true }),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request<{ success: boolean; message: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
};

// 2. Chat & Conversation APIs
export const chatApi = {
  getPublicModels: () => request<{ models: Model[] }>('/api/models'),
  getConversations: () => request<{ conversations: Conversation[] }>('/api/conversations'),
  createConversation: (data?: { title?: string; modelIds?: string[] }) =>
    request<{ conversation: Conversation }>('/api/conversations', { method: 'POST', body: JSON.stringify(data || {}) }),
  getConversation: (id: string) => request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`),
  getMessages: (id: string) => request<{ messages: Message[] }>(`/api/conversations/${id}/messages`),
  updateConversation: (id: string, data: { title?: string; is_pinned?: number | boolean; isPinned?: boolean }) =>
    request<{ success: boolean }>(`/api/conversations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteConversation: (id: string) => request<{ success: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{
      id: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      extractedText: string;
      url: string;
      isImage: boolean;
    }>('/api/upload', {
      method: 'POST',
      body: formData,
    });
  },

  createShare: (conversationId: string) =>
    request<{ shareCode: string; expiresAt: string }>('/api/share', { method: 'POST', body: JSON.stringify({ conversationId }) }),
  getShare: (shareCode: string) =>
    request<{ title: string; createdAt: string; messages: Message[] }>(`/api/share/${shareCode}`),
};

// 3. Admin APIs
export const adminApi = {
  getStats: () => request<SystemStats>('/api/admin/stats'),
  getAnalytics: (timeRange = '7d') => request<AnalyticsData>(`/api/admin/logs/stats?timeRange=${timeRange}`),
  
  getChannels: () => request<{ channels: Channel[] }>('/api/admin/channels'),
  createChannel: (data: any) => request<{ channel: Channel }>('/api/admin/channels', { method: 'POST', body: JSON.stringify(data) }),
  updateChannel: (id: string, data: any) => request<{ channel: Channel }>(`/api/admin/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChannel: (id: string) => request<{ success: boolean }>(`/api/admin/channels/${id}`, { method: 'DELETE' }),
  testChannel: (id: string) => request<{ success: boolean; latencyMs: number; message: string }>(`/api/admin/channels/${id}/test`, { method: 'POST' }),
  syncChannelModels: (id: string) => request<{ models: string[]; total: number }>(`/api/admin/channels/${id}/sync-models`, { method: 'POST' }),
  batchImportModels: (channelId: string, modelIds: string[]) =>
    request<{ success: boolean; importedCount: number }>(`/api/admin/channels/${channelId}/batch-import`, { method: 'POST', body: JSON.stringify({ modelIds }) }),
  
  getModels: () => request<{ models: Model[] }>('/api/admin/models'),
  createModel: (data: any) => request<{ model: Model }>('/api/admin/models', { method: 'POST', body: JSON.stringify(data) }),
  updateModel: (id: string, data: any) => request<{ model: Model }>(`/api/admin/models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteModel: (id: string) => request<{ success: boolean }>(`/api/admin/models/${id}`, { method: 'DELETE' }),
  clearAllModels: () => request<{ success: boolean; count: number; message: string }>('/api/admin/models/clear-all', { method: 'DELETE' }),
  reorderModels: (orders: Array<{ id: string; order_index: number }>) =>
    request<{ success: boolean }>('/api/admin/models/reorder', { method: 'PUT', body: JSON.stringify({ orders }) }),

  getUsers: () => request<{ users: User[] }>('/api/admin/users'),
  updateUser: (id: string, data: any) => request<{ success: boolean }>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  resetUserPassword: (id: string, newPassword: string) => request<{ success: boolean; message: string }>(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  deleteUser: (id: string) => request<{ success: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  getUserConversations: (userId: string) => request<{ conversations: Conversation[] }>(`/api/admin/users/${userId}/conversations`),
  getUserConversationMessages: (convId: string) => request<{ messages: Message[] }>(`/api/admin/conversations/${convId}/messages`),

  getSettings: () => request<{ settings: Record<string, string> }>('/api/admin/settings'),
  updateSettings: (data: Record<string, string>) => request<{ success: boolean }>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getPublicSettings: () => request<{ settings: Record<string, string> }>('/api/settings/public'),

  getLogs: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        qs.append(k, String(v));
      }
    });
    return request<{
      items: AuditLog[];
      total: number;
      limit: number;
      offset: number;
      filters: { models: string[]; users: string[]; channels: Array<{ id: string; name: string }> };
    }>(`/api/admin/logs?${qs.toString()}`);
  },
  clearLogs: (days = 30) => request<{ success: boolean; message: string }>('/api/admin/logs/clear', { method: 'POST', body: JSON.stringify({ days }) }),

  getMediaLogs: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        qs.append(k, String(v));
      }
    });
    return request<{
      items: MediaUpload[];
      total: number;
      total_size_bytes: number;
      limit: number;
      offset: number;
    }>(`/api/admin/logs/media?${qs.toString()}`);
  },
  deleteMedia: (id: string) => request<{ success: boolean; message: string }>(`/api/admin/logs/media/${id}`, { method: 'DELETE' }),
};
