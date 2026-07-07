import type { RequestPriority, RequestStatus, RouteSnapshot } from '@tracker/shared';
import type { FieldSchemaItem } from '@/entities/request-type/model/field-schema';
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

export interface InboxListItem {
  id: string;
  title: string;
  status: RequestStatus;
  priority: RequestPriority;
  type: { id: string; name: string };
  author: { id: string; fullName: string };
  currentStep: { name: string; dueAt: string | null };
  createdAt: string;
}

export type RequestAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'request_info'
  | 'provide_info'
  | 'escalate'
  | 'cancel';

export interface RequestComment {
  id: string;
  body: string;
  isInternal: boolean;
  author: { id: string; fullName: string };
  createdAt: string;
}

export interface CommentPermissions {
  canComment: boolean;
  canInternalComment: boolean;
}

export interface RequestTransition {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  fromStep: number | null;
  toStep: number | null;
  action: string;
  actor: { id: string; fullName: string } | null;
  comment: string | null;
  createdAt: string;
}

export interface RequestDetail {
  id: string;
  title: string;
  status: RequestStatus;
  type: {
    id: string;
    name: string;
    code: string;
    fieldSchema: FieldSchemaItem[];
  } | null;
  fields: Record<string, unknown>;
  route: RouteSnapshot | null;
  currentStepIndex: number | null;
  author: { id: string; fullName: string };
  availableActions: RequestAction[];
  transitions: RequestTransition[];
  comments: RequestComment[];
  commentPermissions: CommentPermissions;
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
  getInbox: () =>
    apiFetch<PaginatedResponse<InboxListItem>>('/requests/inbox'),

  getOutbox: (status?: string) =>
    apiFetch<PaginatedResponse<RequestListItem>>(
      `/requests/outbox${status ? `?status=${status}` : ''}`,
    ),

  create: (input: CreateRequestInput) =>
    apiFetch<RequestListItem>('/requests', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  submit: (id: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  approve: (id: string, comment?: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  reject: (id: string, reason: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  cancel: (id: string, reason?: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  requestInfo: (id: string, message: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/request-info`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  provideInfo: (id: string, input: { fields?: Record<string, unknown>; comment?: string }) =>
    apiFetch<RequestDetail>(`/requests/${id}/provide-info`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  escalate: (id: string, reason: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  addComment: (id: string, body: string, isInternal?: boolean) =>
    apiFetch<RequestComment>(`/requests/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, isInternal }),
    }),

  getById: (id: string) => apiFetch<RequestDetail>(`/requests/${id}`),
};
