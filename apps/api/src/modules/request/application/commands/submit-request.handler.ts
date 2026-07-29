import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RouteSnapshot } from '@tracker/shared';
import {
  AccessDeniedError,
  NotFoundError,
} from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RouteBuilder } from '../../../routing/domain/route-builder.service';
import { Request } from '../../domain/request.entity';
import {
  RequestRepository,
  UserReader,
} from '../../domain/request.repository';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

export interface SubmitRequestCommand {
  requestId: string;
  actorId: string;
  routeTemplateId?: string;
  personalSteps?: {
    name: string;
    assigneeUserId: string;
    slaHours?: number | null;
  }[];
}

@Injectable()
export class SubmitRequestHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly prismaRequestRepo: PrismaRequestRepository,
    private readonly userReader: UserReader,
    private readonly routeBuilder: RouteBuilder,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: SubmitRequestCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundError('Request', command.requestId);

    if (request.authorId !== command.actorId) {
      throw new AccessDeniedError('Only the author can submit this request');
    }

    const author = await this.userReader.findAuthorContext(command.actorId);
    if (!author) throw new NotFoundError('User', command.actorId);

    const routeSnapshot = await this.routeBuilder.build({
      requestTypeId: request.typeId,
      author,
      fields: request.fields,
      routeTemplateId: command.routeTemplateId,
      personalSteps: command.personalSteps,
    });

    request.submitWithRoute(routeSnapshot);
    await this.persistSubmission(request, routeSnapshot, command.actorId);

    const record = await this.prismaRequestRepo.findByIdWithRelations(request.id);
    return RequestMapper.toDetail(record!, command.actorId);
  }

  private async persistSubmission(
    request: Request,
    routeSnapshot: RouteSnapshot,
    actorId: string,
  ) {
    const activeStep = routeSnapshot.steps[0];
    if (!activeStep) {
      throw new Error('Route snapshot must contain at least one step');
    }

    await this.prisma.$transaction(async (tx) => {
      const props = request.toProps();

      await tx.request.update({
        where: { id: props.id },
        data: {
          status: props.status,
          routeSnapshot: props.routeSnapshot as object,
          currentStepIndex: props.currentStepIndex,
          submittedAt: props.submittedAt,
          updatedAt: props.updatedAt,
        },
      });

      await tx.assignment.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          stepIndex: 0,
          assigneeId: activeStep.assignee.id,
          status: 'pending',
          dueAt: activeStep.dueAt ? new Date(activeStep.dueAt) : null,
        },
      });

      await tx.transition.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          fromStatus: 'draft',
          toStatus: 'in_progress',
          fromStep: null,
          toStep: 0,
          actorId,
          action: 'submit',
        },
      });
    });
  }
}
