import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../../../shared/domain/domain.error';
import {
  NotificationRepository,
  type ListNotificationsResult,
} from '../../domain/notification.repository';

export interface ListNotificationsCommand {
  userId: string;
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class ListNotificationsHandler {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(command: ListNotificationsCommand): Promise<ListNotificationsResult> {
    const page = command.page ?? 1;
    const limit = command.limit ?? 20;

    if (page < 1) {
      throw new ValidationError('page must be >= 1');
    }
    if (limit < 1 || limit > 100) {
      throw new ValidationError('limit must be between 1 and 100');
    }

    return this.notifications.list({
      userId: command.userId,
      page,
      limit,
      unreadOnly: command.unreadOnly,
    });
  }
}
