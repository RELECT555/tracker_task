import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ListAdminRouteTemplatesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const templates = await this.prisma.routeTemplate.findMany({
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    return {
      data: templates.map((template) => ({
        id: template.id,
        name: template.name,
        version: template.version,
        isPublished: template.isPublished,
        stepCount: template.steps.length,
        steps: template.steps.map((step) => ({
          order: step.stepOrder,
          name: step.name,
          assigneeType: step.assigneeType,
          assigneeRef: step.assigneeRef,
          slaHours: step.slaHours,
          actions: step.actions,
        })),
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      })),
    };
  }
}
