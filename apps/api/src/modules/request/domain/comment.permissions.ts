import type { RouteSnapshot } from '@tracker/shared';

export interface CommentPermissions {
  canComment: boolean;
  canInternalComment: boolean;
}

export function isActiveAssignee(
  routeSnapshot: RouteSnapshot | null,
  currentStepIndex: number | null,
  actorId: string,
): boolean {
  if (currentStepIndex === null || !routeSnapshot) return false;
  const step = routeSnapshot.steps[currentStepIndex];
  return step?.status === 'active' && step.assignee.id === actorId;
}

export function isRouteParticipant(
  routeSnapshot: RouteSnapshot | null,
  actorId: string,
): boolean {
  if (!routeSnapshot) return false;
  return routeSnapshot.steps.some((step) => step.assignee.id === actorId);
}

export function computeCommentPermissions(input: {
  actorId?: string;
  authorId: string;
  status: string;
  routeSnapshot: RouteSnapshot | null;
  currentStepIndex: number | null;
  hasAssignment: boolean;
}): CommentPermissions {
  if (!input.actorId || input.status === 'draft') {
    return { canComment: false, canInternalComment: false };
  }

  const isAuthor = input.authorId === input.actorId;
  const participant =
    isAuthor ||
    input.hasAssignment ||
    isRouteParticipant(input.routeSnapshot, input.actorId);

  const canInternalComment =
    input.status === 'in_progress' &&
    isActiveAssignee(input.routeSnapshot, input.currentStepIndex, input.actorId);

  return {
    canComment: participant,
    canInternalComment,
  };
}

export function filterCommentsForActor<T extends { isInternal: boolean }>(
  comments: T[],
  actorId: string | undefined,
  authorId: string,
): T[] {
  if (!actorId || actorId === authorId) {
    return comments.filter((comment) => !comment.isInternal);
  }
  return comments;
}
