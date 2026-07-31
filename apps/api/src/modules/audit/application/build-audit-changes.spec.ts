import { buildAuditChanges } from './build-audit-changes';

describe('buildAuditChanges', () => {
  it('returns only changed keys', () => {
    const changes = buildAuditChanges(
      { fullName: 'Anna', isActive: true, roles: ['employee'] },
      { fullName: 'Anna Kuznetsova', isActive: true, roles: ['employee', 'manager'] },
    );

    expect(changes).toEqual({
      fullName: { from: 'Anna', to: 'Anna Kuznetsova' },
      roles: { from: ['employee'], to: ['employee', 'manager'] },
    });
  });

  it('returns undefined when nothing changed', () => {
    expect(
      buildAuditChanges({ isActive: true }, { isActive: true }),
    ).toBeUndefined();
  });
});
