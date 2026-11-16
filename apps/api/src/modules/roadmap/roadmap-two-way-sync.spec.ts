import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { decideEstimate, scalePeriods } from './roadmap-allocation-reconcile';
import { createAzureSyncServices } from './roadmap-azure-sync.testing';
import {
  AzureDevOpsHttpError,
  type RoadmapIntegrationService,
} from './roadmap-integration.service';
import type {
  AzureWorkItem,
  RoadmapWorkItemImportService,
} from './roadmap-work-item-import.service';
import { normalizeWriteBackSettings } from './roadmap-write-back.settings';

const ORIGINAL = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
const REMAINING = 'Microsoft.VSTS.Scheduling.RemainingWork';
const COMPLETED = 'Microsoft.VSTS.Scheduling.CompletedWork';

describe('two-way sync rules', () => {
  it('takes an Azure estimate when Roadmap did not change it', () => {
    expect(
      decideEstimate({ azure: 12, pushed: 8, planned: 8, policy: 'overwrite' }),
    ).toEqual({ action: 'accept', hours: 12 });
  });

  it('ignores Azure when nothing changed there', () => {
    expect(
      decideEstimate({ azure: 8, pushed: 8, planned: 20, policy: 'stop' }),
    ).toEqual({ action: 'none' });
  });

  it('applies the conflict policy when both sides changed', () => {
    const both = { azure: 12, pushed: 8, planned: 16 };
    expect(decideEstimate({ ...both, policy: 'overwrite' })).toEqual({
      action: 'keep-roadmap',
    });
    expect(decideEstimate({ ...both, policy: 'skip-field' })).toEqual({
      action: 'accept',
      hours: 12,
    });
    expect(decideEstimate({ ...both, policy: 'stop' })).toMatchObject({
      action: 'conflict',
    });
  });

  it('shrinks the monthly split only when it no longer fits', () => {
    const periods = [
      { id: 'a', hours: 10 },
      { id: 'b', hours: 10 },
    ];
    expect(scalePeriods(periods, 30)).toEqual([]);
    expect(scalePeriods(periods, 15)).toEqual([
      { id: 'a', hours: 7.5 },
      { id: 'b', hours: 7.5 },
    ]);
  });
});

function allocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'allocation',
    workItemId: 'feature',
    roleId: 'role',
    personExternalId: 'ivan',
    personName: 'Иван',
    personEmail: 'ivan@example.test',
    quarterKey: '2026-Q4',
    estimatedHours: 8,
    azurePushedHours: 8,
    azureTaskId: '42',
    azureSyncStatus: 'synced',
    azureSyncClaimId: null,
    updatedAt: new Date('2026-11-01'),
    role: { name: 'Backend' },
    periods: [
      { id: 'oct', hours: 4 },
      { id: 'nov', hours: 4 },
    ],
    workItem: {
      projectId: 'project',
      project: { externalId: 'azure-project' },
    },
    ...overrides,
  };
}

