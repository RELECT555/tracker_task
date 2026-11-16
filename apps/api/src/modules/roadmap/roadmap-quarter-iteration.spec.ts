import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { createAzureSyncServices } from './roadmap-azure-sync.testing';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

const iterations = {
  name: 'P',
  path: '\\P\\Iteration',
  children: [
    {
      name: '2026',
      path: '\\P\\Iteration\\2026',
      children: [
        { name: 'Q3', path: '\\P\\Iteration\\2026\\Q3' },
        { name: 'Q4', path: '\\P\\Iteration\\2026\\Q4' },
      ],
    },
  ],
};

function setup() {
  const prisma = {
    roadmapProject: {
      findUnique: jest.fn().mockResolvedValue({ externalId: 'azure-project' }),
    },
  };
  const integration = {
    getPublicSettings: jest.fn().mockResolvedValue({ configured: true }),
    getCredentials: jest
      .fn()
      .mockResolvedValue({ organizationUrl: 'https://dev.azure.com/org' }),
    requestJson: jest.fn().mockResolvedValue(iterations),
  };
  const service = createAzureSyncServices(
    prisma as unknown as PrismaService,
    integration as unknown as RoadmapIntegrationService,
    {} as RoadmapWorkItemImportService,
    {} as IsActiveAdminHandler,
    {} as RoadmapAllocationAzureService,
  ).azureProcess;
  return { service, prisma, integration };
}

describe('Quarter iteration lookup', () => {
  it.each(['2026-Q5', '2026Q4', '', undefined])(
    'rejects the malformed quarter %p',
    async (quarterKey) => {
      const { service } = setup();
      await expect(
        service.findQuarterIteration('project-id', quarterKey as string),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('reports an unknown project', async () => {
    const { service, prisma } = setup();
    prisma.roadmapProject.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not call Azure while the integration is not configured', async () => {
    const { service, integration } = setup();
    integration.getPublicSettings.mockResolvedValueOnce({ configured: false });
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: null });
    expect(integration.requestJson).not.toHaveBeenCalled();
  });

  it('returns the work item path of the quarter iteration', async () => {
    const { service } = setup();
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: 'P\\2026\\Q4' });
  });

  it('returns null when Azure cannot be reached', async () => {
    const { service, integration } = setup();
    integration.getCredentials.mockRejectedValueOnce(new Error('no PAT'));
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: null });
  });

  it('returns null when the iterations request fails', async () => {
    const { service, integration } = setup();
    integration.requestJson.mockRejectedValueOnce(new Error('503'));
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: null });
  });
});
