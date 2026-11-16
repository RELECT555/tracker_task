import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import type { PlanInput } from '../agent/agent-plan';
import type { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { planChangeContext } from './roadmap-plan-change';
import { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { RoadmapProjectAccessService } from './roadmap-project-access.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { RoadmapService } from './roadmap.service';

type Period = {
  monthKey: string | null;
  label: string;
  startsAt: Date;
  endsAt: Date;
  hours: number;
};
type Row = {
  id: string;
  workItemId: string;
  roleId: string;
  personExternalId: string;
  personName: string;
  personEmail: string | null;
  quarterKey: string;
  estimatedHours: number;
  azureTaskId: string | null;
  periods: Period[];
};
type Key = {
  workItemId: string;
  roleId: string;
  personExternalId: string;
  quarterKey: string;
};

const workItem = {
  id: 'work-item',
  externalId: '101',
  title: 'Фича A',
  projectId: 'project',
  type: 'Feature',
};
const role = { id: 'role', name: 'Dev' };
const actor = { id: 'user-1', email: 'user@example.com' };

const october = (hours: number): Period => ({
  monthKey: '2026-10',
  label: 'October',
  startsAt: new Date('2026-10-01T00:00:00Z'),
  endsAt: new Date('2026-10-31T00:00:00Z'),
  hours,
});

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    workItemId: workItem.id,
    roleId: role.id,
    personExternalId: 'p1',
    personName: 'Анна',
    personEmail: null,
    quarterKey: '2026-Q4',
    estimatedHours: 8,
    azureTaskId: null,
    periods: [october(8)],
    ...overrides,
  };
}

const sameKey = (r: Row, key: Partial<Key>) =>
  (Object.keys(key) as (keyof Key)[]).every((field) => r[field] === key[field]);

