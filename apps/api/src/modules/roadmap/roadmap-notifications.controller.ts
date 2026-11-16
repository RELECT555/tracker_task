import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../shared/presentation/decorators/current-user.decorator';
import { RoadmapNotificationsService } from './roadmap-notifications.service';

/** Authentication is enforced by AuthMiddleware; a user only ever sees their own notifications. */
@Controller('roadmap/notifications')
export class RoadmapNotificationsController {
  constructor(private readonly notifications: RoadmapNotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.notifications.list(user.id, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.summary(user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
