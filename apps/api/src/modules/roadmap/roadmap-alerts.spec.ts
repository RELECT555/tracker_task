import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { HealthInput, ProjectHealth } from './roadmap-alert-rules';
import { RoadmapAlertsService } from './roadmap-alerts.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';

interface AlertRow {
  id: string;
  key: string;
  kind: string;
  projectId: string | null;
  state: string;
  generation: number;
  openedAt: Date | null;
  resolvedAt: Date | null;
  resolution: string | null;
  clearSince: Date | null;
  details: unknown;
}

interface NotificationRow {
  id: string;
  userId: string;
  alertId: string;
  generation: number;
  kind: string;
  projectId: string | null;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}

type Where = Record<string, unknown>;

/** Lets other pending promises run, so concurrent calls interleave like on two instances. */
const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function matches(row: object, where: Where): boolean {
  const values = row as Record<string, unknown>;
  return Object.entries(where).every(([field, expected]) => {
    const actual = values[field];
    if (expected === null) return actual === null;
    if (expected instanceof Date || typeof expected !== 'object') {
      return actual instanceof Date && expected instanceof Date
        ? actual.getTime() === expected.getTime()
        : actual === expected;
    }
    const filter = expected as Record<string, unknown>;
    if ('in' in filter) return (filter.in as unknown[]).includes(actual);
    if ('lt' in filter)
      return (actual as Date).getTime() < (filter.lt as Date).getTime();
    if ('lte' in filter)
      return (
        actual !== null &&
        (actual as Date).getTime() <= (filter.lte as Date).getTime()
      );
    throw new Error(`Unsupported filter on ${field}`);
  });
}

function applyData(row: AlertRow, data: Record<string, unknown>) {
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      (row as unknown as Record<string, number>)[field] += (
        value as { increment: number }
      ).increment;
    } else {
      (row as unknown as Record<string, unknown>)[field] = value;
    }
  }
}

function fakePrisma() {
  const alerts: AlertRow[] = [];
  const notifications: NotificationRow[] = [];

  const roadmapAlert = {
    findMany: jest.fn(async ({ where }: { where?: Where } = {}) => {
      await yieldTurn();
      return alerts
        .filter((row) => !where || matches(row, where))
        .map((row) => ({ ...row }));
    }),
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
      await yieldTurn();
      const row = alerts.find((alert) => alert.key === where.key);
      return row ? { ...row } : null;
    }),
    create: jest.fn(async ({ data }: { data: Partial<AlertRow> }) => {
      await yieldTurn();
      if (alerts.some((alert) => alert.key === data.key)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: AlertRow = {
        id: randomUUID(),
        kind: '',
        key: '',
        projectId: null,
        state: 'open',
        generation: 0,
        openedAt: null,
        resolvedAt: null,
        resolution: null,
        clearSince: null,
        details: {},
        ...data,
      };
      alerts.push(row);
      return { ...row };
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Where;
        data: Record<string, unknown>;
      }) => {
        await yieldTurn();
        const hit = alerts.filter((row) => matches(row, where));
        hit.forEach((row) => applyData(row, data));
        return { count: hit.length };
      },
    ),
    deleteMany: jest.fn(async ({ where }: { where: Where }) => {
      await yieldTurn();
      const { notifications: relation, ...rest } = where as {
        notifications?: { none: object };
      };
      const doomed = alerts.filter(
        (row) =>
          matches(row, rest) &&
          (!relation || !notifications.some((n) => n.alertId === row.id)),
      );
      doomed.forEach((row) => alerts.splice(alerts.indexOf(row), 1));
      return { count: doomed.length };
    }),
  };

  const roadmapNotification = {
    createMany: jest.fn(
      async ({
        data,
        skipDuplicates,
      }: {
        data: Omit<NotificationRow, 'id' | 'readAt' | 'createdAt'>[];
        skipDuplicates?: boolean;
      }) => {
        await yieldTurn();
        let count = 0;
        for (const item of data) {
          const duplicate = notifications.some(
            (row) =>
              row.alertId === item.alertId &&
              row.generation === item.generation &&
              row.userId === item.userId,
          );
          if (duplicate) {
            if (skipDuplicates) continue;
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint',
              {
                code: 'P2002',
                clientVersion: 'test',
              },
            );
          }
          notifications.push({
            id: randomUUID(),
            readAt: null,
            createdAt: new Date(),
            ...item,
          });
          count += 1;
        }
        return { count };
      },
    ),
    deleteMany: jest.fn(async ({ where }: { where: Where }) => {
      await yieldTurn();
      const doomed = notifications.filter((row) => matches(row, where));
      doomed.forEach((row) =>
        notifications.splice(notifications.indexOf(row), 1),
      );
      return { count: doomed.length };
    }),
  };

  const recipients = ['admin-id', 'planner-id'];
  const prisma = {
    roadmapAlert,
    roadmapNotification,
    user: {
      findMany: jest.fn(async () => {
        await yieldTurn();
        return recipients.map((id) => ({ id }));
      }),
    },
    roadmapProjectAccess: { findMany: jest.fn(() => Promise.resolve([])) },
    $transaction: jest.fn<
      Promise<unknown>,
      [(tx: unknown) => Promise<unknown>]
    >(),
  };
  // No rollback: the fake runs the transaction body against the same tables.
  prisma.$transaction.mockImplementation((run) => run(prisma));
  return { prisma, alerts, notifications };
}

