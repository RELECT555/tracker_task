import { BadRequestException } from '@nestjs/common';
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
      createMany: jest
        .fn<Promise<{ count: number }>, [{ data: Record<string, unknown>[] }]>()
        .mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Пётр Петров' }),
    },
    roadmapAllocation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { tx, service: new RoadmapPlanChangeService({} as never) };
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
    // Whole milliseconds, so the list cursor can compare it exactly.
    expect(data[0].createdAt).toBeInstanceOf(Date);
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

describe('RoadmapPlanChangeService.recordAfter', () => {
  it('reads the after-state and records created, updated and deleted against before', async () => {
    const { tx, service } = setup();
    tx.roadmapAllocation.findMany.mockResolvedValue([
      allocationRow({
        estimatedHours: 24,
        periods: [{ monthKey: '2026-10', hours: 24 }],
      }),
      { ...allocationRow({ estimatedHours: 4, periods: [] }), id: 'fresh' },
    ]);
    const before = new Map([
      [
        'allocation',
        {
          ref: { ...ref, azureTaskId: '77' },
          snapshot: { ...snapshot, personEmail: null },
        },
      ],
      ['gone', { ref: { ...ref, allocationId: 'gone' }, snapshot }],
    ]);

    const written = await service.recordAfter(
      tx as never,
      context,
      before,
      ['allocation', 'fresh', 'gone'],
      { roleHours: { from: 16, to: 24 } },
    );

    expect(tx.roadmapAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['allocation', 'fresh', 'gone'] } },
      }),
    );
    // The mocked createMany reports count 1; what matters is the rows it was given.
    expect(written).toBe(1);
    const { data } = tx.roadmapPlanChange.createMany.mock.calls[0][0];
    expect(data.map((entry) => [entry.allocationId, entry.action])).toEqual([
      ['allocation', 'updated'],
      ['fresh', 'created'],
      ['gone', 'deleted'],
    ]);
    expect(data[0]).toMatchObject({
      before: { estimatedHours: 16 },
      after: {
        estimatedHours: 24,
        months: [{ monthKey: '2026-10', hours: 24 }],
      },
      details: { roleHours: { from: 16, to: 24 } },
    });
    expect(data[2]).toMatchObject({ before: snapshot, after: Prisma.DbNull });
  });

  it('writes nothing when the after-state equals before', async () => {
    const { tx, service } = setup();
    const row = allocationRow({
      estimatedHours: 8,
      periods: [{ monthKey: '2026-10', hours: 8 }],
    });
    tx.roadmapAllocation.findMany.mockResolvedValue([row]);
    const before = await service.read(tx as never, ['allocation']);

    expect(
      await service.recordAfter(tx as never, context, before, ['allocation']),
    ).toBe(0);
    expect(tx.roadmapPlanChange.createMany).not.toHaveBeenCalled();
  });
});

type Row = ReturnType<typeof changeRow>;
type Where = Record<string, unknown>;

/** A well-formed row id, ordered like its letter. */
const uid = (letter: string) => `00000000-0000-4000-8000-${letter.repeat(12)}`;

function changeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a',
    projectId: 'project',
    batchId: 'batch',
    action: 'updated',
    source: 'plan',
    actorUserId: 'user',
    actorEmail: 'user@example.com',
    actorName: 'Пётр Петров',
    azureTaskId: null as string | null,
    allocationId: 'allocation',
    workItemId: 'work-item',
    workItemExternalId: '1001',
    workItemTitle: 'Feature title',
    roleId: 'role',
    roleName: 'Backend',
    quarterKey: '2026-Q4',
    before: snapshot as unknown,
    after: { ...snapshot, estimatedHours: 24 } as unknown,
    details: {} as unknown,
    createdAt: new Date('2026-11-16T10:00:00.000Z'),
    ...overrides,
  };
}

