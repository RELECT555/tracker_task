import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../shared/presentation/decorators/current-user.decorator';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapNotificationsController } from './roadmap-notifications.controller';
import { RoadmapNotificationsService } from './roadmap-notifications.service';

const userId = '00000000-0000-4000-8000-000000000005';
const projectId = '10000000-0000-4000-8000-000000000001';
const notificationId = '50000000-0000-4000-8000-000000000001';

function row(
  id: string,
  generation: number,
  alert: {
    state: string;
    generation: number;
    resolution?: string | null;
    details?: unknown;
  },
) {
  return {
    id,
    userId,
    alertId: 'alert-id',
    generation,
    kind: 'sync_errors',
    projectId,
    title: 'Ошибки отправки в Azure: 5 назначений · Проект X',
    body: null,
    readAt: null,
    createdAt: new Date('2026-11-16T09:00:00.000Z'),
    alert: {
      resolution: null,
      details: { count: 5 },
      ...alert,
      project: { name: 'Проект X' },
    },
  };
}

function setup() {
  const prisma = {
    roadmapNotification: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new RoadmapNotificationsService(
    prisma as unknown as PrismaService,
  );
  return {
    prisma,
    service,
    controller: new RoadmapNotificationsController(service),
  };
}

const user: AuthenticatedUser = {
  id: userId,
  email: 'employee@company.example',
  isAdmin: false,
};

const admin: AuthenticatedUser = { ...user, isAdmin: true };

describe('RoadmapNotificationsService', () => {
  it('list returns only own rows', async () => {
    const { controller, prisma } = setup();

    await controller.list(user, {});

    expect(prisma.roadmapNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        take: 31,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('pages with a cursor and reports the next one', async () => {
    const { service, prisma } = setup();
    prisma.roadmapNotification.findMany.mockResolvedValue([
      row('a', 1, { state: 'open', generation: 1 }),
      row('b', 1, { state: 'open', generation: 1 }),
      row('c', 1, { state: 'open', generation: 1 }),
    ]);

    const page = await service.list(admin, {
      cursor: notificationId,
      limit: '2',
    });

    expect(prisma.roadmapNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        cursor: { id: notificationId },
        skip: 1,
      }),
    );
    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('b');
  });

  it('active is true only when alert.state is open and generations match', async () => {
    const { service, prisma } = setup();
    prisma.roadmapNotification.findMany.mockResolvedValue([
      row('current', 2, {
        state: 'open',
        generation: 2,
        details: { count: 2 },
      }),
      row('older', 1, { state: 'open', generation: 2 }),
    ]);

    const page = await service.list(admin, {});

    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toEqual({
      id: 'current',
      kind: 'sync_errors',
      projectId,
      projectName: 'Проект X',
      title: 'Ошибки отправки в Azure: 5 назначений · Проект X',
      body: null,
      link: '/roadmap/admin/integrations#azure-projects',
      createdAt: '2026-11-16T09:00:00.000Z',
      readAt: null,
      active: true,
      resolution: null,
      current: { count: 2 },
    });
    expect(page.items[1]).toMatchObject({
      active: false,
      current: null,
      resolution: 'fixed',
    });
  });

  it('links admins to the integrations tab and everyone else to the plan', async () => {
    const { service, prisma } = setup();
    prisma.roadmapNotification.findMany.mockResolvedValue([
      row('a', 1, { state: 'open', generation: 1 }),
    ]);

    const adminPage = await service.list(admin, {});
    const planner = await service.list(user, {});

    expect(adminPage.items[0].link).toBe(
      '/roadmap/admin/integrations#azure-projects',
    );
    expect(planner.items[0].link).toBe('/roadmap');
  });

  it('resolution comes from the alert when the episode is closed', async () => {
    const { service, prisma } = setup();
    prisma.roadmapNotification.findMany.mockResolvedValue([
      row('closed', 3, {
        state: 'resolved',
        generation: 3,
        resolution: 'obsolete',
      }),
    ]);

    const page = await service.list(admin, {});

    expect(page.items[0]).toMatchObject({
      active: false,
      current: null,
      resolution: 'obsolete',
    });
  });

  it('summary.activeUnread excludes closed episodes', async () => {
    const { controller, prisma } = setup();
    prisma.roadmapNotification.count.mockResolvedValue(3);
    prisma.roadmapNotification.findMany.mockResolvedValue([
      { generation: 2, alert: { generation: 2 } },
      { generation: 1, alert: { generation: 2 } },
    ]);

    await expect(controller.summary(user)).resolves.toEqual({
      unread: 3,
      activeUnread: 1,
    });
    expect(prisma.roadmapNotification.count).toHaveBeenCalledWith({
      where: { userId, readAt: null },
    });
    expect(prisma.roadmapNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, readAt: null, alert: { state: 'open' } },
      }),
    );
  });

  it("markRead on someone else's id throws NotFoundException", async () => {
    const { controller, prisma } = setup();
    prisma.roadmapNotification.updateMany.mockResolvedValue({ count: 0 });

    await expect(controller.markRead(user, notificationId)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.roadmapNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: notificationId, userId, readAt: null },
      }),
    );
  });

  it('markRead on an already read own notification succeeds', async () => {
    const { service, prisma } = setup();
    prisma.roadmapNotification.updateMany.mockResolvedValue({ count: 0 });
    prisma.roadmapNotification.findFirst.mockResolvedValue({
      id: notificationId,
    });

    await expect(service.markRead(userId, notificationId)).resolves.toBe(
      undefined,
    );
  });

  it('markRead on a malformed id throws NotFoundException without a query', async () => {
    const { service, prisma } = setup();

    await expect(service.markRead(userId, 'not-a-uuid')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.roadmapNotification.updateMany).not.toHaveBeenCalled();
  });

  it('markAllRead only touches own unread rows', async () => {
    const { controller, prisma } = setup();

    await controller.markAllRead(user);

    expect(prisma.roadmapNotification.updateMany).toHaveBeenCalledWith({
      where: { userId, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('list rejects limit=500', async () => {
    const { service, prisma } = setup();

    await expect(service.list(admin, { limit: '500' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.roadmapNotification.findMany).not.toHaveBeenCalled();
  });
});
