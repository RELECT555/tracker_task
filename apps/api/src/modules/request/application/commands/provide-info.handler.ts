import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RequestRepository } from '../../domain/request.repository';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

export interface ProvideInfoCommand {
  requestId: string;
  actorId: string;
  fields?: Record<string, unknown>;
  comment?: string;
}

@Injectable()
export class ProvideInfoHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly prismaRequestRepo: PrismaRequestRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: ProvideInfoCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundError('Request', command.requestId);

    const result = request.provideInfo(command.actorId, command.fields ?? {});

    await this.prisma.$transaction(async (tx) => {
      const props = request.toProps();

      await tx.request.update({
        where: { id: props.id },
        data: {
          status: props.status,
          fields: props.fields as object,
          updatedAt: props.updatedAt,
        },
      });

      await tx.assignment.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          stepIndex: result.stepIndex,
          assigneeId: result.assigneeId,
          status: 'pending',
          dueAt: result.dueAt,
        },
      });

      await tx.transition.create({
        data: {
          id: randomUUID(),
          requestId: props.id,
          fromStatus: 'pending_info',
          toStatus: 'in_progress',
          fromStep: result.stepIndex,
          toStep: result.stepIndex,
          actorId: command.actorId,
          action: 'provide_info',
          comment: command.comment ?? null,
        },
      });
    });

    const record = await this.prismaRequestRepo.findByIdWithRelations(request.id);
    return RequestMapper.toDetail(record!, command.actorId);
  }
}
