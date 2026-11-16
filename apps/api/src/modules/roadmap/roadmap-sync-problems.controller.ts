import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../shared/presentation/decorators/current-user.decorator';
import { RoadmapSyncProblemsService } from './roadmap-sync-problems.service';

/** Authentication is enforced by AuthMiddleware; access to projects is checked by the service. */
@Controller('roadmap/sync-problems')
export class RoadmapSyncProblemsController {
  constructor(private readonly problems: RoadmapSyncProblemsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.problems.list(user, query);
  }

  @Get(':alertId/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId') alertId: string,
    @Query() query: unknown,
  ) {
    return this.problems.history(user, alertId, query);
  }
}
