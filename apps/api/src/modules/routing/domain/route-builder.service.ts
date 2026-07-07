import { Injectable } from '@nestjs/common';
import type { RouteSnapshot, RouteStepAction } from '@tracker/shared';
import { BusinessRuleViolationError } from '../../../shared/domain/domain.error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AssigneeResolver } from './assignee.resolver';
import type { AuthorContext } from './route-template.repository';
import {
  RouteTemplateRecord,
  RouteTemplateRepository,
} from './route-template.repository';

export interface BuildRouteInput {
  requestTypeId: string;
  author: AuthorContext;
  fields: Record<string, unknown>;
  routeTemplateId?: string;
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

    if (!requestType?.defaultRouteTemplateId && !input.routeTemplateId) {
      throw new BusinessRuleViolationError(
        'Request type has no default route template',
      );
    }

    const templateId = input.routeTemplateId ?? requestType!.defaultRouteTemplateId!;
    const template = await this.routeTemplateRepo.findPublishedById(templateId);

    if (!template || template.steps.length === 0) {
      throw new BusinessRuleViolationError('Route template is not available');
    }

    return this.buildFromTemplate(template, input.author, input.fields);
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
      steps,
    };
  }
}