const projectId = '10000000-0000-4000-8000-000000000001';

function project(overrides: Partial<ProjectHealth> = {}): ProjectHealth {
  return {
    id: projectId,
    name: 'Проект X',
    writeBackEnabled: true,
    errorCount: 0,
    conflictCount: 0,
    importFailingSince: null,
    lastImportError: null,
    lastWebhookAt: null,
    lastImportChangedAt: null,
    ...overrides,
  };
}

function health(
  now: Date,
  overrides: Partial<ProjectHealth> = {},
): HealthInput {
  return {
    now,
    integrationConfigured: true,
    auth: { authFailedAt: null, authOkAt: null, httpStatus: null },
    projects: [project(overrides)],
  };
}

function setup() {
  const fake = fakePrisma();
  const service = new RoadmapAlertsService(
    fake.prisma as unknown as PrismaService,
    {} as RoadmapIntegrationService,
  );
  let errorCount = 0;
  jest
    .spyOn(service, 'loadHealth')
    .mockImplementation((now: Date) =>
      Promise.resolve(health(now, { errorCount })),
    );
  return {
    ...fake,
    service,
    setErrors: (count: number) => {
      errorCount = count;
    },
  };
}

const minutes = (n: number) => n * 60_000;
const start = new Date('2026-11-16T09:00:00');
const at = (minute: number) => new Date(start.getTime() + minutes(minute));
const syncErrorsKey = `sync_errors:${projectId}`;

