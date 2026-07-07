import { Request } from './request.entity';
import { InvalidTransitionError } from '../../../shared/domain/domain.error';

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

  it('submits draft', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });

    request.submit();
    expect(request.status).toBe('submitted');
    expect(request.submittedAt).toBeInstanceOf(Date);
  });

  it('cannot submit non-draft', () => {
    const request = Request.create({
      id: 'req-1',
      typeId: 'type-1',
      authorId: 'user-1',
      title: 'Test',
    });
    request.submit();

    expect(() => request.submit()).toThrow(InvalidTransitionError);
  });
});
