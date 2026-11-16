import { Prisma } from '@prisma/client';
import {
  actionOf,
  planChangeContext,
  sameSnapshot,
  snapshotOf,
  type AllocationRef,
  type AllocationSnapshot,
  type PlanChangeInput,
} from './roadmap-plan-change';
import { RoadmapPlanChangeService } from './roadmap-plan-change.service';

const snapshot: AllocationSnapshot = {
  personExternalId: 'person',
  personName: 'Иванов И.',
  personEmail: 'ivanov@example.com',
  quarterKey: '2026-Q4',
  estimatedHours: 16,
  months: [
    { monthKey: '2026-10', hours: 8 },
    { monthKey: '2026-11', hours: 8 },
  ],
};

const ref: AllocationRef = {
  allocationId: 'allocation',
  projectId: 'project',
  workItemId: 'work-item',
  workItemExternalId: '1001',
  workItemTitle: 'Feature title',
  roleId: 'role',
  roleName: 'Backend',
  azureTaskId: null,
};

const context = {
  actor: { id: 'user', email: 'user@example.com' },
  source: 'plan' as const,
  batchId: 'batch',
};

type Hours = Prisma.Decimal.Value;

function allocationRow(input: {
  estimatedHours: Hours;
  periods: { monthKey: string | null; hours: Hours }[];
}) {
  return {
    id: 'allocation',
    personExternalId: 'person',
    personName: 'Иванов И.',
    personEmail: null,
    quarterKey: '2026-Q4',
    azureTaskId: '77',
    workItem: {
      id: 'work-item',
      externalId: '1001',
      title: 'Feature title',
      projectId: 'project',
    },
    role: { id: 'role', name: 'Backend' },
    estimatedHours: new Prisma.Decimal(input.estimatedHours),
    periods: input.periods.map((period) => ({
      monthKey: period.monthKey,
      hours: new Prisma.Decimal(period.hours),
    })),
  };
}

function setup() {
  const tx = {
    roadmapPlanChange: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Пётр Петров' }),
    },
    roadmapAllocation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { tx, service: new RoadmapPlanChangeService() };
}

describe('actionOf', () => {
  it('derives the action from the two snapshots', () => {
    expect(actionOf(null, snapshot)).toBe('created');
    expect(actionOf(snapshot, null)).toBe('deleted');
    expect(actionOf(snapshot, snapshot)).toBeNull();
    expect(actionOf(snapshot, { ...snapshot, estimatedHours: 24 })).toBe(
      'updated',
    );
    expect(actionOf(null, null)).toBeNull();
  });
});

describe('snapshotOf', () => {
  it('keeps only periods with a month, sorted ascending, with numeric hours', () => {
    const result = snapshotOf(
      allocationRow({
        estimatedHours: new Prisma.Decimal('16.00'),
        periods: [
          { monthKey: '2026-11', hours: new Prisma.Decimal('6.50') },
          { monthKey: null, hours: new Prisma.Decimal('99') },
          { monthKey: '2026-10', hours: new Prisma.Decimal('9.5') },
        ],
      }),
    );

    expect(result).toEqual({
      personExternalId: 'person',
      personName: 'Иванов И.',
      personEmail: null,
      quarterKey: '2026-Q4',
      estimatedHours: 16,
      months: [
        { monthKey: '2026-10', hours: 9.5 },
        { monthKey: '2026-11', hours: 6.5 },
      ],
    });
  });
});

describe('sameSnapshot', () => {
  it('ignores month order and the Decimal representation of hours', () => {
    const a = snapshotOf(
      allocationRow({
        estimatedHours: 8,
        periods: [
          { monthKey: '2026-10', hours: 3 },
          { monthKey: '2026-11', hours: 5 },
        ],
      }),
    );
    const b = snapshotOf(
      allocationRow({
        estimatedHours: '8.00',
        periods: [
          { monthKey: '2026-11', hours: new Prisma.Decimal('5.00') },
          { monthKey: '2026-10', hours: '3.00' },
        ],
      }),
    );

    expect(sameSnapshot(a, b)).toBe(true);
    expect(sameSnapshot({ ...a, months: [...a.months].reverse() }, b)).toBe(
      true,
    );
  });

  it('detects differences in hours, months and person', () => {
    expect(sameSnapshot(snapshot, { ...snapshot, estimatedHours: 17 })).toBe(
      false,
    );
    expect(sameSnapshot(snapshot, { ...snapshot, months: [] })).toBe(false);
    expect(sameSnapshot(snapshot, { ...snapshot, personExternalId: 'x' })).toBe(
      false,
    );
    expect(sameSnapshot(null, snapshot)).toBe(false);
    expect(sameSnapshot(null, null)).toBe(true);
  });
});