describe('RoadmapAlertsService.evaluate', () => {
  it('first error opens one notification per recipient', async () => {
    const { service, alerts, notifications, setErrors } = setup();
    setErrors(5);

    await service.evaluate(at(0));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      key: syncErrorsKey,
      kind: 'sync_errors',
      projectId,
      state: 'open',
      generation: 1,
      details: { count: 5 },
    });
    expect(notifications).toHaveLength(2);
    expect(notifications.map((row) => row.userId).sort()).toEqual([
      'admin-id',
      'planner-id',
    ]);
    expect(notifications[0]).toMatchObject({
      alertId: alerts[0].id,
      generation: 1,
      kind: 'sync_errors',
      projectId,
      title: 'Ошибки отправки в Azure: 5 назначений · Проект X',
    });
  });

  it('five ticks with growing count create no new rows and update details.count', async () => {
    const { service, alerts, notifications, setErrors } = setup();
    for (let tick = 0; tick < 5; tick += 1) {
      setErrors(tick + 1);
      await service.evaluate(at(tick));
    }

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ generation: 1, details: { count: 5 } });
    expect(notifications).toHaveLength(2);
  });

  it('clear for 5 min then error again keeps the episode', async () => {
    const { service, alerts, notifications, setErrors } = setup();
    setErrors(2);
    await service.evaluate(at(0));

    setErrors(0);
    for (let minute = 1; minute <= 6; minute += 1) {
      await service.evaluate(at(minute));
    }
    expect(alerts[0]).toMatchObject({ state: 'open', clearSince: at(1) });

    setErrors(1);
    await service.evaluate(at(7));

    expect(alerts[0]).toMatchObject({
      state: 'open',
      generation: 1,
      clearSince: null,
      resolution: null,
      details: { count: 1 },
    });
    expect(notifications).toHaveLength(2);
  });

  it('clear for 10 min resolves with fixed, next error opens generation 2 with new rows', async () => {
    const { service, alerts, notifications, setErrors } = setup();
    setErrors(2);
    await service.evaluate(at(0));

    setErrors(0);
    for (let minute = 1; minute <= 10; minute += 1) {
      await service.evaluate(at(minute));
    }
    expect(alerts[0].state).toBe('open');
    await service.evaluate(at(11));
    expect(alerts[0]).toMatchObject({
      state: 'resolved',
      resolution: 'fixed',
      resolvedAt: at(11),
    });

    setErrors(3);
    await service.evaluate(at(12));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      state: 'open',
      generation: 2,
      openedAt: at(12),
      resolvedAt: null,
      resolution: null,
      clearSince: null,
      details: { count: 3 },
    });
    expect(notifications).toHaveLength(4);
    expect(
      notifications.filter((row) => row.generation === 2).map((r) => r.userId),
    ).toHaveLength(2);
  });

  it('two concurrent evaluate() calls create one row per user', async () => {
    const { service, alerts, notifications, setErrors } = setup();
    setErrors(4);

    await Promise.all([service.evaluate(at(0)), service.evaluate(at(0))]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].generation).toBe(1);
    expect(notifications).toHaveLength(2);
  });

  it('two concurrent evaluate() calls reopen a resolved episode once', async () => {
    const { service, alerts, notifications, setErrors } = setup();
    setErrors(1);
    await service.evaluate(at(0));
    setErrors(0);
    await service.evaluate(at(1));
    await service.evaluate(at(11));
    expect(alerts[0].state).toBe('resolved');

    setErrors(2);
    await Promise.all([service.evaluate(at(12)), service.evaluate(at(12))]);

    expect(alerts[0]).toMatchObject({ state: 'open', generation: 2 });
    expect(notifications).toHaveLength(4);
  });

  it('a failing condition does not stop the others', async () => {
    const { service, prisma, alerts, setErrors } = setup();
    jest.spyOn(service, 'loadHealth').mockImplementation((now: Date) =>
      Promise.resolve({
        ...health(now, { errorCount: 1 }),
        projects: [
          project({ id: 'broken', errorCount: 1 }),
          project({ errorCount: 1 }),
        ],
      }),
    );
    const create = prisma.roadmapAlert.create.getMockImplementation()!;
    prisma.roadmapAlert.create.mockImplementation(
      (args: { data: Partial<AlertRow> }) =>
        args.data.projectId === 'broken'
          ? Promise.reject(new Error('boom'))
          : create(args),
    );
    setErrors(1);
    const logError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await service.evaluate(at(0));

    expect(alerts.map((row) => row.key)).toEqual([syncErrorsKey]);
    expect(logError).toHaveBeenCalled();
  });

  it('daily cleanup deletes notifications older than 90 days', async () => {
    const { service, prisma, alerts, notifications } = setup();
    const old = new Date(start.getTime() - 91 * 24 * minutes(60));
    const recent = new Date(start.getTime() - 89 * 24 * minutes(60));
    alerts.push(
      {
        id: 'stale-alert',
        key: `sync_conflicts:${projectId}`,
        kind: 'sync_conflicts',
        projectId,
        state: 'resolved',
        generation: 1,
        openedAt: old,
        resolvedAt: old,
        resolution: 'fixed',
        clearSince: null,
        details: {},
      },
      {
        id: 'kept-alert',
        key: `import_failing:${projectId}`,
        kind: 'import_failing',
        projectId,
        state: 'resolved',
        generation: 1,
        openedAt: recent,
        resolvedAt: recent,
        resolution: 'fixed',
        clearSince: null,
        details: {},
      },
    );
    const base = {
      userId: 'admin-id',
      generation: 1,
      kind: 'sync_conflicts',
      projectId,
      title: 't',
      body: null,
      readAt: null,
    };
    notifications.push(
      { ...base, id: 'old', alertId: 'stale-alert', createdAt: old },
      { ...base, id: 'recent', alertId: 'kept-alert', createdAt: recent },
    );

    await service.evaluate(at(0));

    expect(notifications.map((row) => row.id)).toEqual(['recent']);
    expect(alerts.map((row) => row.id)).toEqual(['kept-alert']);

    await service.evaluate(at(60));
    expect(prisma.roadmapNotification.deleteMany).toHaveBeenCalledTimes(1);

    await service.evaluate(new Date('2026-11-17T00:01:00'));
    expect(prisma.roadmapNotification.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe('RoadmapAlertsService.loadHealth', () => {
  it('merges status counts, write-back scope and project state', async () => {
    const otherId = '10000000-0000-4000-8000-000000000002';
    const failingSince = new Date('2026-11-16T08:00:00Z');
    const findProjects = jest.fn().mockResolvedValue([
      {
        id: projectId,
        name: 'Проект X',
        azureState: {
          importFailingSince: failingSince,
          lastImportError: 'HTTP 500',
          lastWebhookAt: null,
          lastImportChangedAt: null,
        },
      },
      { id: otherId, name: 'Проект Y', azureState: null },
    ]);
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { project_id: projectId, azure_sync_status: 'error', count: 3 },
        { project_id: projectId, azure_sync_status: 'conflict', count: 1 },
        { project_id: otherId, azure_sync_status: 'error', count: 2 },
      ]),
      roadmapProject: { findMany: findProjects },
    };
    const auth = { authFailedAt: null, authOkAt: null, httpStatus: null };
    const integration = {
      getAuthHealth: jest.fn().mockResolvedValue(auth),
      getPublicSettings: jest.fn().mockResolvedValue({ configured: true }),
      getSyncSettings: jest
        .fn()
        .mockResolvedValue({ mode: 'manual', projectIds: [projectId] }),
    };
    const service = new RoadmapAlertsService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
    );

    const result = await service.loadHealth(start);

    expect(findProjects).toHaveBeenCalledWith(
      expect.objectContaining({ where: { syncedAt: { not: null } } }),
    );
    expect(result).toEqual({
      now: start,
      integrationConfigured: true,
      auth,
      projects: [
        {
          id: projectId,
          name: 'Проект X',
          writeBackEnabled: true,
          errorCount: 3,
          conflictCount: 1,
          importFailingSince: failingSince,
          lastImportError: 'HTTP 500',
          lastWebhookAt: null,
          lastImportChangedAt: null,
        },
        {
          id: otherId,
          name: 'Проект Y',
          writeBackEnabled: false,
          errorCount: 2,
          conflictCount: 0,
          importFailingSince: null,
          lastImportError: null,
          lastWebhookAt: null,
          lastImportChangedAt: null,
        },
      ],
    });
  });
});