/** Evaluates the subset of Prisma `where` that `list` builds, over in-memory rows. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND')
      return (condition as Where[]).every((part) => matches(row, part));
    if (key === 'OR')
      return (condition as Where[]).some((part) => matches(row, part));
    const value = (row as Where)[key];
    if (condition instanceof Date)
      return (value as Date).getTime() === condition.getTime();
    if (condition === null || typeof condition !== 'object')
      return value === condition;
    const filter = condition as Record<string, unknown>;
    if ('path' in filter) {
      const json = value as Record<string, unknown> | null;
      return json?.[(filter.path as string[])[0]] === filter.equals;
    }
    const order = (input: unknown) =>
      input instanceof Date ? input.getTime() : String(input);
    const current = order(value);
    return (
      (!('gte' in filter) || current >= order(filter.gte)) &&
      (!('gt' in filter) || current > order(filter.gt)) &&
      (!('lte' in filter) || current <= order(filter.lte)) &&
      (!('lt' in filter) || current < order(filter.lt))
    );
  });
}

function listSetup(rows: Row[]) {
  const findMany = jest.fn(
    ({ where, take }: { where: Where; take: number }): Promise<Row[]> =>
      Promise.resolve(
        rows
          .filter((row) => matches(row, where))
          .sort(
            (a, b) =>
              b.createdAt.getTime() - a.createdAt.getTime() ||
              (a.id < b.id ? 1 : -1),
          )
          .slice(0, take),
      ),
  );
  const prisma = { roadmapPlanChange: { findMany } };
  return { findMany, service: new RoadmapPlanChangeService(prisma as never) };
}

describe('RoadmapPlanChangeService.list', () => {
  it('returns entries of a deleted allocation with their snapshots', async () => {
    const { service } = listSetup([
      changeRow({
        id: 'removed',
        action: 'deleted',
        before: snapshot,
        after: null,
        azureTaskId: '77',
        details: { task: { state: 'deleted' } },
      }),
    ]);

    const page = await service.list('project', {});

    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: 'removed',
        batchId: 'batch',
        action: 'deleted',
        source: 'plan',
        actorUserId: 'user',
        actorName: 'Пётр Петров',
        actorEmail: 'user@example.com',
        allocationId: 'allocation',
        workItemId: 'work-item',
        workItemExternalId: '1001',
        workItemTitle: 'Feature title',
        roleId: 'role',
        roleName: 'Backend',
        quarterKey: '2026-Q4',
        azureTaskId: '77',
        before: snapshot,
        after: null,
        details: { task: { state: 'deleted' } },
        createdAt: '2026-11-16T10:00:00.000Z',
      },
    ]);
  });

  it('only lists the requested project and work item', async () => {
    const { service } = listSetup([
      changeRow({ id: 'mine' }),
      changeRow({ id: 'other-project', projectId: 'another' }),
      changeRow({ id: 'other-item', workItemExternalId: '2002' }),
    ]);

    const page = await service.list('project', { workItemExternalId: '1001' });

    expect(page.items.map((item) => item.id)).toEqual(['mine']);
  });

  it('filters by person in before and after', async () => {
    const other = { ...snapshot, personExternalId: 'someone-else' };
    const { service } = listSetup([
      changeRow({ id: 'as-before', before: snapshot, after: other }),
      changeRow({ id: 'as-after', before: other, after: snapshot }),
      changeRow({ id: 'created', before: null, after: snapshot }),
      changeRow({ id: 'deleted', before: snapshot, after: null }),
      changeRow({ id: 'unrelated', before: other, after: other }),
    ]);

    const page = await service.list('project', { personExternalId: 'person' });

    expect(page.items.map((item) => item.id).sort()).toEqual([
      'as-after',
      'as-before',
      'created',
      'deleted',
    ]);
  });

  it('filters by period, taking the whole last day', async () => {
    const { service } = listSetup([
      changeRow({ id: 'before', createdAt: new Date('2026-11-09T23:59:59Z') }),
      changeRow({ id: 'first', createdAt: new Date('2026-11-10T00:00:00Z') }),
      changeRow({ id: 'last', createdAt: new Date('2026-11-12T23:59:59Z') }),
      changeRow({ id: 'after', createdAt: new Date('2026-11-13T00:00:00Z') }),
    ]);

    const page = await service.list('project', {
      from: '2026-11-10',
      to: '2026-11-12',
    });

    expect(page.items.map((item) => item.id)).toEqual(['last', 'first']);
  });

  it('paginates: limit 2 of 3 gives a cursor and the second page the rest', async () => {
    const { service } = listSetup([
      changeRow({
        id: uid('c'),
        createdAt: new Date('2026-11-16T10:00:00.000Z'),
      }),
      changeRow({
        id: uid('b'),
        createdAt: new Date('2026-11-16T09:30:00.000Z'),
      }),
      changeRow({
        id: uid('a'),
        createdAt: new Date('2026-11-16T09:00:00.000Z'),
      }),
    ]);

    const first = await service.list('project', { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual([uid('c'), uid('b')]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.list('project', {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.id)).toEqual([uid('a')]);
    expect(second.nextCursor).toBeNull();
  });

  it('does not repeat or skip rows that share createdAt across a page boundary', async () => {
    const same = new Date('2026-11-16T10:00:00.000Z');
    const ids = ['e', 'd', 'c', 'b', 'a'].map(uid);
    const { service } = listSetup(
      ids.map((id) => changeRow({ id, createdAt: same })),
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list('project', { limit: 2, cursor });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toEqual(ids);
  });

  it('clamps limit 500 to 200 and defaults to 50', async () => {
    const { service, findMany } = listSetup([]);

    await service.list('project', { limit: 500 });
    await service.list('project', {});

    // One extra row is requested to learn whether another page exists.
    expect(findMany.mock.calls[0][0].take).toBe(201);
    expect(findMany.mock.calls[1][0].take).toBe(51);
  });

  it('rejects a malformed cursor', async () => {
    const { service } = listSetup([]);

    await expect(
      service.list('project', { cursor: 'not-a-cursor' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a cursor whose time is not a strict ISO instant', async () => {
    const { service } = listSetup([]);
    const cursorOf = (time: string) =>
      Buffer.from(`${time}|${uid('a')}`, 'utf8').toString('base64url');

    for (const time of ['2026-11-16', '1763287200000', 'Mon Nov 16 2026']) {
      await expect(
        service.list('project', { cursor: cursorOf(time) }),
      ).rejects.toThrow(BadRequestException);
    }
    await expect(
      service.list('project', { cursor: cursorOf('2026-11-16T10:00:00.000Z') }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });
});
