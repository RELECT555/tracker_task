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
    ).resolves.toEqual({ iterationPath: null, iterationPaths: [], scoped: false });
    expect(integration.requestJson).not.toHaveBeenCalled();
  });

  it('returns the work item path of the quarter iteration', async () => {
    const { service } = setup();
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({
      iterationPath: 'P\\2026\\Q4',
      iterationPaths: ['P\\2026\\Q4'],
      scoped: true,
    });
  });

  it('returns null when Azure cannot be reached', async () => {
    const { service, integration } = setup();
    integration.getCredentials.mockRejectedValueOnce(new Error('no PAT'));
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: null, iterationPaths: [], scoped: false });
  });

  it('returns null when the iterations request fails', async () => {
    const { service, integration } = setup();
    integration.requestJson.mockRejectedValueOnce(new Error('503'));
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: null, iterationPaths: [], scoped: false });
  });
});

describe('Quarter sprints', () => {
  const sprint = (name: string, startDate?: string, finishDate?: string) => ({
    name,
    path: `\\P\\Iteration\\${name}`,
    ...(startDate && finishDate ? { attributes: { startDate, finishDate } } : {}),
  });
  /** A team that plans in monthly sprints and has no iteration named after a quarter. */
  const monthly = {
    name: 'P',
    path: '\\P\\Iteration',
    children: [
      sprint('Sprint 26_09', '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
      sprint('Sprint 26_10', '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z'),
      // Starts in October and ends in November: its midpoint decides, so it stays in Q4.
      sprint('Sprint 26_11', '2026-10-26T00:00:00Z', '2026-11-29T00:00:00Z'),
      sprint('Sprint 26_12', '2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z'),
      sprint('Sprint 27_01', '2027-01-01T00:00:00Z', '2027-01-31T00:00:00Z'),
      // A year-long container is not a sprint, even though it covers the quarter.
      sprint('2026', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z'),
      // No dates: placed by the year and month in the name, never by a bare number.
      sprint('Sprint 26_10 hotfix'),
      sprint('Sprint 026'),
    ],
  };

  it('collects the sprints that fall inside the quarter', async () => {
    const { service, integration } = setup();
    integration.requestJson.mockResolvedValue(monthly);
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({
      // The year container still spans the quarter, which is what Task write-back uses.
      iterationPath: 'P\\2026',
      iterationPaths: [
        'P\\Sprint 26_10',
        'P\\Sprint 26_11',
        'P\\Sprint 26_12',
        'P\\Sprint 26_10 hotfix',
      ],
      scoped: true,
    });
  });

  it('gives the next quarter only its own sprints', async () => {
    const { service, integration } = setup();
    integration.requestJson.mockResolvedValue(monthly);
    const { iterationPaths } = await service.findQuarterIteration(
      'project-id',
      '2027-Q1',
    );
    expect(iterationPaths).toEqual(['P\\Sprint 27_01']);
  });

  it('prefers an iteration named after the quarter over its sprints', async () => {
    const { service } = setup();
    const { iterationPaths } = await service.findQuarterIteration(
      'project-id',
      '2026-Q4',
    );
    expect(iterationPaths).toEqual(['P\\2026\\Q4']);
  });

  it('is empty but still scoped for a quarter without sprints in a project that plans by sprint', async () => {
    const { service, integration } = setup();
    integration.requestJson.mockResolvedValue(monthly);
    // The plan must show this quarter as empty, not fall back to every card's estimate.
    await expect(
      service.findQuarterIteration('project-id', '2025-Q2'),
    ).resolves.toEqual({ iterationPath: null, iterationPaths: [], scoped: true });
  });

  it('is not scoped when the project has no sprints or quarters at all', async () => {
    const { service, integration } = setup();
    integration.requestJson.mockResolvedValue({
      name: 'P',
      path: '\\P\\Iteration',
      children: [
        { name: 'Backlog', path: '\\P\\Iteration\\Backlog' },
        { name: 'Sprint 026', path: '\\P\\Iteration\\Sprint 026' },
      ],
    });
    await expect(
      service.findQuarterIteration('project-id', '2026-Q4'),
    ).resolves.toEqual({ iterationPath: null, iterationPaths: [], scoped: false });
  });
});
