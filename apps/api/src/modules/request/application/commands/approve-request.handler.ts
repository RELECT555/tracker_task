import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Request } from '../../domain/request.entity';
import { RequestRepository } from '../../domain/request.repository';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

export interface ApproveRequestCommand {
  requestId: string;
  actorId: string;
  comment?: string;
}

@Injectable()
export class ApproveRequestHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly prismaRequestRepo: PrismaRequestRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: ApproveRequestCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundError('Request', command.requestId);

    const fromStep = request.currentStepIndex;
    const result = request.approve(command.actorId);

    await this.prisma.$transaction(async (tx) => {
      const props = request.toProps();

      await tx.request.update({
        where: { id: props.id },
        data: {
          status: props.status,
          routeSnapshot: props.routeSnapshot as object,
          currentStepIndex: props.currentStepIndex,
          completedAt: props.completedAt,
          updatedAt: props.updatedAt,
        },
      });

      await tx.assignment.updateMany({
        where: {
          requestId: props.id,
          stepIndex: fromStep!,
          assigneeId: command.actorId,
          status: 'pending',
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      if (result.kind === 'advanced') {
        await tx.assignment.create({
          data: {
            id: randomUUID(),
            requestId: props.id,
            stepIndex: result.nextStepIndex!,
            assigneeId: result.nextAssigneeId!,
            status: 'pending',
            dueAt: result.nextDueAt ?? null,
          },
        });
      }

      await tx.transition.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          fromStatus: 'in_progress',
          toStatus: props.status,
          fromStep,
          toStep: result.kind === 'advanced' ? result.nextStepIndex : fromStep,
          actorId: command.actorId,
          action: 'approve',
          comment: command.comment ?? null,
        },
      });
    });

    const record = await this.prismaRequestRepo.findByIdWithRelations(request.id);
    return RequestMapper.toDetail(record!, command.actorId);
  }
}