/** An in-memory allocation table behind a mocked transaction client. */
function setup(initial: Row[] = []) {
  const rows = new Map(
    initial.map((r) => [
      r.id,
      { ...r, periods: r.periods.map((p) => ({ ...p })) },
    ]),
  );
  let nextId = 0;
  const view = (r: Row) => ({
    ...r,
    workItem,
    role,
    periods: r.periods.map((p) => ({ ...p })),
  });
  const apply = (r: Row, data: Record<string, unknown>) => {
    for (const field of [
      'personExternalId',
      'personName',
      'personEmail',
      'quarterKey',
      'estimatedHours',
    ] as const) {
      if (field in data) Object.assign(r, { [field]: data[field] });
    }
    r.estimatedHours = Number(r.estimatedHours);
  };

  const tx = {
    roadmapWorkItem: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ projectId: 'project', type: 'Feature' }),
    },
    roadmapRoleMember: {
      findFirst: jest.fn(
        ({ where }: { where: { person: { externalId: string } } }) =>
          Promise.resolve(
            where.person.externalId === 'gone'
              ? null
              : { person: { name: 'Анна', email: null } },
          ),
      ),
    },
    roadmapAllocation: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            id?: string;
            workItemId_roleId_personExternalId_quarterKey?: Key;
          };
        }) => {
          const key = where.workItemId_roleId_personExternalId_quarterKey;
          const found = where.id
            ? rows.get(where.id)
            : [...rows.values()].find((r) => key && sameKey(r, key));
          return Promise.resolve(found ? view(found) : null);
        },
      ),
      findFirst: jest.fn(
        ({ where }: { where: Key & { id: { not: string } } }) => {
          const { id, ...key } = where;
          const found = [...rows.values()].find(
            (r) => r.id !== id.not && sameKey(r, key),
          );
          return Promise.resolve(found ? view(found) : null);
        },
      ),
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          [...where.id.in]
            .sort()
            .flatMap((id) => (rows.has(id) ? [view(rows.get(id)!)] : [])),
        ),
      ),
      count: jest.fn(({ where }: { where: Partial<Key> }) =>
        Promise.resolve(
          [...rows.values()].filter((r) => sameKey(r, where)).length,
        ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const r = rows.get(where.id)!;
          apply(r, data);
          return Promise.resolve(view(r));
        },
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { workItemId_roleId_personExternalId_quarterKey: Key };
          create: Key & Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = where.workItemId_roleId_personExternalId_quarterKey;
          let r = [...rows.values()].find((candidate) =>
            sameKey(candidate, key),
          );
          if (r) apply(r, update);
          else {
            r = row(`new-${++nextId}`, { ...key, periods: [] });
            apply(r, create);
            rows.set(r.id, r);
          }
          return Promise.resolve(view(r));
        },
      ),
    },
    roadmapPeriodAllocation: {
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: { allocationId: string; monthKey?: { in: string[] } };
        }) => {
          const r = rows.get(where.allocationId);
          if (r)
            r.periods = r.periods.filter(
              (p) =>
                where.monthKey !== undefined &&
                !where.monthKey.in.includes(p.monthKey ?? ''),
            );
          return Promise.resolve({ count: 0 });
        },
      ),
      createMany: jest.fn(
        ({ data }: { data: (Period & { allocationId: string })[] }) => {
          for (const { allocationId, ...period } of data) {
            rows.get(allocationId)!.periods.push({
              ...period,
              hours: Number(period.hours),
            });
          }
          return Promise.resolve({ count: data.length });
        },
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Иван Петров' }),
    },
    roadmapPlanChange: {
      createMany: jest.fn(({ data }: { data: unknown[] }) =>
        Promise.resolve({ count: data.length }),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        run(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const service = new RoadmapService(
    prisma as unknown as PrismaService,
    {} as RoadmapIntegrationService,
    {} as RoadmapWorkItemImportService,
    {
      pendingUpdate: { azureSyncStatus: 'pending' },
      onAllocationSaved: jest.fn(),
    } as unknown as RoadmapAzureSyncService,
    {} as RoadmapAzureCatalogService,
    new RoadmapPlanChangeService(),
  );
  /** Every journal row written, in order. */
  const journal = () =>
    tx.roadmapPlanChange.createMany.mock.calls.flatMap(
      ([{ data }]) => data as Record<string, unknown>[],
    );
  return { service, tx, journal };
}

const dto = {
  workItemId: workItem.id,
  roleId: role.id,
  personExternalId: 'p1',
  personName: 'Анна',
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

describe('Plan change log: save allocation', () => {
  it('saveAllocation создаёт назначение и пишет created', async () => {
    const { service, journal } = setup();

    await service.saveAllocation(
      dto,
      undefined,
      planChangeContext(actor, 'plan'),
    );

    expect(journal()).toEqual([
      expect.objectContaining({
        action: 'created',
        source: 'plan',
        projectId: 'project',
        actorUserId: actor.id,
        actorEmail: actor.email,
        actorName: 'Иван Петров',
        allocationId: 'new-1',
        roleName: 'Dev',
        quarterKey: '2026-Q4',
        before: Prisma.DbNull,
        after: expect.objectContaining({
          estimatedHours: 8,
          months: [{ monthKey: '2026-10', hours: 8 }],
        }),
      }),
    ]);
  });

  it('saveAllocation меняет часы и пишет updated с before 8 / after 16', async () => {
    const { service, journal } = setup([row('a1')]);

    await service.saveAllocation(
      {
        ...dto,
        allocationId: 'a1',
        estimatedHours: 16,
        periods: [{ ...dto.periods[0], hours: 16 }],
      },
      undefined,
      planChangeContext(actor, 'plan'),
    );

    expect(journal()).toEqual([
      expect.objectContaining({
        action: 'updated',
        source: 'plan',
        allocationId: 'a1',
        before: expect.objectContaining({
          estimatedHours: 8,
          months: [{ monthKey: '2026-10', hours: 8 }],
        }),
        after: expect.objectContaining({
          estimatedHours: 16,
          months: [{ monthKey: '2026-10', hours: 16 }],
        }),
      }),
    ]);
  });

  it('saveAllocation по ключу без allocationId пишет updated, а не created', async () => {
    const { service, journal } = setup([row('a1')]);

    await service.saveAllocation(
      { ...dto, estimatedHours: 12 },
      undefined,
      planChangeContext(actor, 'plan'),
    );

    expect(journal()).toEqual([
      expect.objectContaining({
        action: 'updated',
        allocationId: 'a1',
        before: expect.objectContaining({ estimatedHours: 8 }),
        after: expect.objectContaining({ estimatedHours: 12 }),
      }),
    ]);
  });

  it('saveAllocation без изменений не пишет журнал', async () => {
    const { service, tx } = setup([row('a1')]);

    await service.saveAllocation(
      { ...dto, allocationId: 'a1' },
      undefined,
      planChangeContext(actor, 'plan'),
    );

    expect(tx.roadmapPlanChange.createMany).not.toHaveBeenCalled();
  });
});

describe('Plan change log: quarter months', () => {
  it('saveAllocationQuarter пишет одну запись с months до и после', async () => {
    const { service, journal } = setup([row('a1')]);

    await service.saveAllocationQuarter(
      'a1',
      '2026-Q4',
      [
        { monthKey: '2026-10', hours: 4 },
        { monthKey: '2026-11', hours: 4 },
        { monthKey: '2026-12', hours: 0 },
      ],
      planChangeContext(actor, 'plan'),
    );

    expect(journal()).toEqual([
      expect.objectContaining({
        action: 'updated',
        source: 'plan',
        allocationId: 'a1',
        before: expect.objectContaining({
          months: [{ monthKey: '2026-10', hours: 8 }],
        }),
        after: expect.objectContaining({
          estimatedHours: 8,
          months: [
            { monthKey: '2026-10', hours: 4 },
            { monthKey: '2026-11', hours: 4 },
          ],
        }),
      }),
    ]);
  });
});

describe('Plan change log: rebalance', () => {
  it('rebalanceAllocations пишет по записи на изменённое назначение с одним batchId', async () => {
    const { service, journal } = setup([
      row('first', { estimatedHours: 1, periods: [october(1)] }),
      row('second', { personExternalId: 'p2', estimatedHours: 0, periods: [] }),
      row('third', { personExternalId: 'p3', estimatedHours: 0, periods: [] }),
    ]);
    const context = planChangeContext(actor, 'plan');

    await service.rebalanceAllocations(['first', 'second', 'third'], context);

    const entries = journal();
    expect(entries.map((entry) => entry.allocationId).sort()).toEqual([
      'first',
      'second',
    ]);
    expect(
      entries.every(
        (entry) => entry.batchId === context.batchId && entry.source === 'plan',
      ),
    ).toBe(true);
    expect(entries.find((entry) => entry.allocationId === 'second')).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ estimatedHours: 0, months: [] }),
        after: expect.objectContaining({
          estimatedHours: 0.5,
          months: [{ monthKey: '2026-10', hours: 0.5 }],
        }),
      }),
    );
  });
});

