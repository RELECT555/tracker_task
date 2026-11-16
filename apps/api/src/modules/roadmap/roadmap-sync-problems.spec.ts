import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapSyncProblemsService } from './roadmap-sync-problems.service';

const projectA = '10000000-0000-4000-8000-00000000000a';
const projectB = '10000000-0000-4000-8000-00000000000b';
const alertId = '20000000-0000-4000-8000-000000000001';

const admin = { id: 'admin', email: 'admin@x.test', isAdmin: true };
const planner = { id: 'planner', email: ' Planner@X.test ', isAdmin: false };

function alertRow(over: Record<string, unknown> = {}) {
  return {
    id: alertId,
    kind: 'sync_errors',
    projectId: projectA,
    state: 'open',
    resolution: null,
    project: { name: 'Alpha' },
    episodes: [
      {
        id: 'ep-3',
        generation: 3,
        openedAt: new Date('2026-11-16T10:00:00Z'),
        resolvedAt: null,
        resolution: null,
        details: { count: 2 },
        peakCount: 5,
      },
    ],
    ...over,
  };
}

function setup() {
  const prisma = {
    roadmapAlert: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    roadmapAlertEpisode: { findMany: jest.fn().mockResolvedValue([]) },
    roadmapProject: {
      findMany: jest.fn().mockResolvedValue([
        { id: projectA, name: 'Alpha' },
        { id: projectB, name: 'Beta' },
      ]),
    },
    roadmapProjectAccess: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ project: { id: projectA, name: 'Alpha' } }]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const service = new RoadmapSyncProblemsService(
    prisma as unknown as PrismaService,
  );
  return { prisma, service };
}

const whereOf = (mock: jest.Mock) =>
  (mock.mock.calls[0][0] as { where: unknown }).where;

