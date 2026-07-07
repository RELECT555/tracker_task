import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  RouteTemplateRecord,
  RouteTemplateRepository,
} from '../domain/route-template.repository';

@Injectable()
export class PrismaRouteTemplateRepository extends RouteTemplateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPublishedById(id: string): Promise<RouteTemplateRecord | null> {
    const template = await this.prisma.routeTemplate.findFirst({
      where: { id, isPublished: true },
      orderBy: { version: 'desc' },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    if (!template) return null;

    return {
      id: template.id,
      name: template.name,
      version: template.version,
      steps: template.steps.map((step) => ({
        stepOrder: step.stepOrder,
        name: step.name,
        assigneeType: step.assigneeType,
        assigneeRef: step.assigneeRef,
        slaHours: step.slaHours,
        actions: step.actions,
      })),
    };
  }
}
