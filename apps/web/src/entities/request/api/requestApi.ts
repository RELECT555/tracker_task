import type { RequestPriority, RequestStatus } from '@tracker/shared';
import { apiFetch } from '@/shared/api/client';

export interface RequestListItem {
  id: string;
  title: string;
  status: RequestStatus;
  priority: RequestPriority;
  type: { id: string; name: string };
  author: { id: string; fullName: string };
  createdAt: string;
  submittedAt: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export interface CreateRequestInput {
  typeId: string;
  title: string;
  fields?: Record<string, unknown>;
  priority?: RequestPriority;
}

export const requestApi = {
  getOutbox: (status?: string) =>
    apiFetch<PaginatedResponse<RequestListItem>>(
      `/requests/outbox${status ? `?status=${status}` : ''}`,
    ),

  create: (input: CreateRequestInput) =>
    apiFetch<RequestListItem>('/requests', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getById: (id: string) => apiFetch(`/requests/${id}`),
};
