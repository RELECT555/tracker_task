import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

function setup() {
  const prisma = {
    roadmapAzureProjectState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const importer = { importWorkItems: jest.fn().mockResolvedValue([]) };
  const integration = {
    getCredentials: jest
      .fn()
      .mockResolvedValue({ organizationUrl: 'https://x' }),
  };
  const service = new RoadmapAzureSyncService(
    prisma as unknown as PrismaService,
    integration as unknown as RoadmapIntegrationService,
    importer as unknown as RoadmapWorkItemImportService,
    {} as IsActiveAdminHandler,
    {} as RoadmapAllocationAzureService,
    {} as RoadmapPlanChangeService,
  );
  service['pendingImports'].set('project-1', new Set([7]));
  return { prisma, importer, service };
}

describe('Webhook import health', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('records a successful webhook import without stamping lastImportChangedAt', async () => {
    const { prisma, service } = setup();

    await service['flushWebhookImports']();

    const [[call]] = prisma.roadmapAzureProjectState.upsert.mock.calls;
    expect(call.where).toEqual({ projectId: 'project-1' });
    expect(call.update).toEqual({
      importFailingSince: null,
      lastImportOkAt: expect.any(Date),
    });
  });

  it('records a failed webhook import and does not throw', async () => {
    const { prisma, importer, service } = setup();
    importer.importWorkItems.mockRejectedValueOnce(
      new Error('Azure DevOps returned 503'),
    );

    await expect(service['flushWebhookImports']()).resolves.toBeUndefined();

    const [[call]] = prisma.roadmapAzureProjectState.upsert.mock.calls;
    expect(call.update).toMatchObject({
      lastImportError: 'Azure DevOps returned 503',
    });
    expect(prisma.roadmapAzureProjectState.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1', importFailingSince: null },
      data: { importFailingSince: expect.any(Date) },
    });
  });
});
