import { Module } from '@nestjs/common';
import { RoadmapController } from './roadmap.controller';
import { RoadmapSettingsController } from './roadmap-settings.controller';
import { RoadmapAdminController } from './roadmap-admin.controller';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { IdentityModule } from '../identity/identity.module';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapService } from './roadmap.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapWebhookController } from './roadmap-webhook.controller';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import { RoadmapWorkItemCreateService } from './roadmap-work-item-create.service';
import { RoadmapProjectAccessController } from './roadmap-project-access.controller';
import { RoadmapProjectAccessService } from './roadmap-project-access.service';

@Module({
  imports: [IdentityModule],
  controllers: [
    RoadmapController,
    RoadmapSettingsController,
    RoadmapAdminController,
    RoadmapWebhookController,
    RoadmapProjectAccessController,
  ],
  providers: [
    RoadmapService,
    RoadmapIntegrationService,
    RoadmapWorkItemImportService,
    RoadmapAzureSyncService,
    RoadmapAzureCatalogService,
    RoadmapWorkItemCreateService,
    RoadmapProjectAccessService,
    AdminRoleGuard,
  ],
})
export class RoadmapModule {}
