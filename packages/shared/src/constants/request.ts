export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'in_progress',
  'pending_info',
  'approved',
  'rejected',
  'cancelled',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const ROLE_CODES = [
  'employee',
  'manager',
  'director',
  'admin',
  'observer',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'Черновик',
  submitted: 'Отправлен',
  in_progress: 'В работе',
  pending_info: 'Уточнение',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
};
