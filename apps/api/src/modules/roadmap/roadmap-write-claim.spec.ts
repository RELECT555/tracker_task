import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { planChangeContext } from './roadmap-plan-change';
import type { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { DEFAULT_WRITE_BACK_SETTINGS } from './roadmap-write-back.settings';

function setup(type = 'Feature') {
  const row: Record<string, unknown> = {
    id: 'allocation',
    azureSyncStatus: 'pending',
    azureSyncClaimId: null,
    azureCreateAttemptId: null,
    azureTaskId: null,
    azurePushedHours: null,
    workItemId: 'feature-id',
    roleId: 'role',
    personExternalId: 'person',
    personEmail: 'person@example.test',
    personName: 'Person',
    quarterKey: '2026-Q4',
    estimatedHours: 2,
    workItem: {
      type,
      title: 'Feature',
      externalId: '101',
      project: { id: 'project', externalId: 'azure-project' },
    },
    role: { name: 'Backend' },
  };
  const requestJson = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/fields?')) return { value: [] };
    if (url.includes('/wiql?')) return { workItems: [{ id: 42 }] };
    return { id: 42, rev: 1, fields: { 'System.WorkItemType': 'Task' } };
  });
  const allocationUpdates: Record<string, unknown>[] = [];
  const importer = { importWorkItems: jest.fn().mockResolvedValue([]) };
  const self: { client?: unknown } = {};
  const prisma = {
    roadmapAzureProjectState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roadmapAllocation: {
      findUnique: jest.fn().mockImplementation(() => ({ ...row })),
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => {
            if (
              Object.entries(where).some(([key, value]) => row[key] !== value)
            )
              return { count: 0 };
            allocationUpdates.push(data);
            Object.assign(row, data);
            return { count: 1 };
          },
        ),
    },
    roadmapPeriodAllocation: { update: jest.fn() },
    $transaction: (callback: (client: unknown) => unknown) =>
      callback(self.client),
    roadmapPerson: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    roadmapRole: {
      findFirst: jest.fn().mockResolvedValue({
        name: 'Backend',
        azureEstimateField: 'Custom.BackendHours',
      }),
      findUnique: jest.fn().mockResolvedValue({
        name: 'Backend',
        azureEstimateField: 'Custom.BackendHours',
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'role',
          name: 'Backend',
          azureEstimateField: 'Custom.BackendHours',
        },
      ]),
    },
    roadmapWorkItem: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        externalId: '101',
        projectId: 'project',
        allocations: [
          { roleId: 'role', estimatedHours: 2, personExternalId: 'person' },
          { roleId: 'role', estimatedHours: 3, personExternalId: 'other' },
        ],
      }),
    },
  };
  self.client = prisma;
  const integration = {
    getWriteBackSettings: jest.fn().mockResolvedValue({
      ...DEFAULT_WRITE_BACK_SETTINGS,
      mode: 'auto',
      fields: {
        ...DEFAULT_WRITE_BACK_SETTINGS.fields,
        areaPath: false,
        iteration: false,
        assignedTo: false,
      },
    }),
    getCredentials: jest
      .fn()
      .mockResolvedValue({ organizationUrl: 'https://dev.azure.com/example' }),
    requestJson,
    request: jest.fn().mockResolvedValue({}),
  };
  // The log itself is covered in roadmap-plan-change-paths.spec.ts.
  const planChanges = {
    read: jest.fn().mockResolvedValue(new Map()),
    record: jest.fn().mockResolvedValue(0),
    recordAfter: jest.fn().mockResolvedValue(0),
  };
  const worker = (createTask = true) => {
    const service = new RoadmapAzureSyncService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      importer as unknown as RoadmapWorkItemImportService,
      {} as IsActiveAdminHandler,
      {} as RoadmapAllocationAzureService,
      planChanges as unknown as RoadmapPlanChangeService,
    );
    return () => service['syncAllocation']('allocation', createTask);
  };
  const roleHours = () => {
    const service = new RoadmapAzureSyncService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      importer as unknown as RoadmapWorkItemImportService,
      {} as IsActiveAdminHandler,
      {} as RoadmapAllocationAzureService,
      planChanges as unknown as RoadmapPlanChangeService,
    );
    return (hours: number, quarterKey?: string) =>
      service.setRoleHours(
        'user',
        'feature-id',
        'role',
        hours,
        quarterKey,
        planChangeContext({ id: 'user', email: 'user@example.test' }, 'plan'),
      );
  };
  const refreshField = () => {
    const service = new RoadmapAzureSyncService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      importer as unknown as RoadmapWorkItemImportService,
      {} as IsActiveAdminHandler,
      {} as RoadmapAllocationAzureService,
      planChanges as unknown as RoadmapPlanChangeService,
    );
    return () => service.refreshFeatureField('feature-id', 'role');
  };
  const createPosts = () =>
    requestJson.mock.calls.filter(([url]: [string]) =>
      url.includes('/workitems/$'),
    );
  return {
    prisma,
    row,
    requestJson,
    request: integration.request,
    importer,
    worker,
    roleHours,
    refreshField,
    workItems: prisma.roadmapWorkItem,
    allocationUpdates,
    createPosts,
  };
}

