import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapService } from './roadmap.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

const completedWork = 'Microsoft.VSTS.Scheduling.CompletedWork';
const createdDate = 'System.CreatedDate';
const monthStartSnapshot = '2026-09-30T23:59:59.999Z';
const monthEndSnapshot = '2026-10-31T23:59:59.999Z';
const now = new Date('2026-11-13T14:30:00.000Z');

function azureItem(
  id: number,
  hours: number | undefined,
  created = '2026-01-01T00:00:00.000Z',
) {
  return { id, fields: { [completedWork]: hours, [createdDate]: created } };
}

function workItem(
  id: string,
  externalId: string,
  type: string,
  parentExternalId: string | null,
) {
  return {
    id,
    externalId,
    type,
    parentExternalId,
    allocations: [] as { id: string; azureTaskId: string | null }[],
  };
}

function setup(workItems: ReturnType<typeof workItem>[] = []) {
  const findUnique = jest.fn().mockResolvedValue({ workItems });
  const prisma = { roadmapProject: { findUnique } } as unknown as PrismaService;
  const requestJson = jest.fn();
  const getCredentials = jest
    .fn()
    .mockResolvedValue({ organizationUrl: 'https://dev.azure.com/example' });
  const integration = {
    requestJson,
    getCredentials,
  } as unknown as RoadmapIntegrationService;
  const importer = new RoadmapWorkItemImportService(prisma, integration);
  const service = new RoadmapService(
    prisma,
    integration,
    importer,
    {} as RoadmapAzureSyncService,
    {} as RoadmapAzureCatalogService,
  );
  return { service, importer, requestJson, getCredentials, findUnique };
}

