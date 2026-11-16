import { normalizeSyncSettings } from '@tracker/shared';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapService } from './roadmap.service';

const credentials = {
  organizationUrl: 'https://dev.azure.com/example',
  organization: 'example',
  pat: 'test-pat',
};

function setup() {
  const prisma = {
    $transaction: jest.fn().mockResolvedValue([]),
    roadmapRole: { findMany: jest.fn().mockResolvedValue([]) },
    roadmapWorkItem: {
      upsert: jest.fn().mockReturnValue('upsert'),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roadmapProject: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    roadmapAzureProjectState: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const integration = {
    getPublicSettings: jest.fn().mockResolvedValue({ configured: true }),
    getCredentials: jest.fn().mockResolvedValue(credentials),
    getSyncSettings: jest
      .fn()
      .mockResolvedValue(normalizeSyncSettings(undefined)),
    requestJson: jest.fn(),
  };
  return { prisma, integration };
}

describe('Work item iteration', () => {
  it('stores the Azure iteration path of an imported card, or null without one', async () => {
    const { prisma, integration } = setup();
    integration.requestJson
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({
        value: [
          {
            id: 7,
            url: 'https://dev.azure.com/example/_apis/wit/workItems/7',
            fields: {
              'System.WorkItemType': 'Feature',
              'System.IterationPath': 'P\\2026\\Q4',
            },
          },
          {
            id: 8,
            url: 'https://dev.azure.com/example/_apis/wit/workItems/8',
            fields: { 'System.WorkItemType': 'Feature' },
          },
        ],
      });
    const importer = new RoadmapWorkItemImportService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
    );

    await importer.importWorkItems({ id: 'roadmap-id' }, [7, 8], credentials);

    const [first, second] = prisma.roadmapWorkItem.upsert.mock.calls.map(
      ([args]) => args,
    );
    expect(first.create.iterationPath).toBe('P\\2026\\Q4');
    expect(first.update.iterationPath).toBe('P\\2026\\Q4');
    expect(second.create.iterationPath).toBeNull();
    expect(second.update.iterationPath).toBeNull();
  });

  it('re-imports unchanged cards stored before iterations were kept', async () => {
    const { prisma, integration } = setup();
    const project = {
      id: 'roadmap-id',
      externalId: 'azure-project',
      syncedAt: new Date('2026-11-13T14:55:00.000Z'),
      url: 'https://dev.azure.com/example/_apis/projects/azure-project',
    };
    prisma.roadmapProject.findMany.mockResolvedValue([project]);
    prisma.roadmapWorkItem.findMany.mockResolvedValueOnce([
      {
        externalId: '7',
        azureCustomFields: { 'System.AssignedTo': null },
        iterationPath: null,
      },
      {
        externalId: '8',
        azureCustomFields: { 'System.AssignedTo': null },
        iterationPath: 'P',
      },
    ]);
    integration.requestJson.mockResolvedValue({ workItems: [] });
    const importer = {
      importWorkItems: jest.fn().mockResolvedValue([{ id: 7 }]),
      invalidateFieldCatalog: jest.fn(),
    };
    const service = new RoadmapService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      importer as unknown as RoadmapWorkItemImportService,
      {} as RoadmapAzureSyncService,
      {} as RoadmapAzureCatalogService,
    );

    await service.refreshImportedProjects();

    expect(importer.importWorkItems).toHaveBeenNthCalledWith(
      1,
      project,
      [7],
      credentials,
      { requestTimeoutMs: expect.any(Number) },
    );
    expect(prisma.roadmapWorkItem.updateMany).not.toHaveBeenCalled();
  });

  it('marks cards Azure no longer returns, so they are not re-requested on every run', async () => {
    const { prisma, integration } = setup();
    const project = {
      id: 'roadmap-id',
      externalId: 'azure-project',
      syncedAt: new Date('2026-11-13T14:55:00.000Z'),
      url: 'https://dev.azure.com/example/_apis/projects/azure-project',
    };
    prisma.roadmapProject.findMany.mockResolvedValue([project]);
    prisma.roadmapWorkItem.findMany.mockResolvedValueOnce([
      { externalId: '7', azureCustomFields: { 'System.AssignedTo': null }, iterationPath: null },
      { externalId: '9', azureCustomFields: { 'System.AssignedTo': null }, iterationPath: null },
    ]);
    integration.requestJson.mockResolvedValue({ workItems: [] });
    const importer = {
      importWorkItems: jest.fn().mockResolvedValue([{ id: 7 }]),
      invalidateFieldCatalog: jest.fn(),
    };
    const service = new RoadmapService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      importer as unknown as RoadmapWorkItemImportService,
      {} as RoadmapAzureSyncService,
      {} as RoadmapAzureCatalogService,
    );

    await service.refreshImportedProjects();

    expect(prisma.roadmapWorkItem.updateMany).toHaveBeenCalledWith({
      where: { projectId: project.id, externalId: { in: ['9'] }, iterationPath: null },
      data: { iterationPath: '' },
    });
  });
});
