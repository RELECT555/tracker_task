import { Injectable } from '@nestjs/common';
import type { RouteSnapshot } from '@tracker/shared';
import {
  AccessDeniedError,
  NotFoundError,
} from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  computeCommentPermissions,
  filterCommentsForActor,
} from '../../domain/comment.permissions';
import { canViewRequest } from '../../domain/request.access';
import { CommentMapper } from '../../infrastructure/comment.mapper';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';
import { TransitionMapper } from '../../infrastructure/transition.mapper';

@Injectable()
export class GetRequestHandler {
  constructor(
    private readonly requestRepo: PrismaRequestRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(requestId: string, actorId?: string) {
    const record = await this.requestRepo.findByIdWithRelations(requestId);
    if (!record) throw new NotFoundError('Request', requestId);

    const route = record.routeSnapshot as RouteSnapshot | null;
    const hasAssignment = actorId
      ? (await this.prisma.assignment.count({
          where: { requestId, assigneeId: actorId },
        })) > 0
      : false;

    const viewer = {
      actorId,
      authorId: record.authorId,
      status: record.status,
      routeSnapshot: route,
      hasAssignment,
    };

    // Admin role is the last resort check so the extra query is skipped for participants.
    const canView =
      canViewRequest({ ...viewer, isAdmin: false }) ||
      (actorId !== undefined &&
        canViewRequest({ ...viewer, isAdmin: await this.isAdmin(actorId) }));

    if (!canView) {
      throw new AccessDeniedError('You do not have access to this request');
    }

    const commentPermissions = computeCommentPermissions({
      actorId,
      authorId: record.authorId,
      status: record.status,
      routeSnapshot: route,
      currentStepIndex: record.currentStepIndex,
      hasAssignment,
    });

    const comments = await this.prisma.comment.findMany({
      where: { requestId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });

    const visibleComments = filterCommentsForActor(
      comments.map(CommentMapper.toDto),
      actorId,
      record.authorId,
    );

    const transitions = await this.prisma.transition.findMany({
      where: { requestId },
      include: { actor: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...RequestMapper.toDetail(record, actorId),
      transitions: transitions.map(TransitionMapper.toDto),
      comments: visibleComments,
      commentPermissions,
    };
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, role: { code: 'admin' }, user: { isActive: true } },
    });
    return count > 0;
  }
}