function allocationService(
  row = allocationRow(),
  settings: Record<string, unknown> = {},
) {
  const updates: Record<string, unknown>[] = [];
  const periodUpdates: unknown[] = [];
  const tx = {
    roadmapAllocation: {
      updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({ count: 1 });
      }),
    },
    roadmapPeriodAllocation: {
      update: jest.fn((input: unknown) => {
        periodUpdates.push(input);
        return Promise.resolve({});
      }),
    },
  };
  const prisma = {
    ...tx,
    roadmapAzureProjectState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roadmapAllocation: {
      ...tx.roadmapAllocation,
      findMany: jest.fn().mockResolvedValue([row]),
      findUnique: jest.fn().mockResolvedValue(row),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(row),
    },
    roadmapPerson: { findFirst: jest.fn().mockResolvedValue(null) },
    roadmapRoleMember: { findFirst: jest.fn().mockResolvedValue(null) },
    roadmapWorkItem: {
      findUnique: jest.fn().mockResolvedValue({ actualHours: 5 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Мария Петрова' }),
    },
    $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  };
  const task = {
    id: 42,
    rev: 3,
    url: '',
    fields: {
      [COMPLETED]: 2,
      [REMAINING]: 6,
      [ORIGINAL]: 8,
      'System.AssignedTo': { uniqueName: 'ivan@example.test' },
    },
  };
  const request = jest.fn().mockResolvedValue(undefined);
  const integration = {
    getWriteBackSettings: jest.fn().mockResolvedValue({
      mode: 'manual',
      conflictPolicy: 'overwrite',
      ...settings,
    }),
    getCredentials: jest.fn().mockResolvedValue({
      organizationUrl: 'https://dev.azure.com/org',
      pat: 'x',
    }),
    requestJson: jest.fn().mockResolvedValue(task),
    request,
  };
  const importer = {
    onImported: jest.fn(),
    importWorkItems: jest.fn().mockResolvedValue([]),
  };
  const service = new RoadmapAllocationAzureService(
    prisma as unknown as PrismaService,
    integration as unknown as RoadmapIntegrationService,
    importer as unknown as RoadmapWorkItemImportService,
    {
      execute: jest.fn().mockResolvedValue(false),
    } as unknown as IsActiveAdminHandler,
  );
  const body = (call = 0) =>
    JSON.parse(
      (request.mock.calls[call] as [string, { body: string }])[1].body,
    ) as {
      op: string;
      path: string;
      value: unknown;
    }[];
  return {
    service,
    prisma,
    request,
    updates,
    periodUpdates,
    task,
    body,
    importer,
  };
}

const azureTask = (fields: Record<string, unknown>) =>
  ({ id: 42, rev: 3, url: '', fields }) as AzureWorkItem;

describe('Azure → Roadmap allocation changes', () => {
  it('takes a new Azure estimate into the plan and shrinks the months', async () => {
    const { service, updates, periodUpdates } = allocationService();

    await service.reconcile('project', [
      azureTask({
        [ORIGINAL]: 6,
        'System.AssignedTo': { uniqueName: 'ivan@example.test' },
      }),
    ]);

    expect(updates[0]).toMatchObject({
      estimatedHours: 6,
      azurePushedHours: 6,
    });
    expect(periodUpdates).toEqual([
      { where: { id: 'oct' }, data: { hours: 3 } },
      { where: { id: 'nov' }, data: { hours: 3 } },
    ]);
  });

  it('moves the plan to the person assigned in Azure when they are in the role', async () => {
    const { service, prisma, updates } = allocationService();
    prisma.roadmapPerson.findFirst.mockResolvedValue({
      id: 'p2',
      externalId: 'olga',
      name: 'Ольга',
      email: 'olga@example.test',
    });
    prisma.roadmapRoleMember.findFirst.mockResolvedValue({ id: 'm' });

    await service.reconcile('project', [
      azureTask({
        [ORIGINAL]: 8,
        'System.AssignedTo': { uniqueName: 'Olga@example.test' },
      }),
    ]);

    expect(updates[0]).toMatchObject({
      personExternalId: 'olga',
      personName: 'Ольга',
      personEmail: 'olga@example.test',
    });
  });

  it('marks a conflict when the Azure assignee is not in the role', async () => {
    const { service, prisma, updates } = allocationService();
    prisma.roadmapPerson.findFirst.mockResolvedValue({
      id: 'p2',
      externalId: 'olga',
      name: 'Ольга',
      email: 'olga@example.test',
    });

    await service.reconcile('project', [
      azureTask({
        [ORIGINAL]: 8,
        'System.AssignedTo': { uniqueName: 'olga@example.test' },
      }),
    ]);

    expect(updates[0]).toMatchObject({ azureSyncStatus: 'conflict' });
    expect(String(updates[0].azureSyncError)).toContain(
      'не входит в роль «Backend»',
    );
  });

  it('leaves an unsent Roadmap edit alone under the overwrite policy', async () => {
    const { service, updates } = allocationService(
      allocationRow({ estimatedHours: 16, azureSyncStatus: 'pending' }),
    );

    await service.reconcile('project', [
      azureTask({
        [ORIGINAL]: 12,
        'System.AssignedTo': { uniqueName: 'ivan@example.test' },
      }),
    ]);

    expect(updates).toEqual([]);
  });
});

describe('logging time from Roadmap', () => {
  const assignee = { id: 'ivan-user', email: 'Ivan@example.test' };

  it('adds hours to Completed Work, takes them off Remaining Work and signs the entry', async () => {
    const { service, body, importer } = allocationService();

    const result = await service.logTime(
      assignee,
      'allocation',
      3,
      'ревью',
      false,
    );

    expect(body()).toEqual([
      { op: 'test', path: '/rev', value: 3 },
      { op: 'add', path: `/fields/${COMPLETED}`, value: 5 },
      { op: 'add', path: `/fields/${REMAINING}`, value: 3 },
      {
        op: 'add',
        path: '/fields/System.History',
        value: '<div><i>Списано 3 ч в Roadmap: Мария Петрова — ревью</i></div>',
      },
    ]);
    expect(importer.importWorkItems).toHaveBeenCalledWith(
      { id: 'project' },
      [42],
      expect.anything(),
    );
    expect(result).toEqual({ actualHours: 5 });
  });

  it('retries on top of a concurrent entry instead of overwriting it', async () => {
    const { service, request, body } = allocationService();
    request.mockRejectedValueOnce(new AzureDevOpsHttpError(412, 'rev'));

    await service.logTime(assignee, 'allocation', 1, undefined, false);

    expect(request).toHaveBeenCalledTimes(2);
    expect(body(1)[1]).toEqual({
      op: 'add',
      path: `/fields/${COMPLETED}`,
      value: 3,
    });
  });

  it('does not let a reader log time for someone else', async () => {
    const { service, request } = allocationService();

    await expect(
      service.logTime(
        { id: 'other', email: 'other@example.test' },
        'allocation',
        1,
        undefined,
        false,
      ),
    ).rejects.toThrow('исполнитель или планировщик');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('removing an allocation', () => {
  it('sends the Task to the Azure recycle bin under the delete policy', async () => {
    const { service, request, prisma } = allocationService(allocationRow(), {
      removalPolicy: { action: 'delete' },
    });

    const result = await service.deleteAllocation(
      { id: 'u', email: 'u@example.test' },
      'allocation',
    );

    const [url, init] = request.mock.calls[0] as [string, { method: string }];
    expect(url).toContain('/azure-project/_apis/wit/workitems/42');
    expect(url).not.toContain('destroy');
    expect(init.method).toBe('DELETE');
    expect(prisma.roadmapAllocation.delete).toHaveBeenCalled();
    expect(result).toEqual({
      deleted: true,
      task: 'deleted',
      workItemId: 'feature',
      roleId: 'role',
    });
  });

  it('keeps the Task by default', async () => {
    const { service, request } = allocationService();

    const result = await service.deleteAllocation(
      { id: 'u', email: 'u@example.test' },
      'allocation',
    );

    expect(request).not.toHaveBeenCalled();
    expect(result.task).toBe('kept');
  });
});

function syncSetup(
  rowOverrides: Record<string, unknown>,
  settings: Record<string, unknown>,
) {
  const row: Record<string, unknown> = {
    id: 'allocation',
    workItemId: 'feature',
    azureSyncStatus: 'pending',
    azureSyncClaimId: null,
    azureCreateAttemptId: null,
    azureTaskId: '42',
    azurePushedHours: 8,
    personExternalId: 'person',
    personEmail: 'person@example.test',
    personName: 'Person',
    quarterKey: '2026-Q4',
    estimatedHours: 8,
    workItem: {
      type: 'Feature',
      title: 'Feature',
      externalId: '101',
      projectId: 'project',
      project: { id: 'project', externalId: 'azure-project' },
    },
    role: { name: 'Backend' },
    ...rowOverrides,
  };
  const prisma = {
    roadmapAzureProjectState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roadmapAllocation: {
      findUnique: jest.fn().mockImplementation(() => ({ ...row })),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (Object.entries(where).some(([key, value]) => row[key] !== value))
            return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
    },
    roadmapPerson: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const requestJson = jest.fn().mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('/fields?')
        ? {
            value: [ORIGINAL, REMAINING].map((referenceName) => ({
              referenceName,
            })),
          }
        : {
            id: 42,
            rev: 3,
            fields: {
              'System.WorkItemType': 'Task',
              'System.AssignedTo': { uniqueName: 'person@example.test' },
              [ORIGINAL]: 12,
            },
          },
    ),
  );
  const request = jest.fn().mockResolvedValue(undefined);
  const applyRemoval = jest.fn().mockResolvedValue('deleted');
  const service = createAzureSyncServices(
    prisma as unknown as PrismaService,
    {
      getWriteBackSettings: jest.fn().mockResolvedValue({
        ...normalizeWriteBackSettings({ mode: 'auto' }),
        ...settings,
      }),
      getCredentials: jest
        .fn()
        .mockResolvedValue({ organizationUrl: 'https://dev.azure.com/org' }),
      requestJson,
      request,
    } as unknown as RoadmapIntegrationService,
    {
      importWorkItems: jest.fn().mockResolvedValue([]),
    } as unknown as RoadmapWorkItemImportService,
    {} as IsActiveAdminHandler,
    { applyRemoval } as unknown as RoadmapAllocationAzureService,
  ).sync;
  return {
    row,
    request,
    applyRemoval,
    run: () => service['syncAllocation']('allocation', true),
  };
}

describe('pushing an allocation', () => {
  it('stops instead of overwriting an estimate changed on both sides under the stop policy', async () => {
    const { row, request, run } = syncSetup(
      { estimatedHours: 16 },
      { conflictPolicy: 'stop' },
    );

    await run();

    expect(request).not.toHaveBeenCalled();
    expect(row).toMatchObject({
      azureSyncStatus: 'conflict',
      azureSyncClaimId: null,
    });
  });

  it('applies the removal policy when the hours drop to zero', async () => {
    const { row, request, applyRemoval, run } = syncSetup(
      { estimatedHours: 0 },
      { removalPolicy: { action: 'delete' } },
    );

    await run();

    expect(applyRemoval).toHaveBeenCalledWith(
      'azure-project',
      '42',
      { action: 'delete' },
      expect.anything(),
    );
    expect(request).not.toHaveBeenCalled();
    expect(row).toMatchObject({
      azureSyncStatus: 'skipped',
      azureTaskId: null,
    });
  });

  it('does not create a Task for an allocation with no hours', async () => {
    const { row, request, run } = syncSetup(
      { estimatedHours: 0, azureTaskId: null },
      {},
    );

    await run();

    expect(request).not.toHaveBeenCalled();
    expect(row.azureSyncStatus).toBe('skipped');
  });
});
