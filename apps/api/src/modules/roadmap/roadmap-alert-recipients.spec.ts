import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { resolveRecipients } from './roadmap-alert-recipients';

interface UserWhere {
  isActive?: boolean;
  roles?: unknown;
  email?: { in: string[]; mode: string };
}

function setup(options: {
  admins?: string[];
  plannerEmails?: string[];
  plannerUsers?: string[];
}) {
  const prisma = {
    user: {
      findMany: jest.fn(({ where }: { where: UserWhere }) =>
        Promise.resolve(
          (where.roles
            ? (options.admins ?? [])
            : (options.plannerUsers ?? [])
          ).map((id) => ({ id })),
        ),
      ),
    },
    roadmapProjectAccess: {
      findMany: jest.fn(() =>
        Promise.resolve(
          (options.plannerEmails ?? []).map((email) => ({ email })),
        ),
      ),
    },
  };
  return { prisma, db: prisma as unknown as PrismaService };
}

describe('resolveRecipients', () => {
  it('matches planner emails case-insensitively', async () => {
    const { prisma, db } = setup({
      plannerEmails: ['planner@x.test'],
      plannerUsers: ['planner-id'],
    });

    const ids = await resolveRecipients(db, 'sync_errors', 'project-1');

    expect(ids).toEqual(['planner-id']);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { in: ['planner@x.test'], mode: 'insensitive' },
        }),
      }),
    );
  });

  it('returns admins together with planners', async () => {
    const { db } = setup({
      admins: ['admin-id'],
      plannerEmails: ['planner@x.test'],
      plannerUsers: ['planner-id'],
    });

    const ids = await resolveRecipients(db, 'import_failing', 'project-1');

    expect(ids.sort()).toEqual(['admin-id', 'planner-id']);
  });

  it('only queries active users', async () => {
    const { prisma, db } = setup({
      admins: ['admin-id'],
      plannerEmails: ['planner@x.test'],
      plannerUsers: ['planner-id'],
    });

    await resolveRecipients(db, 'sync_conflicts', 'project-1');

    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of prisma.user.findMany.mock.calls) {
      expect(args.where.isActive).toBe(true);
    }
  });

  it('looks up admins by the admin role code', async () => {
    const { prisma, db } = setup({ admins: ['admin-id'] });

    await resolveRecipients(db, 'azure_auth', null);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, roles: { some: { role: { code: 'admin' } } } },
      select: { id: true },
    });
  });

  it('lists an admin who is also a planner once', async () => {
    const { db } = setup({
      admins: ['same-id'],
      plannerEmails: ['same@x.test'],
      plannerUsers: ['same-id'],
    });

    const ids = await resolveRecipients(db, 'sync_errors', 'project-1');

    expect(ids).toEqual(['same-id']);
  });

  it('never includes viewers', async () => {
    const { prisma, db } = setup({});

    await resolveRecipients(db, 'sync_errors', 'project-1');

    expect(prisma.roadmapProjectAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'project-1', role: 'planner' },
      }),
    );
  });

  it('ignores planners for webhook_silent', async () => {
    const { prisma, db } = setup({
      admins: ['admin-id'],
      plannerEmails: ['planner@x.test'],
      plannerUsers: ['planner-id'],
    });

    const ids = await resolveRecipients(db, 'webhook_silent', 'project-1');

    expect(ids).toEqual(['admin-id']);
    expect(prisma.roadmapProjectAccess.findMany).not.toHaveBeenCalled();
  });

  it('ignores planners for azure_auth', async () => {
    const { prisma, db } = setup({ admins: ['admin-id'] });

    const ids = await resolveRecipients(db, 'azure_auth', null);

    expect(ids).toEqual(['admin-id']);
    expect(prisma.roadmapProjectAccess.findMany).not.toHaveBeenCalled();
  });

  it('skips the user lookup when the project has no planners', async () => {
    const { prisma, db } = setup({ admins: ['admin-id'] });

    const ids = await resolveRecipients(db, 'sync_errors', 'project-1');

    expect(ids).toEqual(['admin-id']);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });
});
