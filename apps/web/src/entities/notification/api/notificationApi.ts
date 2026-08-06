import { apiFetch } from '@/shared/api/client';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  requestId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ListNotificationsResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export const notificationApi = {
  list: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.page && params.page > 1) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.unreadOnly) search.set('unreadOnly', 'true');
    const query = search.toString();
    return apiFetch<ListNotificationsResponse>(
      `/notifications${query ? `?${query}` : ''}`,
    );
  },

  markRead: (id: string) =>
    apiFetch<void>(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllRead: () => apiFetch<void>('/notifications/read-all', { method: 'PATCH' }),
};
