import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapProjectAccessService } from './roadmap-project-access.service';
import type { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import type { RoadmapWorkItemCardService } from './roadmap-work-item-card.service';
import type { RoadmapWorkItemCreateService } from './roadmap-work-item-create.service';
import type { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import { RoadmapController } from './roadmap.controller';
import type { RoadmapService } from './roadmap.service';

describe('Local Roadmap projects', () => {
  it.each([
    {
      isAdmin: false,
      where: { access: { some: { email: 'reader@example.test' } } },
    },
    { isAdmin: true, where: {} },
  ])(
    'uses the local read policy for an actor with admin=$isAdmin',
    async ({ isAdmin, where }) => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'local-id',
          externalId: 'external-id',
          name: 'Project',
          url: null,
          syncedAt: new Date('2026-11-01T00:00:00Z'),
        },
      ]);
      const access = new RoadmapProjectAccessService({
        roadmapProject: { findMany },
      } as unknown as PrismaService);
      const listAzureProjects = jest.fn();
      const controller = new RoadmapController(
        { listAzureProjects } as unknown as RoadmapService,
        {} as RoadmapAzureSyncService,
        {} as RoadmapWorkItemCreateService,
        access,
        {} as RoadmapWorkItemCardService,
        {} as RoadmapAllocationAzureService,
        {} as RoadmapPlanChangeService,
      );

      await expect(
        controller.localProjects({
          id: 'user-id',
          email: ' Reader@example.test ',
          isAdmin,
        }),
      ).resolves.toMatchObject({
        source: 'local',
        data: [
          {
            id: 'external-id',
            roadmapId: 'local-id',
            imported: true,
            planSynced: true,
          },
        ],
      });
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(listAzureProjects).not.toHaveBeenCalled();
    },
  );
});
