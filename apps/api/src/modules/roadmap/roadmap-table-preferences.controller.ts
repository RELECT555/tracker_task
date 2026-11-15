import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../shared/presentation/decorators/current-user.decorator';
import { RoadmapTablePreferencesService } from './roadmap-table-preferences.service';

/** Authentication is enforced by AuthMiddleware; these settings never target another user. */
@Controller('roadmap/preferences/table')
export class RoadmapTablePreferencesController {
  constructor(private readonly preferences: RoadmapTablePreferencesService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.get(user.id);
  }

  @Put()
  save(@CurrentUser() user: AuthenticatedUser, @Body() input: unknown) {
    return this.preferences.save(user.id, input);
  }
}
