import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Query,
  Sse,
} from '@nestjs/common';
import { MarkAllNotificationsReadHandler } from '../application/commands/mark-all-notifications-read.handler';
import { MarkNotificationReadHandler } from '../application/commands/mark-notification-read.handler';
import { NotificationStream } from '../application/notification-stream.service';
import { ListNotificationsHandler } from '../application/queries/list-notifications.handler';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly listHandler: ListNotificationsHandler,
    private readonly markReadHandler: MarkNotificationReadHandler,
    private readonly markAllReadHandler: MarkAllNotificationsReadHandler,
    private readonly stream: NotificationStream,
  ) {}

  /** Server-Sent Events push for new notifications; auth via ?token= (EventSource can't set headers). */
  @Sse('stream')
  streamNotifications(@CurrentUser() user: { id: string }) {
    return this.stream.forUser(user.id);
  }

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('unreadOnly', new DefaultValuePipe(false), ParseBoolPipe) unreadOnly?: boolean,
  ) {
    return this.listHandler.execute({ userId: user.id, page, limit, unreadOnly });
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.markReadHandler.execute({ notificationId: id, userId: user.id });
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.markAllReadHandler.execute({ userId: user.id });
  }
}