describe('RoadmapSyncProblemsService access', () => {
  it('admin sees every project and global kinds', async () => {
    const { service, prisma } = setup();
    const page = await service.list(admin, {});
    expect(JSON.stringify(whereOf(prisma.roadmapAlert.findMany))).not.toContain(
      'notIn',
    );
    expect(page.projects.map((p) => p.id)).toEqual([projectA, projectB]);
    expect(prisma.roadmapProjectAccess.findMany).not.toHaveBeenCalled();
  });

  it('planner is limited to planner projects without global kinds', async () => {
    const { service, prisma } = setup();
    const page = await service.list(planner, {});
    expect(prisma.roadmapProjectAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'planner@x.test', role: 'planner' },
      }),
    );
    expect(whereOf(prisma.roadmapAlert.findMany)).toEqual({
      AND: [
        {
          AND: [
            {
              projectId: { in: [projectA] },
              kind: { notIn: ['azure_auth', 'webhook_silent'] },
            },
            { episodes: { some: {} } },
          ],
        },
        { state: 'open' },
      ],
    });
    expect(page.projects).toEqual([{ id: projectA, name: 'Alpha' }]);
  });

  it('a user without planner grants is forbidden', async () => {
    const { service, prisma } = setup();
    prisma.roadmapProjectAccess.findMany.mockResolvedValue([]);
    await expect(service.list(planner, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('filtering by a project outside the allowed set is forbidden', async () => {
    const { service } = setup();
    await expect(
      service.list(planner, { projectId: projectB }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a malformed limit is rejected', async () => {
    const { service } = setup();
    await expect(service.list(admin, { limit: '500' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('canView: admin, planner yes; viewer no', async () => {
    const { service, prisma } = setup();
    await expect(service.canView(admin)).resolves.toBe(true);
    prisma.roadmapProjectAccess.findFirst.mockResolvedValueOnce({
      projectId: projectA,
    });
    await expect(service.canView(planner)).resolves.toBe(true);
    await expect(service.canView(planner)).resolves.toBe(false);
  });
});

describe('RoadmapSyncProblemsService list', () => {
  it('maps status filters to alert state and ordering', async () => {
    const { service, prisma } = setup();
    await service.list(admin, { status: 'resolved' });
    const resolved = prisma.roadmapAlert.findMany.mock.calls[0][0];
    expect(resolved.where.AND[1]).toEqual({ state: 'resolved' });
    expect(resolved.orderBy).toEqual([{ resolvedAt: 'desc' }, { id: 'desc' }]);

    await service.list(admin, { status: 'all' });
    const all = prisma.roadmapAlert.findMany.mock.calls[1][0];
    expect(all.where.AND).toHaveLength(2);
    expect(all.orderBy[0]).toEqual({ state: 'asc' });

    await service.list(admin, {});
    expect(prisma.roadmapAlert.findMany.mock.calls[2][0].orderBy).toEqual([
      { openedAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('builds one row per problem from its latest episode with stats and actions', async () => {
    const { service, prisma } = setup();
    prisma.roadmapAlert.findMany.mockResolvedValue([alertRow()]);
    prisma.roadmapAlert.count.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([
      { alert_id: alertId, total: 3, recent: 2 },
    ]);

    const page = await service.list(planner, {});

    expect(page.counts).toEqual({ active: 1 });
    expect(page.items).toEqual([
      {
        alertId,
        episodeId: 'ep-3',
        kind: 'sync_errors',
        projectId: projectA,
        projectName: 'Alpha',
        title: 'Ошибки отправки в Azure: 2 назначения · Alpha',
        body: null,
        status: 'active',
        openedAt: '2026-11-16T10:00:00.000Z',
        resolvedAt: null,
        peakCount: 5,
        currentCount: 2,
        recurrence7d: 2,
        historyCount: 2,
        hint: 'Откройте назначения с ошибкой, проверьте текст ошибки и отправьте снова.',
        action: { label: 'Открыть план', link: '/roadmap' },
      },
    ]);
  });

  it('closed problems take status and end time from the latest episode', async () => {
    const { service, prisma } = setup();
    prisma.roadmapAlert.findMany.mockResolvedValue([
      alertRow({
        state: 'resolved',
        resolution: 'fixed',
        episodes: [
          {
            ...alertRow().episodes[0],
            resolvedAt: new Date('2026-11-16T10:25:00Z'),
            resolution: 'obsolete',
          },
        ],
      }),
    ]);
    const page = await service.list(admin, { status: 'resolved' });
    expect(page.items[0]).toMatchObject({
      status: 'obsolete',
      resolvedAt: '2026-11-16T10:25:00.000Z',
      recurrence7d: 1,
      historyCount: 0,
      action: {
        label: 'Интеграции → Проекты',
        link: '/roadmap/admin/integrations#azure-projects',
      },
    });
  });

  it('pages with a cursor', async () => {
    const { service, prisma } = setup();
    prisma.roadmapAlert.findMany.mockResolvedValue([
      alertRow({ id: 'a1' }),
      alertRow({ id: 'a2' }),
    ]);
    const page = await service.list(admin, { cursor: alertId, limit: '1' });
    expect(prisma.roadmapAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, cursor: { id: alertId }, skip: 1 }),
    );
    expect(page.items.map((i) => i.alertId)).toEqual(['a1']);
    expect(page.nextCursor).toBe('a1');
  });
});

describe('RoadmapSyncProblemsService history', () => {
  it('returns earlier episodes newest first, skipping the latest', async () => {
    const { service, prisma } = setup();
    prisma.roadmapAlert.findFirst.mockResolvedValue({ id: alertId });
    prisma.roadmapAlertEpisode.findMany.mockResolvedValue([
      {
        id: 'ep-2',
        openedAt: new Date('2026-11-15T10:00:00Z'),
        resolvedAt: new Date('2026-11-15T10:20:00Z'),
        resolution: 'fixed',
        peakCount: 3,
        details: { count: 1 },
      },
    ]);

    const history = await service.history(planner, alertId, {});

    expect(prisma.roadmapAlertEpisode.findMany).toHaveBeenCalledWith({
      where: { alertId },
      orderBy: { generation: 'desc' },
      skip: 1,
      take: 20,
    });
    expect(history.items).toEqual([
      {
        episodeId: 'ep-2',
        openedAt: '2026-11-15T10:00:00.000Z',
        resolvedAt: '2026-11-15T10:20:00.000Z',
        resolution: 'fixed',
        peakCount: 3,
        details: { count: 1 },
      },
    ]);
    expect(whereOf(prisma.roadmapAlert.findFirst)).toEqual({
      AND: [
        {
          projectId: { in: [projectA] },
          kind: { notIn: ['azure_auth', 'webhook_silent'] },
        },
        { id: alertId },
      ],
    });
  });

  it('a problem the user cannot see is not found', async () => {
    const { service } = setup();
    await expect(service.history(planner, alertId, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.history(admin, 'not-a-uuid', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
