import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapService } from './roadmap.service';

function setup(deleted: number) {
  const deleteMany = jest.fn().mockResolvedValue({ count: deleted });
  const service = new RoadmapService(
    { roadmapRole: { deleteMany } } as unknown as PrismaService,
    {} as RoadmapIntegrationService,
    {} as RoadmapWorkItemImportService,
    {} as RoadmapAzureSyncService,
    {} as RoadmapAzureCatalogService,
    {} as RoadmapPlanChangeService,
  );
  return { service, deleteMany };
}

describe('Role catalog deletion', () => {
  it('deletes only catalog roles, never roles assigned to a project', async () => {
    const { service, deleteMany } = setup(1);
    await expect(service.deleteRoleTemplate('template')).resolves.toEqual({
      deleted: true,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'template', projectId: null },
    });
  });

  it('reports a missing catalog role', async () => {
    const { service } = setup(0);
    await expect(service.deleteRoleTemplate('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
