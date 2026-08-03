import type { RouteSnapshot } from '@tracker/shared';
import { isRouteParticipant } from './comment.permissions';

export interface RequestViewerContext {
  actorId?: string;
  authorId: string;
  status: string;
  routeSnapshot: RouteSnapshot | null;
  hasAssignment: boolean;
  isAdmin: boolean;
}

export function canViewRequest(input: RequestViewerContext): boolean {
  if (!input.actorId) return false;
  if (input.isAdmin) return true;
  if (input.authorId === input.actorId) return true;

  // Draft is visible to its author only: no route exists yet, nobody is involved.
  if (input.status === 'draft') return false;

  return (
    input.hasAssignment || isRouteParticipant(input.routeSnapshot, input.actorId)
  );
}
