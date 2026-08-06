import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RequestRepository } from '../../domain/request.repository';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';
import { NotificationRecorder } from '../../../notification/application/notification-recorder';
import { NotificationTypes } from '../../../notification/domain/notification-type';

export interface RejectRequestCommand {
  requestId: string;
  actorId: string;
  reason: string;
}

@Injectable()
export class RejectRequestHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly prismaRequestRepo: PrismaRequestRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationRecorder,
  ) {}

  async execute(command: RejectRequestCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundError('Request', command.requestId);

    const fromStep = request.currentStepIndex;
    request.reject(command.actorId);

    await this.prisma.$transaction(async (tx) => {
      const props = request.toProps();

      await tx.request.update({
        where: { id: props.id },
        data: {
          status: props.status,
          routeSnapshot: props.routeSnapshot as object,
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

      await tx.transition.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          fromStatus: 'in_progress',
          toStatus: 'rejected',
          fromStep,
          toStep: fromStep,
          actorId: command.actorId,
          action: 'reject',
          comment: command.reason,
        },
      });
    });

    await this.notifications.send({
      userId: request.authorId,
      type: NotificationTypes.REQUEST_REJECTED,
      title: `Заявка отклонена: ${request.title}`,
      requestId: request.id,
    });

    const record = await this.prismaRequestRepo.findByIdWithRelations(request.id);
    return RequestMapper.toDetail(record!, command.actorId);
  }
}
