import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { normalizeWriteBackSettings } from './roadmap-write-back.settings';

const ORIGINAL = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
const REMAINING = 'Microsoft.VSTS.Scheduling.RemainingWork';

type Operation = { op: string; path: string; value: unknown };

function setup(pushedHours: number) {
  const row: Record<string, unknown> = {
    id: 'allocation',
    azureSyncStatus: 'pending',
    azureSyncClaimId: null,
    azureCreateAttemptId: null,
    azureTaskId: '42',
    azurePushedHours: pushedHours,
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
  };
  const requestJson = jest
    .fn()
    .mockImplementation((url: string) => Promise.resolve(azureResponse(url)));
  function azureResponse(url: string) {
    if (url.includes('/fields?'))
      return {
        value: ['System.AssignedTo', ORIGINAL, REMAINING].map(
          (referenceName) => ({ referenceName }),
        ),
      };
    return {
      id: 42,
      rev: 3,
      fields: {
        'System.WorkItemType': 'Task',
        'System.AssignedTo': { uniqueName: 'Person@example.test' },
        'Microsoft.VSTS.Scheduling.CompletedWork': 3,
      },
    };
  }
  const request = jest.fn().mockResolvedValue(undefined);
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
            Object.assign(row, data);
            return { count: 1 };
          },
        ),
    },
    roadmapPerson: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const integration = {
    // Default v2 settings carry "always" write rules for assignee and estimates.
    getWriteBackSettings: jest
      .fn()
      .mockResolvedValue(normalizeWriteBackSettings({ mode: 'auto' })),
    getCredentials: jest
      .fn()
      .mockResolvedValue({ organizationUrl: 'https://dev.azure.com/example' }),
    requestJson,
    request,
  };
  const service = new RoadmapAzureSyncService(
    prisma as unknown as PrismaService,
    integration as unknown as RoadmapIntegrationService,
    {
      importWorkItems: jest.fn().mockResolvedValue([]),
    } as unknown as RoadmapWorkItemImportService,
    {} as IsActiveAdminHandler,
    {} as RoadmapAllocationAzureService,
  );
  const patches = () =>
    request.mock.calls.map(
      ([, init]: [string, { body: string }]) =>
        JSON.parse(init.body) as Operation[],
    );
  return { row, service, patches };
}

describe('Azure write-back task updates', () => {
  it('does not patch the task when the plan matches what was pushed', async () => {
    const { row, service, patches } = setup(8);

    await service['syncAllocation']('allocation');

    expect(patches()).toHaveLength(0);
    expect(row.azureSyncError).toBeNull();
    expect(row.azureSyncStatus).toBe('synced');
  });

  it('writes only the estimates when the estimate changed', async () => {
    const { service, patches } = setup(5);

    await service['syncAllocation']('allocation');

    expect(patches()).toHaveLength(1);
    const fields = patches()[0]
      .filter((operation) => operation.path.startsWith('/fields/'))
      .map((operation) => [operation.path, operation.value]);
    expect(fields).toEqual([
      [`/fields/${ORIGINAL}`, 8],
      [`/fields/${REMAINING}`, 5],
    ]);
  });
});
