import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
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
    {} as RoadmapAzureSyncService,
    {} as RoadmapAzureCatalogService,
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
