/** Stable type codes stored in notifications.type */
export const NotificationTypes = {
  REQUEST_ASSIGNED: 'request.assigned',
  REQUEST_APPROVED: 'request.approved',
  REQUEST_REJECTED: 'request.rejected',
  REQUEST_INFO_REQUESTED: 'request.info_requested',
  REQUEST_COMPLETED: 'request.completed',
} as const;

export type NotificationType = (typeof NotificationTypes)[keyof typeof NotificationTypes];
