import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class PublishAdminRouteTemplateHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(templateId: string) {
    const draft = await this.prisma.routeTemplate.findFirst({
      where: { id: templateId, isPublished: false },
      orderBy: { version: 'desc' },
      include: { steps: true },
    });

    if (!draft) {
      throw new NotFoundError('RouteTemplate draft', templateId);
    }

    if (draft.steps.length === 0) {
      throw new ValidationError('Нельзя опубликовать маршрут без шагов');
    }

    await this.prisma.routeTemplate.update({
      where: {
        id_version: { id: draft.id, version: draft.version },
      },
      data: { isPublished: true },
    });

    return { id: draft.id, version: draft.version };
  }
}

@Injectable()
export class CreateAdminRouteTemplateVersionHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(templateId: string) {
    const latest = await this.prisma.routeTemplate.findFirst({
      where: { id: templateId },
      orderBy: { version: 'desc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    if (!latest) {
      throw new NotFoundError('RouteTemplate', templateId);
    }

    const existingDraft = await this.prisma.routeTemplate.findFirst({
      where: { id: templateId, isPublished: false },
    });

    if (existingDraft) {
      throw new ValidationError(
        'Черновик версии уже есть. Отредактируйте или опубликуйте его.',
      );
    }

    const nextVersion = latest.version + 1;

    await this.prisma.routeTemplate.create({
      data: {
        id: templateId,
        name: latest.name,
        version: nextVersion,
        isPublished: false,
        steps: {
          create: latest.steps.map((step) => ({
            stepOrder: step.stepOrder,
            name: step.name,
            assigneeType: step.assigneeType,
            assigneeRef: step.assigneeRef,
            actions: step.actions,
            slaHours: step.slaHours,
          })),
        },
      },
    });

    return { id: templateId, version: nextVersion };
  }
}
