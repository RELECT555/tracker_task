import { AccessDeniedError, InvalidTransitionError } from '../../../shared/domain/domain.error';
import type { RouteSnapshot } from '@tracker/shared';
import { Request } from './request.entity';

const sampleRoute: RouteSnapshot = {
  templateId: 'route-1',
  templateVersion: 1,
  steps: [
    {
      index: 0,
      name: 'Manager approval',
      assignee: { id: 'mgr-1', fullName: 'Manager' },
      status: 'active',
      slaHours: 24,
      dueAt: null,
    },
  ],
};

const twoStepRoute: RouteSnapshot = {
  templateId: 'route-2',
  templateVersion: 1,
  steps: [
    {
      index: 0,
      name: 'Manager approval',
      assignee: { id: 'mgr-1', fullName: 'Manager' },
      status: 'active',
      slaHours: 24,
      dueAt: null,
    },
    {
      index: 1,
      name: 'Director approval',
      assignee: { id: 'dir-1', fullName: 'Director' },
      status: 'pending',
      slaHours: 48,
      dueAt: null,
    },
  ],
};

describe('Request', () => {
  it('creates draft request', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test request',
    });

    expect(request.status).toBe('draft');
    expect(request.pullEvents()).toHaveLength(1);
  });

  it('rejects empty title', () => {
    expect(() =>
      Request.create({
        id: 'req-1',
        typeId: 'type-1',
        authorId: 'user-1',
        title: '   ',
      }),
    ).toThrow();
  });

  it('submits draft with route', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });

    request.submitWithRoute(sampleRoute);
    expect(request.status).toBe('in_progress');
    expect(request.submittedAt).toBeInstanceOf(Date);
    expect(request.currentStepIndex).toBe(0);
    expect(request.routeSnapshot).toEqual(sampleRoute);
    expect(request.pullEvents()).toHaveLength(2);
  });

  it('cannot submit non-draft', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);

    expect(() => request.submitWithRoute(sampleRoute)).toThrow(InvalidTransitionError);
  });

  it('approves final step and marks request approved', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);

    const result = request.approve('mgr-1');

    expect(result.kind).toBe('completed');
    expect(request.status).toBe('approved');
    expect(request.completedAt).toBeInstanceOf(Date);
    expect((request.routeSnapshot as RouteSnapshot).steps[0]?.status).toBe('completed');
  });

  it('approves intermediate step and advances route', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(twoStepRoute);

    const result = request.approve('mgr-1');

    expect(result.kind).toBe('advanced');
    expect(request.status).toBe('in_progress');
    expect(request.currentStepIndex).toBe(1);
    expect((request.routeSnapshot as RouteSnapshot).steps[1]?.status).toBe('active');
  });

  it('rejects request by active assignee', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);

    request.reject('mgr-1');

    expect(request.status).toBe('rejected');
    expect(request.completedAt).toBeInstanceOf(Date);
  });

  it('denies approve for non-assignee', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);

    expect(() => request.approve('other-user')).toThrow(AccessDeniedError);
  });

  it('cancels draft by author', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });

    request.cancel('user-1');

    expect(request.status).toBe('cancelled');
    expect(request.completedAt).toBeInstanceOf(Date);
  });

  it('cancels in-progress request and skips active route steps', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(twoStepRoute);

    request.cancel('user-1');

    expect(request.status).toBe('cancelled');
    const route = request.routeSnapshot as RouteSnapshot;
    expect(route.steps[0]?.status).toBe('skipped');
    expect(route.steps[1]?.status).toBe('skipped');
  });

  it('denies cancel for non-author', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });

    expect(() => request.cancel('other-user')).toThrow(AccessDeniedError);
  });

  it('denies cancel for terminal status', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);
    request.approve('mgr-1');

    expect(() => request.cancel('user-1')).toThrow(InvalidTransitionError);
  });

  it('requests info from author by active assignee', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);

    request.requestInfo('mgr-1');

    expect(request.status).toBe('pending_info');
  });

  it('provides info by author and returns to in_progress', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
      fields: { dateFrom: '2026-07-01' },
    });
    request.submitWithRoute(sampleRoute);
    request.requestInfo('mgr-1');

    const result = request.provideInfo('user-1', { dateTo: '2026-07-20' });

    expect(request.status).toBe('in_progress');
    expect(request.fields).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-20' });
    expect(result.assigneeId).toBe('mgr-1');
  });

  it('denies provide info for non-author', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submitWithRoute(sampleRoute);
    request.requestInfo('mgr-1');

    expect(() => request.provideInfo('other-user', {})).toThrow(AccessDeniedError);
  });
});
