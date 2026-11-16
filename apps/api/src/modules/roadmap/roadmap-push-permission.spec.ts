import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import { createAzureSyncServices } from './roadmap-azure-sync.testing';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import {
  DEFAULT_WRITE_BACK_SETTINGS,
  type WriteBackSettings,
} from './roadmap-write-back.settings';

function setup(
  pushPermission: WriteBackSettings['pushPermission'],
  admin: boolean,
) {
  const settings = {
    ...DEFAULT_WRITE_BACK_SETTINGS,
    mode: 'manual',
    pushPermission,
  } satisfies WriteBackSettings;
  const execute = jest.fn().mockResolvedValue(admin);
  const allocations = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
  };
  const { sync: service, status } = createAzureSyncServices(
    { roadmapAllocation: allocations } as unknown as PrismaService,
    {
      getWriteBackSettings: () => Promise.resolve(settings),
    } as RoadmapIntegrationService,
    {} as RoadmapWorkItemImportService,
    { execute } as unknown as IsActiveAdminHandler,
    {} as RoadmapAllocationAzureService,
  );
  return { service, status, execute, allocations };
}

describe('Manual Azure write-back permission', () => {
  it('rejects push, preview and retry before reading any allocations', async () => {
    const { service, status, allocations } = setup('admins', false);

    await expect(
      service.pushProject('planner', 'project'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      status.previewProject('planner', 'project'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.pushAllocation('planner', 'allocation'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(allocations.findMany).not.toHaveBeenCalled();
    expect(allocations.findUnique).not.toHaveBeenCalled();
  });

  it('allows an active administrator when restricted', async () => {
    const { service, execute } = setup('admins', true);

    await expect(service.pushProject('admin', 'project')).resolves.toEqual({
      queued: 0,
    });
    expect(execute).toHaveBeenCalledWith('admin');
  });

  it('preserves the planner path for old settings', async () => {
    const { service, execute } = setup(undefined, false);

    await expect(service.pushProject('planner', 'project')).resolves.toEqual({
      queued: 0,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
