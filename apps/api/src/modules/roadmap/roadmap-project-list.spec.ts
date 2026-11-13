import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { AzureDevOpsHttpError, type RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapService } from './roadmap.service';

const cachedProject = { id: 'roadmap-id', externalId: 'azure-id', name: 'Support', syncedAt: new Date('2026-11-13') };

function serviceWithAzureError(status: number, projects: typeof cachedProject[] = []) {
  const error = new AzureDevOpsHttpError(status, 'Azure response details');
  const prisma = { roadmapProject: { findMany: jest.fn().mockResolvedValue(projects) } };
  const integration = {
    getCredentials: jest.fn().mockResolvedValue({ organizationUrl: 'https://dev.azure.com/example' }),
    request: jest.fn().mockRejectedValue(error),
  };
  return {
    error,
    service: new RoadmapService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      {} as RoadmapWorkItemImportService,
      {} as RoadmapAzureSyncService,
      {} as RoadmapAzureCatalogService,
    ),
  };
}

describe('Azure project listing fallback', () => {
  it.each([401, 403])('reports denied access (%s) even with an empty cache', async (status) => {
    const { service } = serviceWithAzureError(status);

    await expect(service.listAzureProjects()).resolves.toEqual({
      source: 'cache', azureError: 'access-denied', data: [],
    });
  });

  it('preserves cached projects during an Azure outage', async () => {
    const { service } = serviceWithAzureError(503, [cachedProject]);

    await expect(service.listAzureProjects()).resolves.toEqual({
      source: 'cache',
      azureError: 'unavailable',
      data: [{ id: 'azure-id', name: 'Support', imported: true, roadmapId: 'roadmap-id', planSynced: true }],
    });
  });

  it('preserves the error for other Azure failures when there is no cache', async () => {
    const { error, service } = serviceWithAzureError(503);

    await expect(service.listAzureProjects()).rejects.toBe(error);
  });
});
