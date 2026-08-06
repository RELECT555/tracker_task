export interface CreateNotificationInput {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  requestId?: string | null;
}

export interface NotificationListItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  requestId: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface ListNotificationsQuery {
  userId: string;
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export interface ListNotificationsResult {
  items: NotificationListItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export abstract class NotificationRepository {
  abstract create(input: CreateNotificationInput): Promise<void>;
  abstract list(query: ListNotificationsQuery): Promise<ListNotificationsResult>;
  abstract markRead(id: string, userId: string): Promise<void>;
  abstract markAllRead(userId: string): Promise<void>;
  abstract countUnread(userId: string): Promise<number>;
}
