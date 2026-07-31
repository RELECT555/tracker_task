import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AuditRecorder } from '../../../audit/application/audit-recorder';
import { AuditActions, AuditEntityTypes } from '../../../audit/domain/audit-action';
import { normalizeRouteSteps } from '../../domain/route-template';

export interface UpdateAdminRouteTemplateCommand {
  id: string;
  version: number;
  actorId: string;
  name?: string;
  steps?: unknown;
}

@Injectable()
export class UpdateAdminRouteTemplateHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateAdminRouteTemplateCommand) {
    const template = await this.prisma.routeTemplate.findUnique({
      where: {
        id_version: { id: command.id, version: command.version },
      },
      include: { steps: true },
    });

    if (!template) {
      throw new NotFoundError('RouteTemplate', `${command.id}@${command.version}`);
    }

    if (template.isPublished) {
      throw new ValidationError(
        'Опубликованный маршрут нельзя изменить. Создайте новую версию.',
      );
    }

    const data: { name?: string } = {};
    let stepCount = template.steps.length;

    if (command.name !== undefined) {
      const name = command.name.trim();
      if (!name) {
        throw new ValidationError('Укажите название маршрута');
      }
      data.name = name;
    }

    if (command.steps !== undefined) {
      const steps = normalizeRouteSteps(command.steps);
      stepCount = steps.length;

      await this.prisma.$transaction([
        this.prisma.routeStepTemplate.deleteMany({
          where: {
            routeTemplateId: command.id,
            routeTemplateVersion: command.version,
          },
        }),
        this.prisma.routeTemplate.update({
          where: {
            id_version: { id: command.id, version: command.version },
          },
          data: {
            ...data,
            steps: {
              create: steps.map((step) => ({
                stepOrder: step.order,
                name: step.name,
                assigneeType: step.assigneeType,
                assigneeRef: step.assigneeRef,
                actions: step.actions,
                slaHours: step.slaHours,
              })),
            },
          },
        }),
      ]);
    } else if (Object.keys(data).length > 0) {
      await this.prisma.routeTemplate.update({
        where: {
          id_version: { id: command.id, version: command.version },
        },
        data,
      });
    }

    if (command.name !== undefined || command.steps !== undefined) {
      await this.audit.record({
        actorId: command.actorId,
        action: AuditActions.ROUTE_TEMPLATE_UPDATED,
        entityType: AuditEntityTypes.ROUTE_TEMPLATE,
        entityId: command.id,
        payload: {
          version: command.version,
          name: data.name ?? template.name,
          stepsChanged: command.steps !== undefined,
          stepCount,
        },
      });
    }

    return { id: command.id, version: command.version };
  }
}
