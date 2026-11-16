import type { Prisma } from '@prisma/client';
import { rebalanceAllocations } from '@tracker/shared';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapAllocationService } from './roadmap-allocation.service';

const input = {
  workItemId: 'work-item',
  roleId: 'role',
  personExternalId: 'person',
  personName: 'Person',
  quarterKey: '2026-Q4',
  estimatedHours: 8,
  periods: [
    {
      monthKey: '2026-10',
      label: 'October',
      startsAt: '2026-10-01',
      endsAt: '2026-10-31',
      hours: 8,
    },
  ],
};

function setup() {
  const events: string[] = [];
  const tx = {
    roadmapWorkItem: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ projectId: 'project', type: 'Feature' }),
    },
    roadmapRoleMember: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ person: { name: 'Person', email: null } }),
    },
    roadmapAllocation: {
      upsert: jest.fn().mockImplementation(() => {
        events.push('save allocation');
        return { id: 'allocation' };
      }),
    },
    roadmapPeriodAllocation: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockImplementation(() => {
        events.push('save months');
        return { count: 1 };
      }),
    },
  };
  const transaction = jest.fn(
    async (run: (client: Prisma.TransactionClient) => Promise<unknown>) => {
      const result = await run(tx as unknown as Prisma.TransactionClient);
      events.push('commit');
      return result;
    },
  );
  const onAllocationSaved = jest.fn(() => {
    events.push('queue sync');
  });
  const service = new RoadmapAllocationService(
    { $transaction: transaction } as unknown as PrismaService,
    {
      pendingUpdate: { azureSyncStatus: 'pending' },
      onAllocationSaved,
    } as unknown as RoadmapAzureSyncService,
  );
  return { service, tx, transaction, onAllocationSaved, events };
}

describe('Allocation transaction', () => {
  it('rejects an Epic allocation before checking membership or queueing sync', async () => {
    const { service, tx, onAllocationSaved } = setup();
    tx.roadmapWorkItem.findUnique.mockResolvedValueOnce({
      projectId: 'project',
      type: 'EPIC',
    });

    await expect(service.saveAllocation(input)).rejects.toThrow(
      'На эпики нельзя назначать исполнителей.',
    );
    expect(tx.roadmapRoleMember.findFirst).not.toHaveBeenCalled();
    expect(onAllocationSaved).not.toHaveBeenCalled();
  });

  it('rejects changes to the monthly plan of an existing Epic allocation', async () => {
    const { service, tx } = setup();
    Object.assign(tx.roadmapAllocation, {
      findUnique: jest.fn().mockResolvedValue({
        id: 'allocation',
        estimatedHours: 8,
        periods: [],
        workItem: { type: 'Epic' },
      }),
    });
    const months = ['2026-10', '2026-11', '2026-12'].map((monthKey) => ({
      monthKey,
      hours: 1,
    }));

    await expect(
      service.saveAllocationQuarter('allocation', input.quarterKey, months),
    ).rejects.toThrow('На эпики нельзя назначать исполнителей.');
    expect(tx.roadmapPeriodAllocation.deleteMany).not.toHaveBeenCalled();
  });

  it('writes the allocation and months together, then queues Azure sync', async () => {
    const { service, tx, transaction, onAllocationSaved, events } = setup();

    await expect(service.saveAllocation(input)).resolves.toMatchObject({
      id: 'allocation',
      periods: input.periods,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.roadmapPeriodAllocation.deleteMany).toHaveBeenCalledWith({
      where: { allocationId: 'allocation' },
    });
    expect(onAllocationSaved).toHaveBeenCalledWith('allocation');
    expect(events).toEqual([
      'save allocation',
      'save months',
      'commit',
      'queue sync',
    ]);
  });

  it('rejects a monthly plan outside the allocation quarter', async () => {
    const { service, transaction } = setup();
    const august = {
      monthKey: '2026-08',
      label: 'August',
      startsAt: '2026-08-01',
      endsAt: '2026-08-31',
      hours: 8,
    };

    await expect(
      service.saveAllocation({ ...input, periods: [august] }),
    ).rejects.toThrow('A monthly plan must fall within the allocation quarter');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a legacy period that ends before it starts', async () => {
    const { service, transaction } = setup();
    const reversed = {
      label: 'Legacy',
      startsAt: '2026-12-31',
      endsAt: '2026-10-01',
      hours: 4,
    };

    await expect(
      service.saveAllocation({ ...input, periods: [reversed] }),
    ).rejects.toThrow('start before they end');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps accepting a valid legacy period without a month', async () => {
    const { service } = setup();
    const legacy = {
      label: 'Legacy',
      startsAt: '2026-10-01',
      endsAt: '2026-11-15',
      hours: 4,
    };

    await expect(
      service.saveAllocation({ ...input, periods: [legacy] }),
    ).resolves.toMatchObject({ id: 'allocation' });
  });

  it('does not commit or queue sync when writing the months fails', async () => {
    const { service, tx, onAllocationSaved, events } = setup();
    tx.roadmapPeriodAllocation.createMany.mockRejectedValueOnce(
      new Error('write failed'),
    );

    await expect(service.saveAllocation(input)).rejects.toThrow('write failed');

    expect(events).toEqual(['save allocation']);
    expect(onAllocationSaved).not.toHaveBeenCalled();
  });
});

describe('Even allocation', () => {
  const rows = [
    {
      id: 'first',
      estimatedHours: 1,
      periods: input.periods.map((period) => ({ ...period, hours: 1 })),
    },
    { id: 'second', estimatedHours: 0, periods: [] },
    { id: 'third', estimatedHours: 0, periods: [] },
  ];

  it('preserves a one-hour total and only writes half-hour monthly values', () => {
    expect(rebalanceAllocations(rows)).toEqual([
      {
        id: 'first',
        estimatedHours: 0.5,
        periods: [{ ...input.periods[0], hours: 0.5 }],
      },
      {
        id: 'second',
        estimatedHours: 0.5,
        periods: [{ ...input.periods[0], hours: 0.5 }],
      },
      { id: 'third', estimatedHours: 0, periods: [] },
    ]);
  });

  it('does not commit or queue any assignment if the group write fails', async () => {
    const { service, tx, onAllocationSaved, events, transaction } = setup();
    Object.assign(tx.roadmapAllocation, {
      findMany: jest.fn().mockResolvedValue(
        rows.map((row) => ({
          ...row,
          ...{ workItemId: 'work-item', roleId: 'role', quarterKey: '2026-Q4' },
          workItem: { type: 'Feature' },
          periods: row.periods.map((period) => ({
            ...period,
            startsAt: new Date(period.startsAt),
            endsAt: new Date(period.endsAt),
          })),
        })),
      ),
      count: jest.fn().mockResolvedValue(3),
      update: jest.fn().mockResolvedValue({}),
    });
    tx.roadmapPeriodAllocation.createMany.mockResolvedValueOnce({ count: 1 });
    tx.roadmapPeriodAllocation.createMany.mockRejectedValueOnce(
      new Error('second assignment failed'),
    );

    await expect(
      service.rebalanceAllocations(rows.map(({ id }) => id)),
    ).rejects.toThrow('second assignment failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(events).not.toContain('commit');
    expect(onAllocationSaved).not.toHaveBeenCalled();
  });
});
