import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { normalizeSyncSettings } from '@tracker/shared';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapService } from './roadmap.service';

const now = new Date('2026-11-13T15:00:00.000Z');
const project = {
  id: 'roadmap-id',
  externalId: 'azure-project',
  syncedAt: new Date('2026-11-13T14:55:00.000Z'),
  url: 'https://dev.azure.com/example/_apis/projects/azure-project',
};
const credentials = {
  organizationUrl: 'https://dev.azure.com/example',
  organization: 'example',
  pat: 'test-pat',
};

function setup(projects = [project]) {
  const prisma = {
    roadmapAzureProjectState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
    roadmapRole: { findMany: jest.fn().mockResolvedValue([]) },
    roadmapWorkItem: { findMany: jest.fn().mockResolvedValue([]) },
    roadmapProject: {
      findMany: jest.fn().mockResolvedValue(projects),
      findUnique: jest.fn().mockResolvedValue({ id: project.id }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const integration = {
    getPublicSettings: jest.fn().mockResolvedValue({ configured: true }),
    getCredentials: jest.fn().mockResolvedValue(credentials),
    getSyncSettings: jest
      .fn()
      .mockResolvedValue(normalizeSyncSettings(undefined)),
    requestJson: jest.fn().mockResolvedValue({ workItems: [] }),
  };
  const importer = {
    importWorkItems: jest.fn().mockResolvedValue([]),
    invalidateFieldCatalog: jest.fn(),
  };
  const catalog = {
    syncProject: jest
      .fn()
      .mockResolvedValue({ projectId: project.id, importedRoles: 1 }),
  };
  const createService = (workItemImporter: RoadmapWorkItemImportService) =>
    new RoadmapService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      workItemImporter,
      {} as RoadmapAzureSyncService,
      catalog as unknown as RoadmapAzureCatalogService,
      {} as RoadmapPlanChangeService,
    );
  return {
    service: createService(importer as unknown as RoadmapWorkItemImportService),
    createService,
    prisma,
    integration,
    importer,
    catalog,
  };
}

describe('Scheduled Roadmap project refresh', () => {
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => jest.useRealTimers());

  it('imports changes in pages for projects already loaded from the connected organization', async () => {
    const unrelatedProject = {
      ...project,
      id: 'other-org',
      url: 'https://dev.azure.com/other',
    };
    const { service, prisma, integration, importer, catalog } = setup([
      project,
      unrelatedProject,
    ]);
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
    }));
    integration.requestJson
      .mockResolvedValueOnce({ workItems: firstPage })
      .mockResolvedValueOnce({ workItems: [{ id: 1005 }] });

    await service.refreshImportedProjects();

    expect(prisma.roadmapProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { syncedAt: { not: null } } }),
    );
    const [first, second] = integration.requestJson.mock.calls;
    expect(first[0]).toContain(
      '/azure-project/_apis/wit/wiql?timePrecision=true',
    );
    expect(JSON.parse(first[1].body).query).toContain(
      "[System.ChangedDate] >= '2026-11-13T14:54:00.000Z' AND [System.ChangedDate] < '2026-11-13T15:00:00.000Z'",
    );
    expect(JSON.parse(second[1].body).query).toContain('[System.Id] > 1000');
    const importOptions = {
      requestTimeoutMs: expect.any(Number),
      requireAll: true,
    };
    expect(importer.importWorkItems).toHaveBeenNthCalledWith(
      1,
      project,
      firstPage.map(({ id }) => id),
      credentials,
      importOptions,
    );
    expect(importer.importWorkItems).toHaveBeenNthCalledWith(
      2,
      project,
      [1005],
      credentials,
      importOptions,
    );
    expect(catalog.syncProject).not.toHaveBeenCalled();
    expect(prisma.roadmapProject.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.roadmapProject.updateMany).toHaveBeenCalledWith({
      where: {
        id: project.id,
        OR: [{ syncedAt: null }, { syncedAt: { lt: now } }],
      },
      data: { syncedAt: now },
    });
  });

  it('keeps the previous timestamp for a failed import and refreshes the next project', async () => {
    const nextProject = {
      ...project,
      id: 'next',
      externalId: 'next-azure-project',
    };
    const { service, prisma, integration, importer } = setup([
      project,
      nextProject,
    ]);
    integration.requestJson.mockResolvedValueOnce({ workItems: [{ id: 7 }] });
    importer.importWorkItems.mockRejectedValueOnce(
      new Error('failed to save work item'),
    );

    await service.refreshImportedProjects();

    expect(prisma.roadmapProject.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.roadmapProject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: nextProject.id }),
      }),
    );
  });

  it('does not advance past a change that Azure omits from the work item batch', async () => {
    const { createService, prisma, integration } = setup();
    const importer = new RoadmapWorkItemImportService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
    );
    integration.requestJson
      .mockResolvedValueOnce({ workItems: [{ id: 7 }] })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [] });

    await createService(importer).refreshImportedProjects();

    expect(
      JSON.parse(integration.requestJson.mock.calls[2][1].body),
    ).toMatchObject({ ids: [7], errorPolicy: 'fail' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.roadmapProject.updateMany).not.toHaveBeenCalled();
  });

  it('keeps manual import available for loading the catalog and all work items', async () => {
    const { service, integration, importer, catalog } = setup();
    integration.requestJson.mockResolvedValueOnce({ workItems: [{ id: 7 }] });
    importer.importWorkItems.mockResolvedValueOnce([{ id: 7 }]);

    await expect(service.syncProject(project.externalId)).resolves.toEqual({
      projectId: project.id,
      importedRoles: 1,
      importedWorkItems: 1,
    });

    expect(catalog.syncProject).toHaveBeenCalledWith(
      project.externalId,
      credentials,
    );
    expect(importer.invalidateFieldCatalog).toHaveBeenCalled();
    expect(
      JSON.parse(integration.requestJson.mock.calls[0][1].body).query,
    ).not.toContain('[System.ChangedDate]');
  });

  it('enriches unchanged cards from old imports once, including clearing an unassigned identity', async () => {
    const { service, prisma, importer } = setup();
    prisma.roadmapWorkItem.findMany.mockResolvedValueOnce([
      { externalId: '7', azureCustomFields: { 'Custom.Estimate': 12 } },
      { externalId: '8', azureCustomFields: { 'System.AssignedTo': null } },
    ]);
    importer.importWorkItems.mockResolvedValueOnce([{ id: 7 }]);
    await service.refreshImportedProjects();
    expect(importer.importWorkItems).toHaveBeenNthCalledWith(
      1,
      project,
      [7],
      credentials,
      { requestTimeoutMs: expect.any(Number) },
    );
    expect(prisma.roadmapProject.updateMany).toHaveBeenCalledTimes(1);
  });

  it('records a poll that imported changes as import health', async () => {
    const { service, prisma, integration, importer } = setup();
    integration.requestJson.mockResolvedValueOnce({ workItems: [{ id: 7 }] });
    importer.importWorkItems.mockResolvedValueOnce([{ id: 7 }]);

    await service.refreshImportedProjects();

    expect(prisma.roadmapAzureProjectState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: project.id },
        update: {
          importFailingSince: null,
          lastImportOkAt: now,
          lastImportChangedAt: now,
        },
      }),
    );
  });

  it('records a quiet poll without touching lastImportChangedAt', async () => {
    const { service, prisma } = setup();

    await service.refreshImportedProjects();

    const [call] = prisma.roadmapAzureProjectState.upsert.mock.calls;
    expect(call[0].update).toEqual({
      importFailingSince: null,
      lastImportOkAt: now,
    });
  });

  it('records a failed scheduled import against its project', async () => {
    const { service, prisma, integration, importer } = setup();
    integration.requestJson.mockResolvedValueOnce({ workItems: [{ id: 7 }] });
    importer.importWorkItems.mockRejectedValueOnce(
      new Error('failed to save work item'),
    );

    await service.refreshImportedProjects();

    expect(prisma.roadmapAzureProjectState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: project.id },
        update: {
          lastImportFailedAt: now,
          lastImportError: 'failed to save work item',
        },
      }),
    );
  });

  it('records a failed manual import even when the catalog fails first', async () => {
    const { service, prisma, catalog } = setup();
    catalog.syncProject.mockRejectedValueOnce(new Error('catalog unavailable'));

    await expect(service.syncProject(project.externalId)).rejects.toThrow(
      'catalog unavailable',
    );

    expect(prisma.roadmapProject.findUnique).toHaveBeenCalledWith({
      where: { externalId: project.externalId },
      select: { id: true },
    });
    expect(prisma.roadmapAzureProjectState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: project.id },
        update: expect.objectContaining({
          lastImportError: 'catalog unavailable',
        }),
      }),
    );
  });

  it('records a successful manual import as a poll', async () => {
    const { service, prisma, integration, importer } = setup();
    integration.requestJson.mockResolvedValueOnce({ workItems: [{ id: 7 }] });
    importer.importWorkItems.mockResolvedValueOnce([{ id: 7 }]);

    await service.syncProject(project.externalId);

    expect(prisma.roadmapAzureProjectState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ lastImportChangedAt: now }),
      }),
    );
  });
});
