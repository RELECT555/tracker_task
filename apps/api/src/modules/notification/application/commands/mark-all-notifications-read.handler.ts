import { Injectable } from '@nestjs/common';
import { NotificationRepository } from '../../domain/notification.repository';

export interface MarkAllNotificationsReadCommand {
  userId: string;
}

@Injectable()
export class MarkAllNotificationsReadHandler {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(command: MarkAllNotificationsReadCommand): Promise<void> {
    await this.notifications.markAllRead(command.userId);
  }
}
