import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapRolesService } from './roadmap-roles.service';
import type { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import type { RoadmapWriteBackAccessService } from './roadmap-write-back-access.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapService } from './roadmap.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

function project(id: string, externalId: string) {
  return {
    id,
    roles: [
      {
        id: 'developer',
        name: 'Developer',
        azureEstimateField: 'Custom.Developer',
        members: [{ person: { externalId: 'person', isActive: true } }],
      },
    ],
    workItems: [
      {
        id: 'feature',
        externalId,
        parentExternalId: null,
        type: 'Feature',
        actualHours: 3,
        azureCustomFields: { 'Custom.Developer': 8 },
        allocations: [
          {
            id: 'allocation',
            roleId: 'developer',
            personExternalId: 'person',
            quarterKey: '2026-Q4',
            estimatedHours: 5,
            azureTaskId: null,
            periods: [{ monthKey: '2026-10', hours: 2 }],
          },
        ],
      },
    ],
  };
}

function setup(projects: ReturnType<typeof project>[]) {
  const findMany = jest.fn().mockResolvedValue(projects);
  const getCompletedWorkChanges = jest.fn();
  const service = new RoadmapService(
    { roadmapProject: { findMany } } as unknown as PrismaService,
    {} as RoadmapIntegrationService,
    { getCompletedWorkChanges } as unknown as RoadmapWorkItemImportService,
    {} as RoadmapWriteBackAccessService,
    {} as RoadmapRolesService,
    {
      findQuarterIteration: jest
        .fn()
        .mockResolvedValue({ iterationPath: null, iterationPaths: [] }),
    } as unknown as RoadmapAzureProcessService,
  );
  return { service, findMany, getCompletedWorkChanges };
}

const input = { projectIds: ['first', 'second'], quarterKey: '2026-Q4' };

describe('Roadmap portfolio', () => {
  it('returns just the portfolio metrics and deduplicates roles and participants across projects', async () => {
    const { service, getCompletedWorkChanges } = setup([
      project('first', '1'),
      project('second', '2'),
    ]);
    const metrics = {
      epics: 0,
      features: 1,
      planHours: 5,
      actualHours: 3,
      roles: 1,
      participants: 1,
    };

    await expect(service.getProjectSummaries(input)).resolves.toEqual({
      projects: {
        first: { metrics, canExpand: true },
        second: { metrics, canExpand: true },
      },
      totals: { ...metrics, features: 2, planHours: 10, actualHours: 6 },
      factIncomplete: false,
    });
    expect(getCompletedWorkChanges).not.toHaveBeenCalled();
  });

  it('applies project read grants and withholds the overall total if the list includes an inaccessible project', async () => {
    const { service, findMany } = setup([project('first', '1')]);
    const result = await service.getProjectSummaries(
      input,
      ' Viewer@Example.test ',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['first', 'second'] },
          access: { some: { email: 'viewer@example.test' } },
        },
      }),
    );
    expect(Object.keys(result.projects)).toEqual(['first']);
    expect(result.totals).toBeUndefined();
  });

  it('keeps monthly plan metrics available when an Azure fact lookup fails for one project', async () => {
    const { service, getCompletedWorkChanges } = setup([
      project('first', '1'),
      project('second', '2'),
    ]);
    getCompletedWorkChanges
      .mockResolvedValueOnce(new Map([['1', 4]]))
      .mockRejectedValueOnce(new Error('Azure unavailable'));

    const result = await service.getProjectSummaries({
      ...input,
      monthKey: '2026-10',
    });
    expect(result.projects.first.metrics).toMatchObject({
      planHours: 2,
      actualHours: 4,
    });
    expect(result.projects.second.metrics).toMatchObject({
      planHours: 2,
      actualHours: null,
    });
    expect(result.totals).toMatchObject({ planHours: 4, actualHours: null });
    expect(result.factIncomplete).toBe(true);
  });

  it('counts cards with fact but no plan in the quarter only when the quarter fact is requested', async () => {
    const unplanned = (id: string, externalId: string) => {
      const entry = project(id, externalId);
      return {
        ...entry,
        workItems: [
          {
            ...entry.workItems[0],
            azureCustomFields: { 'Custom.Developer': 0 },
            allocations: [],
          },
        ],
      };
    };
    const { service, getCompletedWorkChanges } = setup([
      unplanned('first', '1'),
      unplanned('second', '2'),
    ]);
    jest.useFakeTimers({ now: new Date('2026-11-16T12:00:00.000Z') });
    try {
      getCompletedWorkChanges.mockImplementation(
        (_ids: number[], before: Date) =>
          Promise.resolve(
            before.toISOString().startsWith('2026-10-31')
              ? new Map([['1', 4]])
              : new Map(),
          ),
      );

      const planOnly = await service.getProjectSummaries(input);
      expect(planOnly.projects.first.metrics.features).toBe(0);
      expect(getCompletedWorkChanges).not.toHaveBeenCalled();

      const result = await service.getProjectSummaries({
        ...input,
        includeQuarterFact: true,
      });
      expect(result.projects.first.metrics.features).toBe(1);
      expect(result.projects.second.metrics.features).toBe(0);
      // December has not started, so only October and November reach Azure.
      expect(getCompletedWorkChanges).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('can return the monthly plan without contacting Azure for fact', async () => {
    const { service, getCompletedWorkChanges } = setup([
      project('first', '1'),
      project('second', '2'),
    ]);
    const result = await service.getProjectSummaries({
      ...input,
      monthKey: '2026-10',
      includeMonthlyFact: false,
    });

    expect(getCompletedWorkChanges).not.toHaveBeenCalled();
    expect(result.totals).toMatchObject({ planHours: 4, actualHours: null });
    expect(result.factIncomplete).toBe(false);
  });
});