describe('Roadmap monthly fact', () => {
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => jest.useRealTimers());

  it('adds source deltas to their current parent hierarchy and counts each source once in the project total', async () => {
    const epic = workItem('epic', '1', 'Epic', null);
    epic.allocations.push({ id: 'legacy-epic-allocation', azureTaskId: '6' });
    const feature = workItem('feature', '2', 'Feature', '1');
    feature.allocations.push(
      { id: 'linked', azureTaskId: '4' },
      { id: 'unlinked', azureTaskId: null },
    );
    const { service, requestJson } = setup([
      epic,
      feature,
      workItem('story', '3', 'User Story', '2'),
      workItem('task', '4', 'Task', '3'),
      workItem('orphanTask', '5', 'Task', null),
      workItem('newTask', '6', 'Task', '1'),
      workItem('futureTask', '7', 'Task', '1'),
    ]);
    requestJson
      .mockResolvedValueOnce({
        value: [
          azureItem(1, undefined),
          azureItem(2, 8),
          azureItem(4, 10),
          azureItem(5, 2),
        ],
      })
      .mockResolvedValueOnce({
        value: [
          azureItem(1, 3),
          azureItem(2, 6),
          azureItem(4, 16),
          azureItem(5, 9),
          azureItem(6, 4, '2026-10-01T00:00:00.000Z'),
        ],
      })
      .mockResolvedValueOnce({
        value: [azureItem(7, 9, '2026-11-01T00:00:00.000Z')],
      });

    await expect(service.getProjectFact('project', '2026-10')).resolves.toEqual(
      {
        workItems: { epic: 4, feature: 4 },
        allocations: { linked: 6 },
        totalHours: 4,
        sourceHours: { '1': 3, '2': -2, '4': 6, '5': 7, '6': 4, '7': 0 },
      },
    );
    const bodies = requestJson.mock.calls.map(([, init]) =>
      JSON.parse(init.body),
    );
    const fields = [completedWork, createdDate];
    expect(bodies).toEqual([
      {
        ids: [1, 2, 4, 5, 6, 7],
        fields,
        asOf: monthStartSnapshot,
        errorPolicy: 'omit',
      },
      {
        ids: [1, 2, 4, 5, 6, 7],
        fields,
        asOf: monthEndSnapshot,
        errorPolicy: 'omit',
      },
      { ids: [7], fields, errorPolicy: 'fail' },
    ]);
  });

  it('caps the current month at the request time and skips Azure for future months', async () => {
    const { service, requestJson } = setup([
      workItem('epic', '1', 'Epic', null),
    ]);
    requestJson.mockResolvedValue({ value: [azureItem(1, 2)] });

    const emptyFact = {
      workItems: {},
      allocations: {},
      totalHours: 0,
      sourceHours: {},
    };
    await expect(service.getProjectFact('project', '2026-11')).resolves.toEqual(
      { ...emptyFact, sourceHours: { '1': 0 } },
    );
    await expect(service.getProjectFact('project', '2026-12')).resolves.toEqual(
      emptyFact,
    );
    expect(
      requestJson.mock.calls.map(([, init]) => JSON.parse(init.body).asOf),
    ).toEqual([monthEndSnapshot, now.toISOString()]);
  });

  it('rejects a missing month or an invalid date before querying the project', async () => {
    const { service, findUnique } = setup();
    await expect(service.getProjectFact('project')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.getProjectFact('project', '2026-13'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getProjectFact('project', '2026-10\n'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a historical omission when the item already existed', async () => {
    const { service, requestJson } = setup([
      workItem('epic', '1', 'Epic', null),
    ]);
    requestJson
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [azureItem(1, 5)] });
    await expect(
      service.getProjectFact('project', '2026-10'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('loads both snapshots in batches of at most 200 items', async () => {
    const { importer, requestJson } = setup();
    requestJson.mockImplementation((_url: string, init: { body: string }) => {
      const { ids } = JSON.parse(init.body) as { ids: number[] };
      return Promise.resolve({ value: ids.map((id) => azureItem(id, 5)) });
    });
    const ids = Array.from({ length: 201 }, (_, index) => index + 1);
    const changes = await importer.getCompletedWorkChanges(
      ids,
      new Date(monthStartSnapshot),
      new Date(monthEndSnapshot),
    );
    expect(changes.size).toBe(201);
    expect(
      requestJson.mock.calls.map(
        ([, init]) => JSON.parse(init.body).ids.length,
      ),
    ).toEqual([200, 200, 1, 1]);
  });

  describe('child epics', () => {
    const items = () => [
      workItem('archive', '1', 'Epic', null),
      workItem('child', '2', 'Epic', '1'),
      workItem('childFeature', '3', 'Feature', '2'),
      workItem('childTask', '4', 'Task', '3'),
      workItem('ownFeature', '5', 'Feature', '1'),
      workItem('ownTask', '6', 'Task', '5'),
    ];
    const snapshots = (requestJson: jest.Mock) =>
      requestJson
        .mockResolvedValueOnce({
          value: [1, 2, 3, 4, 5, 6].map((id) => azureItem(id, 0)),
        })
        .mockResolvedValueOnce({
          value: [
            ...[1, 2, 3, 5].map((id) => azureItem(id, 0)),
            azureItem(4, 5),
            azureItem(6, 2),
          ],
        });

    it('keeps a child epic out of its parent epic by default', async () => {
      const { service, requestJson } = setup(items());
      snapshots(requestJson);
      const fact = await service.getProjectFact('project', '2026-10');
      expect(fact.workItems).toEqual({
        archive: 2,
        ownFeature: 2,
        child: 5,
        childFeature: 5,
      });
      expect(fact.totalHours).toBe(7);
    });

    it('rolls a child epic into its parent epic when the setting is on', async () => {
      const { service, requestJson } = setup(items());
      snapshots(requestJson);
      const fact = await service.getProjectFact('project', '2026-10', true);
      expect(fact.workItems).toEqual({
        archive: 7,
        ownFeature: 2,
        child: 5,
        childFeature: 5,
      });
      expect(fact.totalHours).toBe(7);
    });
  });
});