describe('Plan change log: AI assistant', () => {
  const allocation = (id: string, personExternalId: string) => ({
    id,
    roleId: role.id,
    personExternalId,
    personName: 'Анна',
    personEmail: null,
    quarterKey: '2026-Q4',
    estimatedHours: '8',
    periods: [october(8)],
  });
  const plan: PlanInput = {
    name: 'OKR',
    roles: [
      {
        id: role.id,
        name: role.name,
        members: ['p1', 'p2', 'gone'].map((personExternalId) => ({
          personExternalId,
          personName: 'Анна',
          personEmail: null,
          personIsActive: true,
        })),
      },
    ],
    workItems: [
      {
        id: 'epic',
        externalId: '100',
        parentExternalId: null,
        type: 'Epic',
        title: 'Эпик',
        state: 'Active',
        actualHours: 0,
        allocations: [],
      },
      {
        id: workItem.id,
        externalId: workItem.externalId,
        parentExternalId: '100',
        type: 'Feature',
        title: workItem.title,
        state: 'Active',
        actualHours: 0,
        allocations: [allocation('a1', 'p1'), allocation('a2', 'p2')],
      },
    ],
  };

  it('agent.apply пишет source ai с одним batchId на все применённые предложения; отклонённое предложение записи не даёт', async () => {
    const { service: roadmap, journal } = setup([
      row('a1'),
      row('a2', { personExternalId: 'p2' }),
    ]);
    jest.spyOn(roadmap, 'getProjectPlan').mockResolvedValue(plan as never);
    const agent = new AgentService(roadmap, {
      require: jest.fn().mockResolvedValue(true),
    } as unknown as RoadmapProjectAccessService);
    const change = (
      workItemId: string,
      personExternalId: string,
      hours: number,
    ) => ({
      workItemId,
      roleId: role.id,
      personExternalId,
      quarterKey: '2026-Q4',
      estimatedHours: hours,
    });

    const results = await agent.apply({ ...actor, isAdmin: false }, 'project', [
      change(workItem.id, 'p1', 16),
      change('epic', 'p1', 4), // rejected by the plan check
      change(workItem.id, 'gone', 4), // fails inside the transaction
      change(workItem.id, 'p2', 20),
    ]);

    expect(results.map(({ ok }) => ok)).toEqual([true, false, false, true]);
    const entries = journal();
    expect(entries.map((entry) => entry.allocationId)).toEqual(['a1', 'a2']);
    expect(entries.map((entry) => entry.after)).toEqual([
      expect.objectContaining({ estimatedHours: 16 }),
      expect.objectContaining({ estimatedHours: 20 }),
    ]);
    expect(new Set(entries.map((entry) => entry.batchId)).size).toBe(1);
    expect(entries.every((entry) => entry.source === 'ai')).toBe(true);
    expect(entries.every((entry) => entry.actorUserId === actor.id)).toBe(true);
  });
});
