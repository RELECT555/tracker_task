import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { normalizeRouteSteps } from '../../domain/route-template';

export interface CreateAdminRouteTemplateCommand {
  name: string;
  steps: unknown;
  isPublished?: boolean;
}

@Injectable()
export class CreateAdminRouteTemplateHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateAdminRouteTemplateCommand) {
    const name = command.name.trim();
    if (!name) {
      throw new ValidationError('Name is required');
    }

    const steps = normalizeRouteSteps(command.steps);
    const id = randomUUID();
    const version = 1;

    await this.prisma.routeTemplate.create({
      data: {
        id,
        name,
        version,
        isPublished: command.isPublished ?? false,
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

    return { id, version };
  }
}
