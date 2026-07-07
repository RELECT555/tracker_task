import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RequestRepository } from '../../domain/request.repository';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

export interface RequestInfoCommand {
  requestId: string;
  actorId: string;
  message: string;
}

@Injectable()
export class RequestInfoHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly prismaRequestRepo: PrismaRequestRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RequestInfoCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundError('Request', command.requestId);

    const fromStep = request.currentStepIndex;
    request.requestInfo(command.actorId);

    await this.prisma.$transaction(async (tx) => {
      const props = request.toProps();

      await tx.request.update({
        where: { id: props.id },
        data: {
          status: props.status,
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

      await tx.transition.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          fromStatus: 'in_progress',
          toStatus: 'pending_info',
          fromStep,
          toStep: fromStep,
          actorId: command.actorId,
          action: 'request_info',
          comment: command.message,
        },
      });
    });

    const record = await this.prismaRequestRepo.findByIdWithRelations(request.id);
    return RequestMapper.toDetail(record!, command.actorId);
  }
}
