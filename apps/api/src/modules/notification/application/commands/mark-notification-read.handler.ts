import { Injectable } from '@nestjs/common';
import { NotificationRepository } from '../../domain/notification.repository';

export interface MarkNotificationReadCommand {
  notificationId: string;
  userId: string;
}

@Injectable()
export class MarkNotificationReadHandler {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(command: MarkNotificationReadCommand): Promise<void> {
    await this.notifications.markRead(command.notificationId, command.userId);
  }
}
