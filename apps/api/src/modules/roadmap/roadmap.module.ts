import { Module } from '@nestjs/common';
import { RoadmapController } from './roadmap.controller';
import { RoadmapSettingsController } from './roadmap-settings.controller';
import { RoadmapAdminController } from './roadmap-admin.controller';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapService } from './roadmap.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapWebhookController } from './roadmap-webhook.controller';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

@Module({
  controllers: [RoadmapController, RoadmapSettingsController, RoadmapAdminController, RoadmapWebhookController],
  providers: [RoadmapService, RoadmapIntegrationService, RoadmapWorkItemImportService, RoadmapAzureSyncService, AdminRoleGuard],
})
export class RoadmapModule {}
