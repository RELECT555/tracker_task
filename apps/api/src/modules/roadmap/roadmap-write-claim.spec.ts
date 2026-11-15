import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
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
  const importer = { importWorkItems: jest.fn().mockResolvedValue([]) };
  const prisma = {
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
            Object.assign(row, data);
            return { count: 1 };
          },
        ),
    },
    roadmapPerson: { findUnique: jest.fn().mockResolvedValue(null) },
  };
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
  };
  const worker = () => {
    const service = new RoadmapAzureSyncService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
      importer as unknown as RoadmapWorkItemImportService,
      {} as IsActiveAdminHandler,
      {} as RoadmapAllocationAzureService,
    );
    return () => service['syncAllocation']('allocation');
  };
  const createPosts = () =>
    requestJson.mock.calls.filter(([url]: [string]) =>
      url.includes('/workitems/$'),
    );
  return { row, requestJson, importer, worker, createPosts };
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
