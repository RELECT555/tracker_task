import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Request } from '../../domain/request.entity';
import { RequestRepository } from '../../domain/request.repository';

export interface PerformEscalationInput {
  requestId: string;
  actorId: string;
  newAssignee: { id: string; fullName: string };
  action: 'escalate' | 'sla_escalate';
  comment: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EscalationService {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly prisma: PrismaService,
  ) {}

  async perform(input: PerformEscalationInput): Promise<Request> {
    const request = await this.requestRepo.findById(input.requestId);
    if (!request) {
      throw new NotFoundError('Request', input.requestId);
    }

    const fromStep = request.currentStepIndex;
    const result = request.escalate(input.actorId, input.newAssignee);

    await this.prisma.$transaction(async (tx) => {
      const props = request.toProps();

      await tx.request.update({
        where: { id: props.id },
        data: {
          routeSnapshot: props.routeSnapshot as object,
          updatedAt: props.updatedAt,
        },
      });

      await tx.assignment.updateMany({
        where: {
          requestId: props.id,
          stepIndex: fromStep!,
          assigneeId: input.actorId,
          status: 'pending',
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      await tx.assignment.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          stepIndex: result.stepIndex,
          assigneeId: result.newAssigneeId,
          status: 'pending',
          dueAt: result.newDueAt,
        },
      });

      await tx.transition.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          fromStatus: 'in_progress',
          toStatus: 'in_progress',
          fromStep,
          toStep: fromStep,
          actorId: input.actorId,
          action: input.action,
          comment: input.comment,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    });

    return request;
  }
}
