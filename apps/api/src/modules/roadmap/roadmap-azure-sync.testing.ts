import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { RoadmapAzureFeatureFieldsService } from './roadmap-azure-feature-fields.service';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapAzureSyncStatusService } from './roadmap-azure-sync-status.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapAzureTaskService } from './roadmap-azure-task.service';
import { RoadmapAzureWebhookService } from './roadmap-azure-webhook.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapWriteBackAccessService } from './roadmap-write-back-access.service';

/**
 * Test-only: wires the real write-back services the way RoadmapModule does, so a spec
 * exercises the whole sync path with only Prisma and Azure DevOps mocked.
 */
export function createAzureSyncServices(
  prisma: PrismaService,
  integration: RoadmapIntegrationService,
  importer: RoadmapWorkItemImportService,
  isActiveAdmin: IsActiveAdminHandler,
  allocationAzure: RoadmapAllocationAzureService,
) {
  const access = new RoadmapWriteBackAccessService(integration, isActiveAdmin);
  const azureProcess = new RoadmapAzureProcessService(prisma, integration);
  const tasks = new RoadmapAzureTaskService(integration, azureProcess);
  const featureFields = new RoadmapAzureFeatureFieldsService(
    prisma,
    integration,
    importer,
  );
  return {
    sync: new RoadmapAzureSyncService(
      prisma,
      integration,
      importer,
      allocationAzure,
      access,
      azureProcess,
      tasks,
      featureFields,
    ),
    status: new RoadmapAzureSyncStatusService(
      prisma,
      integration,
      access,
      azureProcess,
      tasks,
      featureFields,
    ),
    webhooks: new RoadmapAzureWebhookService(prisma, integration, importer),
    azureProcess,
    featureFields,
    access,
    tasks,
  };
}
