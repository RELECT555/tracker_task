import type { RouteSnapshot } from '@tracker/shared';
import {
  computeCommentPermissions,
  filterCommentsForActor,
  isActiveAssignee,
} from './comment.permissions';

describe('comment.permissions', () => {
  const route: RouteSnapshot = {
    templateId: 'r1',
    templateVersion: 1,
    steps: [
      {
        index: 0,
        name: 'Manager',
        assignee: { id: 'mgr-1', fullName: 'Manager' },
        status: 'active',
        slaHours: 24,
        dueAt: null,
      },
    ],
  };

  it('allows author and assignee to comment on in_progress request', () => {
    expect(
      computeCommentPermissions({
        actorId: 'user-1',
        authorId: 'user-1',
        status: 'in_progress',
        routeSnapshot: route,
        currentStepIndex: 0,
        hasAssignment: false,
      }).canComment,
    ).toBe(true);

    expect(
      computeCommentPermissions({
        actorId: 'mgr-1',
        authorId: 'user-1',
        status: 'in_progress',
        routeSnapshot: route,
        currentStepIndex: 0,
        hasAssignment: true,
      }).canComment,
    ).toBe(true);
  });

  it('allows internal comments only for active assignee', () => {
    expect(
      computeCommentPermissions({
        actorId: 'mgr-1',
        authorId: 'user-1',
        status: 'in_progress',
        routeSnapshot: route,
        currentStepIndex: 0,
        hasAssignment: true,
      }).canInternalComment,
    ).toBe(true);

    expect(
      computeCommentPermissions({
        actorId: 'user-1',
        authorId: 'user-1',
        status: 'in_progress',
        routeSnapshot: route,
        currentStepIndex: 0,
        hasAssignment: false,
      }).canInternalComment,
    ).toBe(false);
  });

  it('hides internal comments from author', () => {
    const comments = [
      { id: '1', body: 'public', isInternal: false },
      { id: '2', body: 'secret', isInternal: true },
    ];

    expect(filterCommentsForActor(comments, 'user-1', 'user-1')).toHaveLength(1);
    expect(filterCommentsForActor(comments, 'mgr-1', 'user-1')).toHaveLength(2);
  });

  it('detects active assignee', () => {
    expect(isActiveAssignee(route, 0, 'mgr-1')).toBe(true);
    expect(isActiveAssignee(route, 0, 'other')).toBe(false);
  });
});
