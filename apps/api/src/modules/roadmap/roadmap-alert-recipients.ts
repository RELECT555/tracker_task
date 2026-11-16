import type { RoadmapAlertKind } from '@tracker/shared';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

/** Alert kinds that concern the whole installation, not a single project. */
const ADMIN_ONLY_KINDS: readonly RoadmapAlertKind[] = [
  'azure_auth',
  'webhook_silent',
];

/**
 * Users to notify when an alert episode opens: active admins, plus the active
 * planners of the project for project-level alerts. Returns unique user ids.
 */
export async function resolveRecipients(
  prisma: PrismaService,
  kind: RoadmapAlertKind,
  projectId: string | null,
): Promise<string[]> {
  const recipients = new Set<string>();

  const admins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { code: 'admin' } } } },
    select: { id: true },
  });
  for (const admin of admins) {
    recipients.add(admin.id);
  }

  if (ADMIN_ONLY_KINDS.includes(kind) || projectId === null) {
    return [...recipients];
  }

  const access = await prisma.roadmapProjectAccess.findMany({
    where: { projectId, role: 'planner' },
    select: { email: true },
  });
  if (access.length === 0) {
    return [...recipients];
  }

  const planners = await prisma.user.findMany({
    where: {
      isActive: true,
      email: { in: access.map((row) => row.email), mode: 'insensitive' },
    },
    select: { id: true },
  });
  for (const planner of planners) {
    recipients.add(planner.id);
  }

  return [...recipients];
}