describe('Azure write-back claims', () => {
  it('skips a queued legacy Epic allocation without writing to Azure', async () => {
    const { row, requestJson, worker } = setup('Epic');

    await worker()();

    expect(requestJson).not.toHaveBeenCalled();
    expect(row).toMatchObject({
      azureSyncStatus: 'skipped',
      azureSyncClaimId: null,
    });
  });

  it('writes the role total to the feature field without creating a Task', async () => {
    const { row, request, worker, createPosts } = setup();

    await worker(false)();

    expect(createPosts()).toHaveLength(0);
    expect(row).toMatchObject({
      azureTaskId: null,
      azureSyncStatus: 'synced',
      azureSyncClaimId: null,
    });
    const [url, init] = request.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toContain('/workitems/42');
    expect(JSON.parse(init.body)).toEqual(
      expect.arrayContaining([
        { op: 'add', path: '/fields/Custom.BackendHours', value: 5 },
      ]),
    );
  });

  it('writes hours typed into a role cell straight to the feature field', async () => {
    const { request, roleHours, workItems, importer } = setup();
    workItems.findUnique.mockResolvedValueOnce({
      externalId: '101',
      projectId: 'project',
      type: 'Feature',
      allocations: [],
    });

    await expect(roleHours()(10)).resolves.toEqual({
      field: 'Custom.BackendHours',
      hours: 10,
    });
    // The user does not wait for a full re-import: the written value is stored right away.
    expect(importer.importWorkItems).not.toHaveBeenCalled();
    expect(workItems.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { azureCustomFields: { 'Custom.BackendHours': 10 } },
      }),
    );

    const [, init] = request.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual(
      expect.arrayContaining([
        { op: 'add', path: '/fields/Custom.BackendHours', value: 10 },
      ]),
    );
  });

  it('drops the role field to 0 when its last allocation is deleted', async () => {
    const { request, refreshField, workItems } = setup();
    workItems.findUnique
      .mockResolvedValueOnce({ projectId: 'project' })
      .mockResolvedValueOnce({
        externalId: '101',
        projectId: 'project',
        allocations: [],
      });

    await refreshField()();

    const [, init] = request.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual(
      expect.arrayContaining([
        { op: 'add', path: '/fields/Custom.BackendHours', value: 0 },
      ]),
    );
  });

  it('re-splits the people of the role to the typed total and writes the field from them', async () => {
    const { row, request, roleHours, workItems, allocationUpdates } = setup();
    workItems.findUnique
      .mockResolvedValueOnce({
        externalId: '101',
        projectId: 'project',
        type: 'Feature',
        allocations: [
          {
            id: 'allocation',
            quarterKey: '2026-Q4',
            estimatedHours: 2,
            azureTaskId: null,
            azureCreateAttemptId: null,
            azureSyncClaimId: null,
            periods: [],
          },
          {
            id: 'allocation',
            quarterKey: '2027-Q1',
            estimatedHours: 3,
            azureTaskId: null,
            azureCreateAttemptId: null,
            azureSyncClaimId: null,
            periods: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        externalId: '101',
        projectId: 'project',
        allocations: [
          { roleId: 'role', estimatedHours: 10, personExternalId: 'person' },
          { roleId: 'role', estimatedHours: 3, personExternalId: 'person' },
        ],
      });

    await roleHours()(10, '2026-Q4');

    // 10 typed for the quarter; the field is the sum over quarters (10 + 3 of the next one).
    expect(allocationUpdates).toContainEqual(
      expect.objectContaining({
        estimatedHours: 10,
        azureSyncStatus: 'pending',
      }),
    );
    // The row is marked synced only after the field has been written.
    expect(row).toMatchObject({ azureSyncStatus: 'synced' });
    const [, init] = request.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual(
      expect.arrayContaining([
        { op: 'add', path: '/fields/Custom.BackendHours', value: 13 },
      ]),
    );
  });

  describe('role hours edge cases', () => {
    const roleWith = (people = 'person') => ({
      externalId: '101',
      projectId: 'project',
      type: 'Feature',
      allocations: [
        {
          id: 'allocation',
          quarterKey: '2026-Q4',
          personExternalId: people,
          estimatedHours: 2,
          azureTaskId: null,
          azureCreateAttemptId: null,
          azureSyncClaimId: null,
          periods: [],
        },
      ],
    });

    it('asks for the quarter when the role has assignments', async () => {
      const { roleHours, workItems, request } = setup();
      workItems.findUnique.mockResolvedValueOnce(roleWith());

      await expect(roleHours()(10)).rejects.toThrow('Не указан квартал');
      expect(request).not.toHaveBeenCalled();
    });

    it('marks the row failed, not synced, when Azure DevOps rejects the write', async () => {
      const { row, roleHours, workItems, requestJson } = setup();
      workItems.findUnique
        .mockResolvedValueOnce(roleWith())
        .mockResolvedValueOnce({
          externalId: '101',
          projectId: 'project',
          allocations: [
            { roleId: 'role', estimatedHours: 10, personExternalId: 'person' },
          ],
        });
      requestJson.mockRejectedValueOnce(new Error('Azure 503'));

      await expect(roleHours()(10, '2026-Q4')).rejects.toThrow('Azure 503');
      expect(row).toMatchObject({
        estimatedHours: 10,
        azureSyncStatus: 'error',
        azureSyncError: expect.stringContaining('Azure 503') as unknown,
      });
    });

    it('refuses to edit the total of a role that has demo participants', async () => {
      const { roleHours, workItems, prisma, request, requestJson } = setup();
      workItems.findUnique.mockResolvedValueOnce(roleWith('demo'));
      prisma.roadmapPerson.findMany.mockResolvedValueOnce([
        { externalId: 'demo' },
      ]);

      await expect(roleHours()(10, '2026-Q4')).rejects.toThrow(
        'демо-участники',
      );
      expect(requestJson).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    });
  });

  it('lets one worker create the task and saves its link before importing', async () => {
    const { row, importer, worker, createPosts } = setup();
    importer.importWorkItems.mockImplementation(() => {
      expect(row.azureTaskId).toBe('42');
      return Promise.resolve([]);
    });

    await Promise.all([worker()(), worker()()]);

    expect(createPosts()).toHaveLength(1);
    expect(row).toMatchObject({
      azureTaskId: '42',
      azureSyncStatus: 'synced',
      azureSyncClaimId: null,
    });
  });

  it('reconciles a lost create response without repeating the POST', async () => {
    const { row, requestJson, worker, createPosts } = setup();
    requestJson
      .mockResolvedValueOnce({ value: [] })
      .mockRejectedValueOnce(new Error('response lost'));
    await worker()();
    expect(row.azureSyncStatus).toBe('error');
    expect(row.azureCreateAttemptId).toEqual(expect.any(String));

    row.azureSyncStatus = 'pending';
    await worker()();

    expect(createPosts()).toHaveLength(1);
    expect(row).toMatchObject({
      azureTaskId: '42',
      azureSyncStatus: 'synced',
      azureCreateAttemptId: null,
    });
  });
});
