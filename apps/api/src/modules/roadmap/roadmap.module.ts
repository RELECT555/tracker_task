import { Module } from '@nestjs/common';
import { RoadmapController } from './roadmap.controller';
import { RoadmapSettingsController } from './roadmap-settings.controller';
import { RoadmapAdminController } from './roadmap-admin.controller';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { IdentityModule } from '../identity/identity.module';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapService } from './roadmap.service';
import { RoadmapProjectImportService } from './roadmap-project-import.service';
import { RoadmapPeopleService } from './roadmap-people.service';
import { RoadmapRolesService } from './roadmap-roles.service';
import { RoadmapAllocationService } from './roadmap-allocation.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapAzureTaskService } from './roadmap-azure-task.service';
import { RoadmapAzureFeatureFieldsService } from './roadmap-azure-feature-fields.service';
import { RoadmapWriteBackAccessService } from './roadmap-write-back-access.service';
import { RoadmapAzureWebhookService } from './roadmap-azure-webhook.service';
import { RoadmapAzureSyncStatusService } from './roadmap-azure-sync-status.service';
import { RoadmapWebhookController } from './roadmap-webhook.controller';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import { RoadmapWorkItemCardService } from './roadmap-work-item-card.service';
import { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { RoadmapWorkItemCreateService } from './roadmap-work-item-create.service';
import { RoadmapProjectAccessController } from './roadmap-project-access.controller';
import { RoadmapProjectAccessService } from './roadmap-project-access.service';
import { RoadmapTablePreferencesController } from './roadmap-table-preferences.controller';
import { RoadmapTablePreferencesService } from './roadmap-table-preferences.service';
import { RoadmapAlertsService } from './roadmap-alerts.service';
import { RoadmapNotificationsController } from './roadmap-notifications.controller';
import { RoadmapNotificationsService } from './roadmap-notifications.service';

@Module({
  imports: [IdentityModule],
  controllers: [
    RoadmapController,
    RoadmapSettingsController,
    RoadmapAdminController,
    RoadmapWebhookController,
    RoadmapProjectAccessController,
    RoadmapTablePreferencesController,
    RoadmapNotificationsController,
  ],
  providers: [
    RoadmapService,
    RoadmapProjectImportService,
    RoadmapPeopleService,
    RoadmapRolesService,
    RoadmapAllocationService,
    RoadmapIntegrationService,
    RoadmapWorkItemImportService,
    RoadmapAzureSyncService,
    RoadmapAzureProcessService,
    RoadmapAzureTaskService,
    RoadmapAzureFeatureFieldsService,
    RoadmapWriteBackAccessService,
    RoadmapAzureWebhookService,
    RoadmapAzureSyncStatusService,
    RoadmapAzureCatalogService,
    RoadmapWorkItemCreateService,
    RoadmapWorkItemCardService,
    RoadmapAllocationAzureService,
    RoadmapProjectAccessService,
    RoadmapTablePreferencesService,
    RoadmapAlertsService,
    RoadmapNotificationsService,
    AdminRoleGuard,
  ],
  exports: [
    RoadmapService,
    RoadmapAllocationService,
    RoadmapProjectAccessService,
  ],
})
export class RoadmapModule {}
