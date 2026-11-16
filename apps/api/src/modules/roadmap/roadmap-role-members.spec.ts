import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapService } from './roadmap.service';

function setup() {
  const people = ['a', 'b', 'c'].map((id) => ({
    id,
    externalId: id,
    isActive: true,
    roleMemberships: [{ id: `member-${id}` }],
  }));
  const tx = {
    roadmapRole: {
      findUnique: jest.fn().mockResolvedValue({
        projectId: 'project',
        defaultPersonExternalId: 'a',
      }),
      update: jest.fn().mockResolvedValue({ id: 'role' }),
    },
    roadmapRoleMember: {
      findMany: jest.fn().mockResolvedValue([{ person: { externalId: 'a' } }]),
    },
    roadmapPerson: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { externalId: { in: string[] } } }) =>
            people.filter((person) =>
              where.externalId.in.includes(person.externalId),
            ),
        ),
    },
  };
  const service = new RoadmapService(
    {
      $transaction: (
        run: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => run(tx as unknown as Prisma.TransactionClient),
    } as unknown as PrismaService,
    {} as RoadmapIntegrationService,
    {} as RoadmapWorkItemImportService,
    {} as RoadmapAzureSyncService,
    {} as RoadmapAzureCatalogService,
    {} as RoadmapPlanChangeService,
  );
  return { service, tx, people };
}

describe('Role participation', () => {
  it('persists custom percentages for existing members and clears the legacy default', async () => {
    const { service, tx } = setup();
    await service.updateRole('role', {
      memberAllocations: [
        { personExternalId: 'a', allocationPercent: 25.5 },
        { personExternalId: 'b', allocationPercent: 74.5 },
      ],
    });
    expect(tx.roadmapRole.update).toHaveBeenCalledWith({
      where: { id: 'role' },
      data: expect.objectContaining({
        defaultPersonExternalId: null,
        members: {
          deleteMany: {},
          createMany: {
            data: [
              { personId: 'a', allocationPercent: 25.5 },
              { personId: 'b', allocationPercent: 74.5 },
            ],
          },
        },
      }),
    });
  });

  it.each([
    [40, 40],
    [50.001, 49.999],
    [Number.NaN, 100],
    [101, -1],
  ])('rejects invalid percentages %s / %s without writing', async (a, b) => {
    const { service, tx } = setup();
    await expect(
      service.updateRole('role', {
        memberAllocations: [
          { personExternalId: 'a', allocationPercent: a },
          { personExternalId: 'b', allocationPercent: b },
        ],
      }),
    ).rejects.toThrow();
    expect(tx.roadmapRole.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate and missing employees before replacing membership', async () => {
    const { service, tx } = setup();
    for (const ids of [
      ['a', 'a'],
      ['a', 'missing'],
    ]) {
      await expect(
        service.updateRole('role', {
          memberAllocations: ids.map((personExternalId) => ({
            personExternalId,
            allocationPercent: 50,
          })),
        }),
      ).rejects.toThrow();
    }
    expect(tx.roadmapRole.update).not.toHaveBeenCalled();
  });

  it('keeps an existing inactive member but rejects adding a new inactive employee', async () => {
    const { service, tx, people } = setup();
    people[0].isActive = false;
    await service.updateRole('role', {
      memberAllocations: [{ personExternalId: 'a', allocationPercent: 100 }],
    });
    expect(tx.roadmapRole.update).toHaveBeenCalledTimes(1);
    people[1].isActive = false;
    people[1].roleMemberships = [];
    await expect(
      service.updateRole('role', {
        memberAllocations: [{ personExternalId: 'b', allocationPercent: 100 }],
      }),
    ).rejects.toThrow();
    expect(tx.roadmapRole.update).toHaveBeenCalledTimes(1);
  });

  it('allows clearing all members', async () => {
    const { service, tx } = setup();
    await service.updateRole('role', { memberAllocations: [] });
    expect(tx.roadmapRole.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          defaultPersonExternalId: null,
          members: { deleteMany: {}, createMany: undefined },
        }),
      }),
    );
  });

  it('balances legacy membership changes in hundredths to exactly 100%', async () => {
    const { service, tx } = setup();
    await service.updateRole('role', { personExternalIds: ['a', 'b', 'c'] });
    expect(
      tx.roadmapRole.update.mock.calls[0][0].data.members.createMany.data,
    ).toEqual([
      { personId: 'a', allocationPercent: 33.34 },
      { personId: 'b', allocationPercent: 33.33 },
      { personId: 'c', allocationPercent: 33.33 },
    ]);
  });

  it('preserves current members when the legacy default-person field adds one employee', async () => {
    const { service, tx } = setup();
    await service.updateRole('role', { personExternalId: 'b' });
    expect(
      tx.roadmapRole.update.mock.calls[0][0].data.members.createMany.data,
    ).toEqual([
      { personId: 'a', allocationPercent: 50 },
      { personId: 'b', allocationPercent: 50 },
    ]);
  });
});
