import { Module } from '@nestjs/common';
import { MarkAllNotificationsReadHandler } from './application/commands/mark-all-notifications-read.handler';
import { MarkNotificationReadHandler } from './application/commands/mark-notification-read.handler';
import { NotificationRecorder } from './application/notification-recorder';
import { NotificationStream } from './application/notification-stream.service';
import { ListNotificationsHandler } from './application/queries/list-notifications.handler';
import { NotificationRepository } from './domain/notification.repository';
import { PrismaNotificationRepository } from './infrastructure/notification.repository.impl';
import { NotificationController } from './presentation/notification.controller';

@Module({
  controllers: [NotificationController],
  providers: [
    PrismaNotificationRepository,
    { provide: NotificationRepository, useExisting: PrismaNotificationRepository },
    NotificationRecorder,
    NotificationStream,
    ListNotificationsHandler,
    MarkNotificationReadHandler,
    MarkAllNotificationsReadHandler,
  ],
  exports: [NotificationRecorder],
})
export class NotificationModule {}
