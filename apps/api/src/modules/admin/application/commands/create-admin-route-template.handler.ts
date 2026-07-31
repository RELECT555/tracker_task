import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AuditRecorder } from '../../../audit/application/audit-recorder';
import { AuditActions, AuditEntityTypes } from '../../../audit/domain/audit-action';
import { normalizeRouteSteps } from '../../domain/route-template';

export interface CreateAdminRouteTemplateCommand {
  actorId: string;
  name: string;
  steps: unknown;
  isPublished?: boolean;
}

@Injectable()
export class CreateAdminRouteTemplateHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(command: CreateAdminRouteTemplateCommand) {
    const name = command.name.trim();
    if (!name) {
      throw new ValidationError('Укажите название маршрута');
    }

    const steps = normalizeRouteSteps(command.steps);
    const id = randomUUID();
    const version = 1;
    const isPublished = command.isPublished ?? false;

    await this.prisma.routeTemplate.create({
      data: {
        id,
        name,
        version,
        isPublished,
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
    });

    await this.audit.record({
      actorId: command.actorId,
      action: AuditActions.ROUTE_TEMPLATE_CREATED,
      entityType: AuditEntityTypes.ROUTE_TEMPLATE,
      entityId: id,
      payload: {
        name,
        version,
        isPublished,
        stepCount: steps.length,
      },
    });

    return { id, version };
  }
}
