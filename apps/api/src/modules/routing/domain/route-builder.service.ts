import { Injectable } from '@nestjs/common';
import type { RouteSnapshot, RouteStepAction } from '@tracker/shared';
import {
  BusinessRuleViolationError,
  ValidationError,
} from '../../../shared/domain/domain.error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AssigneeResolver } from './assignee.resolver';
import type { AuthorContext } from './route-template.repository';
import {
  RouteTemplateRecord,
  RouteTemplateRepository,
} from './route-template.repository';

export interface PersonalRouteStepInput {
  name: string;
  assigneeUserId: string;
  slaHours?: number | null;
}

export interface BuildRouteInput {
  requestTypeId: string;
  author: AuthorContext;
  fields: Record<string, unknown>;
  routeTemplateId?: string;
  personalSteps?: PersonalRouteStepInput[];
}

@Injectable()
export class RouteBuilder {
  constructor(
    private readonly routeTemplateRepo: RouteTemplateRepository,
    private readonly assigneeResolver: AssigneeResolver,
    private readonly prisma: PrismaService,
  ) {}

  async build(input: BuildRouteInput): Promise<RouteSnapshot> {
    const requestType = await this.prisma.requestType.findUnique({
      where: { id: input.requestTypeId },
    });

    if (!requestType) {
      throw new BusinessRuleViolationError('Тип запроса не найден');
    }

    if (input.personalSteps && input.personalSteps.length > 0) {
      if (!requestType.allowsPersonalRoute) {
        throw new BusinessRuleViolationError(
          'Для этого типа запроса нельзя собрать свой маршрут',
        );
      }
      return this.buildFromPersonalSteps(
        input.personalSteps,
        input.author.id,
        requestType.maxPersonalRouteSteps,
      );
    }

    const templateId =
      input.routeTemplateId ?? requestType.defaultRouteTemplateId ?? null;

    if (!templateId) {
      throw new BusinessRuleViolationError(
        requestType.allowsPersonalRoute
          ? 'Укажите согласующих: соберите свой маршрут или выберите шаблон'
          : 'У типа запроса нет маршрута по умолчанию. Настройте его в Администрировании → Типы запросов',
      );
    }

    if (
      input.routeTemplateId &&
      requestType.allowedManualRoutes.length > 0 &&
      !requestType.allowedManualRoutes.includes(input.routeTemplateId) &&
      input.routeTemplateId !== requestType.defaultRouteTemplateId
    ) {
      throw new BusinessRuleViolationError(
        'Выбранный шаблон маршрута не разрешён для этого типа запроса',
      );
    }

    const template = await this.routeTemplateRepo.findPublishedById(templateId);

    if (!template || template.steps.length === 0) {
      throw new BusinessRuleViolationError('Шаблон маршрута недоступен');
    }

    return this.buildFromTemplate(template, input.author, input.fields);
  }

  private async buildFromPersonalSteps(
    steps: PersonalRouteStepInput[],
    authorId: string,
    maxSteps: number,
  ): Promise<RouteSnapshot> {
    if (steps.length < 1) {
      throw new ValidationError('Добавьте хотя бы одного согласующего');
    }

    if (steps.length > maxSteps) {
      throw new ValidationError(
        `Максимум шагов в персональном маршруте: ${maxSteps}`,
      );
    }

    const now = Date.now();
    const resolved = [];

    for (const [index, step] of steps.entries()) {
      const name = step.name?.trim() || `Согласование ${index + 1}`;
      const assigneeUserId = step.assigneeUserId?.trim();

      if (!assigneeUserId) {
        throw new ValidationError(`Шаг ${index + 1}: выберите согласующего`);
      }

      if (assigneeUserId === authorId) {
        throw new ValidationError(
          `Шаг ${index + 1}: нельзя назначить согласование самому себе`,
        );
      }

      if (index > 0 && steps[index - 1]?.assigneeUserId === assigneeUserId) {
        throw new ValidationError(
          `Шаг ${index + 1}: нельзя ставить одного и того же согласующего подряд`,
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: assigneeUserId },
        select: { id: true, fullName: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw new ValidationError(
          `Шаг ${index + 1}: сотрудник не найден или неактивен`,
        );
      }

      const slaHours =
        step.slaHours === null || step.slaHours === undefined
          ? null
          : Number(step.slaHours);

      if (slaHours !== null && (!Number.isFinite(slaHours) || slaHours < 1)) {
        throw new ValidationError(
          `Шаг ${index + 1}: SLA должен быть положительным числом часов`,
        );
      }

      const isActive = index === 0;
      resolved.push({
        index,
        name,
        assignee: { id: user.id, fullName: user.fullName },
        status: isActive ? ('active' as const) : ('pending' as const),
        slaHours,
        dueAt:
          isActive && slaHours
            ? new Date(now + slaHours * 60 * 60 * 1000).toISOString()
            : null,
        actions: ['approve', 'reject', 'request_info'] as RouteStepAction[],
      });
    }

    return {
      templateId: null,
      templateVersion: null,
      source: 'personal',
      steps: resolved,
    };
  }

  private async buildFromTemplate(
    template: RouteTemplateRecord,
    author: AuthorContext,
    fields: Record<string, unknown>,
  ): Promise<RouteSnapshot> {
    const now = Date.now();
    const steps = await Promise.all(
      template.steps.map(async (stepTemplate, index) => {
        const assignee = await this.assigneeResolver.resolve(
          stepTemplate,
          author,
          fields,
        );

        const isActive = index === 0;
        const dueAt =
          isActive && stepTemplate.slaHours
            ? new Date(now + stepTemplate.slaHours * 60 * 60 * 1000).toISOString()
            : null;

        return {
          index,
          name: stepTemplate.name,
          assignee: {
            id: assignee.id,
            fullName: assignee.fullName,
          },
          status: isActive ? ('active' as const) : ('pending' as const),
          slaHours: stepTemplate.slaHours,
          dueAt,
          actions: stepTemplate.actions as RouteStepAction[],
        };
      }),
    );

    return {
      templateId: template.id,
      templateVersion: template.version,
      source: 'template',
      steps,
    };
  }
}
