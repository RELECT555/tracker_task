import type { RouteSnapshot } from '@tracker/shared';
import { canViewRequest } from './request.access';

describe('canViewRequest', () => {
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

  const base = {
    authorId: 'user-1',
    status: 'in_progress',
    routeSnapshot: route,
    hasAssignment: false,
    isAdmin: false,
  };

  it('denies anonymous access', () => {
    expect(canViewRequest({ ...base, actorId: undefined })).toBe(false);
  });

  it('denies an unrelated user', () => {
    expect(canViewRequest({ ...base, actorId: 'stranger' })).toBe(false);
  });

  it('allows the author', () => {
    expect(canViewRequest({ ...base, actorId: 'user-1' })).toBe(true);
  });

  it('allows a route participant', () => {
    expect(canViewRequest({ ...base, actorId: 'mgr-1' })).toBe(true);
  });

  it('allows a user with an assignment even without a route snapshot', () => {
    expect(
      canViewRequest({
        ...base,
        actorId: 'mgr-2',
        routeSnapshot: null,
        hasAssignment: true,
      }),
    ).toBe(true);
  });

  it('allows an admin', () => {
    expect(canViewRequest({ ...base, actorId: 'boss', isAdmin: true })).toBe(
      true,
    );
  });

  it('hides a draft from everyone but its author and admins', () => {
    const draft = { ...base, status: 'draft', routeSnapshot: null };
    expect(canViewRequest({ ...draft, actorId: 'mgr-1' })).toBe(false);
    expect(canViewRequest({ ...draft, actorId: 'user-1' })).toBe(true);
    expect(canViewRequest({ ...draft, actorId: 'boss', isAdmin: true })).toBe(
      true,
    );
  });
});
