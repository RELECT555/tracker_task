import { Module } from '@nestjs/common';
import { RoadmapController } from './roadmap.controller';
import { RoadmapSettingsController } from './roadmap-settings.controller';
import { RoadmapAdminController } from './roadmap-admin.controller';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapService } from './roadmap.service';

@Module({
  controllers: [RoadmapController, RoadmapSettingsController, RoadmapAdminController],
  providers: [RoadmapService, RoadmapIntegrationService, AdminRoleGuard],
})
export class RoadmapModule {}
