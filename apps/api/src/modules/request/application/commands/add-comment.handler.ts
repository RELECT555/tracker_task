import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RouteSnapshot } from '@tracker/shared';
import {
  AccessDeniedError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { computeCommentPermissions } from '../../domain/comment.permissions';
import { CommentMapper } from '../../infrastructure/comment.mapper';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';

export interface AddCommentCommand {
  requestId: string;
  actorId: string;
  body: string;
  isInternal?: boolean;
}

@Injectable()
export class AddCommentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestRepo: PrismaRequestRepository,
  ) {}

  async execute(command: AddCommentCommand) {
    const body = command.body.trim();
    if (!body) throw new ValidationError('Comment body is required');

    const record = await this.requestRepo.findByIdWithRelations(command.requestId);
    if (!record) throw new NotFoundError('Request', command.requestId);

    const route = record.routeSnapshot as RouteSnapshot | null;
    const hasAssignment =
      (await this.prisma.assignment.count({
        where: { requestId: command.requestId, assigneeId: command.actorId },
      })) > 0;

    const permissions = computeCommentPermissions({
      actorId: command.actorId,
      authorId: record.authorId,
      status: record.status,
      routeSnapshot: route,
      currentStepIndex: record.currentStepIndex,
      hasAssignment,
    });

    if (!permissions.canComment) {
      throw new AccessDeniedError('You cannot comment on this request');
    }

    if (command.isInternal && !permissions.canInternalComment) {
      throw new AccessDeniedError('You cannot create internal comments');
    }

    const comment = await this.prisma.comment.create({
      data: {
        id: randomUUID(),
        requestId: command.requestId,
        authorId: command.actorId,
        body,
        isInternal: command.isInternal ?? false,
      },
      include: { author: true },
    });

    return CommentMapper.toDto(comment);
  }
}
