import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationRepository } from '../domain/notification.repository';
import { NotificationStream } from './notification-stream.service';

export interface SendNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  requestId?: string;
}

/**
 * Write port for other modules. Fire-and-forget — no read API exposed here.
 * Persists the notification, then pushes it to any live SSE subscriber.
 */
@Injectable()
export class NotificationRecorder {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly stream: NotificationStream,
  ) {}

  async send(input: SendNotificationInput): Promise<void> {
    const id = randomUUID();

    await this.notifications.create({
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      requestId: input.requestId ?? null,
    });

    this.stream.publish({
      userId: input.userId,
      notificationId: id,
      type: input.type,
      title: input.title,
      requestId: input.requestId ?? null,
    });
  }
}
