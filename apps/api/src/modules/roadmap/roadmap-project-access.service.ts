import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RoadmapProjectRole } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../../shared/presentation/decorators/current-user.decorator';

type ProjectTarget =
  { projectId: string } | { workItemId: string } | { allocationIds: string[] };

@Injectable()
export class RoadmapProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async require(
    actor: AuthenticatedUser,
    target: ProjectTarget,
    permission: 'read' | 'edit',
  ): Promise<boolean> {
    if (actor.isAdmin) return true;

    const projectId = await this.projectIdFor(target);
    const grant =
      projectId &&
      (await this.prisma.roadmapProjectAccess.findUnique({
        where: {
          projectId_email: {
            projectId,
            email: actor.email.trim().toLowerCase(),
          },
        },
        select: { role: true },
      }));
    if (!grant || (permission === 'edit' && grant.role !== 'planner')) {
      throw new ForbiddenException(
        'У вас нет необходимого доступа к этому проекту',
      );
    }
    return grant.role === 'planner';
  }

  async localProjects(email?: string) {
    const projects = await this.prisma.roadmapProject.findMany({
      where:
        email === undefined
          ? undefined
          : { access: { some: { email: email.trim().toLowerCase() } } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        externalId: true,
        name: true,
        url: true,
        syncedAt: true,
      },
    });
    return {
      source: 'local' as const,
      data: projects.map((project) => ({
        id: project.externalId,
        name: project.name,
        url: project.url ?? undefined,
        imported: true,
        roadmapId: project.id,
        planSynced: Boolean(project.syncedAt),
      })),
    };
  }

  async list(projectId: string) {
    await this.ensureProjectExists(projectId);
    return this.prisma.roadmapProjectAccess.findMany({
      where: { projectId },
      select: { email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }

  async set(projectId: string, email: string, role: RoadmapProjectRole) {
    await this.ensureProjectExists(projectId);
    const key = { projectId, email: email.trim().toLowerCase() };
    return this.prisma.roadmapProjectAccess.upsert({
      where: { projectId_email: key },
      create: { ...key, role },
      update: { role },
      select: { email: true, role: true },
    });
  }

  async revoke(projectId: string, email: string) {
    await this.prisma.roadmapProjectAccess.deleteMany({
      where: { projectId, email: email.trim().toLowerCase() },
    });
    return { revoked: true };
  }

  private async ensureProjectExists(id: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
  }

  private async projectIdFor(target: ProjectTarget) {
    if ('projectId' in target) return target.projectId;
    if ('workItemId' in target) {
      const item = await this.prisma.roadmapWorkItem.findUnique({
        where: { id: target.workItemId },
        select: { projectId: true },
      });
      return item?.projectId;
    }

    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: { id: { in: target.allocationIds } },
      select: { workItem: { select: { projectId: true } } },
    });
    const projectId = allocations[0]?.workItem.projectId;
    if (
      allocations.length !== target.allocationIds.length ||
      allocations.some(({ workItem }) => workItem.projectId !== projectId)
    ) {
      return undefined;
    }
    return projectId;
  }
}