describe('planChangeContext', () => {
  it('generates a batch id unless one is given', () => {
    expect(planChangeContext(null, 'azure').batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(planChangeContext(null, 'azure', 'fixed').batchId).toBe('fixed');
  });
});

describe('RoadmapPlanChangeService.record', () => {
  it('skips unchanged entries and writes one row for the changed one', async () => {
    const { tx, service } = setup();
    const unchanged: PlanChangeInput = {
      ref: { ...ref, allocationId: 'other' },
      before: snapshot,
      after: snapshot,
    };
    const changed: PlanChangeInput = {
      ref,
      before: snapshot,
      after: { ...snapshot, estimatedHours: 24 },
      details: { roleHours: { from: 16, to: 24 } },
    };

    const written = await service.record(tx as never, context, [
      unchanged,
      changed,
    ]);

    expect(written).toBe(1);
    expect(tx.roadmapPlanChange.createMany).toHaveBeenCalledTimes(1);
    const { data } = tx.roadmapPlanChange.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      projectId: 'project',
      batchId: 'batch',
      action: 'updated',
      source: 'plan',
      actorUserId: 'user',
      actorEmail: 'user@example.com',
      actorName: 'Пётр Петров',
      azureTaskId: null,
      allocationId: 'allocation',
      workItemId: 'work-item',
      workItemExternalId: '1001',
      workItemTitle: 'Feature title',
      roleId: 'role',
      roleName: 'Backend',
      quarterKey: '2026-Q4',
      before: snapshot,
      after: { ...snapshot, estimatedHours: 24 },
      details: { roleHours: { from: 16, to: 24 } },
    });
  });

  it('stores created and deleted entries with a database null on the missing side', async () => {
    const { tx, service } = setup();

    await service.record(tx as never, context, [
      { ref, before: null, after: snapshot },
      { ref: { ...ref, allocationId: 'gone' }, before: snapshot, after: null },
    ]);

    const { data } = tx.roadmapPlanChange.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({
      action: 'created',
      before: Prisma.DbNull,
      after: snapshot,
      details: {},
    });
    expect(data[1]).toMatchObject({
      action: 'deleted',
      before: snapshot,
      after: Prisma.DbNull,
      quarterKey: '2026-Q4',
    });
  });

  it('reads the actor name from the user record', async () => {
    const { tx, service } = setup();

    await service.record(tx as never, context, [
      { ref, before: null, after: snapshot },
      { ref, before: snapshot, after: null },
    ]);

    expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user' },
      select: { fullName: true },
    });
  });

  it('keeps the actor email and a null name when the user no longer exists', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(null);

    await service.record(tx as never, context, [
      { ref, before: null, after: snapshot },
    ]);

    const { data } = tx.roadmapPlanChange.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({
      actorUserId: 'user',
      actorEmail: 'user@example.com',
      actorName: null,
    });
  });

  it('writes null actor fields without reading a user when there is no actor', async () => {
    const { tx, service } = setup();

    await service.record(
      tx as never,
      planChangeContext(null, 'azure', 'batch'),
      [{ ref, before: snapshot, after: { ...snapshot, estimatedHours: 1 } }],
    );

    expect(tx.user.findUnique).not.toHaveBeenCalled();
    const { data } = tx.roadmapPlanChange.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({
      source: 'azure',
      actorUserId: null,
      actorEmail: null,
      actorName: null,
    });
  });

  it('does not touch the database for an empty or fully unchanged list', async () => {
    const { tx, service } = setup();

    expect(await service.record(tx as never, context, [])).toBe(0);
    expect(
      await service.record(tx as never, context, [
        { ref, before: snapshot, after: snapshot },
      ]),
    ).toBe(0);

    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.roadmapPlanChange.createMany).not.toHaveBeenCalled();
  });
});

describe('RoadmapPlanChangeService.read', () => {
  it('returns the reference and snapshot per allocation id', async () => {
    const { tx, service } = setup();
    tx.roadmapAllocation.findMany.mockResolvedValue([
      allocationRow({
        estimatedHours: new Prisma.Decimal('8.00'),
        periods: [{ monthKey: '2026-10', hours: new Prisma.Decimal('8.00') }],
      }),
    ]);

    const result = await service.read(tx as never, ['allocation']);

    expect(tx.roadmapAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['allocation'] } } }),
    );
    expect(result.get('allocation')).toEqual({
      ref: {
        allocationId: 'allocation',
        projectId: 'project',
        workItemId: 'work-item',
        workItemExternalId: '1001',
        workItemTitle: 'Feature title',
        roleId: 'role',
        roleName: 'Backend',
        azureTaskId: '77',
      },
      snapshot: {
        personExternalId: 'person',
        personName: 'Иванов И.',
        personEmail: null,
        quarterKey: '2026-Q4',
        estimatedHours: 8,
        months: [{ monthKey: '2026-10', hours: 8 }],
      },
    });
  });

  it('does not query for an empty id list', async () => {
    const { tx, service } = setup();

    expect((await service.read(tx as never, [])).size).toBe(0);
    expect(tx.roadmapAllocation.findMany).not.toHaveBeenCalled();
  });
});
