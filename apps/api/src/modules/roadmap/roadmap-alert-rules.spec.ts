import {
  alertKey,
  decideAlert,
  evaluateConditions,
  type AlertCondition,
  type AlertSnapshot,
  type HealthInput,
  type ProjectHealth,
} from './roadmap-alert-rules';

const t0 = new Date('2026-11-16T10:00:00Z');
const minutesBefore = (date: Date, minutes: number) =>
  new Date(date.getTime() - minutes * 60_000);

function condition(overrides: Partial<AlertCondition> = {}): AlertCondition {
  return {
    key: 'sync_errors:p1',
    kind: 'sync_errors',
    projectId: 'p1',
    projectName: 'Project 1',
    active: false,
    obsolete: false,
    suppressed: false,
    details: {},
    ...overrides,
  };
}

function snapshot(overrides: Partial<AlertSnapshot> = {}): AlertSnapshot {
  return { state: 'open', generation: 1, clearSince: null, ...overrides };
}

function project(overrides: Partial<ProjectHealth> = {}): ProjectHealth {
  return {
    id: 'p1',
    name: 'Project 1',
    writeBackEnabled: true,
    errorCount: 0,
    conflictCount: 0,
    importFailingSince: null,
    lastImportError: null,
    lastWebhookAt: null,
    lastImportChangedAt: null,
    ...overrides,
  };
}

function health(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    now: t0,
    integrationConfigured: true,
    auth: { authFailedAt: null, authOkAt: null, httpStatus: null },
    projects: [project()],
    ...overrides,
  };
}

function find(
  conditions: AlertCondition[],
  kind: AlertCondition['kind'],
  projectId: string | null = 'p1',
): AlertCondition {
  const found = conditions.find(
    (c) => c.kind === kind && c.projectId === projectId,
  );
  if (!found) throw new Error(`no ${kind} condition for ${projectId}`);
  return found;
}

describe('alertKey', () => {
  it('uses the project id, or "global" without one', () => {
    expect(alertKey('sync_errors', 'p1')).toBe('sync_errors:p1');
    expect(alertKey('azure_auth', null)).toBe('azure_auth:global');
  });
});

describe('decideAlert', () => {
  it('opens a problem that has no episode yet', () => {
    expect(decideAlert(null, condition({ active: true }), t0)).toEqual({
      type: 'open',
    });
  });

  it('reopens a resolved problem that is active again', () => {
    expect(
      decideAlert(
        snapshot({ state: 'resolved' }),
        condition({ active: true }),
        t0,
      ),
    ).toEqual({ type: 'open' });
  });

  it('refreshes an open problem that is still active', () => {
    expect(decideAlert(snapshot(), condition({ active: true }), t0)).toEqual({
      type: 'refresh',
    });
  });

  it('starts the clear timer when an open problem first goes inactive', () => {
    expect(decideAlert(snapshot(), condition(), t0)).toEqual({
      type: 'start-clear',
    });
  });

  it('keeps waiting while the problem has been clear for 9 minutes', () => {
    const current = snapshot({ clearSince: minutesBefore(t0, 9) });
    expect(decideAlert(current, condition(), t0)).toEqual({ type: 'none' });
  });

  it('resolves as fixed once the problem has been clear for 10 minutes', () => {
    const current = snapshot({ clearSince: minutesBefore(t0, 10) });
    expect(decideAlert(current, condition(), t0)).toEqual({
      type: 'resolve',
      resolution: 'fixed',
    });
  });

  it('resolves an obsolete open problem at once, whatever the clear timer says', () => {
    const obsolete = condition({ obsolete: true });
    expect(decideAlert(snapshot(), obsolete, t0)).toEqual({
      type: 'resolve',
      resolution: 'obsolete',
    });
    expect(
      decideAlert(snapshot({ clearSince: minutesBefore(t0, 1) }), obsolete, t0),
    ).toEqual({ type: 'resolve', resolution: 'obsolete' });
  });

  it('resolves an obsolete open problem even when it is suppressed', () => {
    expect(
      decideAlert(
        snapshot(),
        condition({ obsolete: true, suppressed: true }),
        t0,
      ),
    ).toEqual({ type: 'resolve', resolution: 'obsolete' });
  });

  it('does nothing for a resolved problem that is inactive', () => {
    expect(
      decideAlert(snapshot({ state: 'resolved' }), condition(), t0),
    ).toEqual({ type: 'none' });
  });

  it('does nothing for an unknown problem that is inactive', () => {
    expect(decideAlert(null, condition(), t0)).toEqual({ type: 'none' });
  });

  it('does nothing for an obsolete problem that is not open', () => {
    const obsolete = condition({ obsolete: true });
    expect(decideAlert(null, obsolete, t0)).toEqual({ type: 'none' });
    expect(decideAlert(snapshot({ state: 'resolved' }), obsolete, t0)).toEqual({
      type: 'none',
    });
  });

  it('leaves an open suppressed problem untouched', () => {
    expect(
      decideAlert(
        snapshot(),
        condition({ active: true, suppressed: true }),
        t0,
      ),
    ).toEqual({ type: 'none' });
  });

  it('does not open a suppressed problem', () => {
    expect(
      decideAlert(null, condition({ active: true, suppressed: true }), t0),
    ).toEqual({ type: 'none' });
  });
});

describe('evaluateConditions', () => {
  it('returns azure_auth first, then the four project kinds per project', () => {
    const result = evaluateConditions(
      health({
        projects: [project(), project({ id: 'p2', name: 'Project 2' })],
      }),
      new Set(),
    );
    expect(result.map((c) => c.key)).toEqual([
      'azure_auth:global',
      'sync_errors:p1',
      'sync_conflicts:p1',
      'import_failing:p1',
      'webhook_silent:p1',
      'sync_errors:p2',
      'sync_conflicts:p2',
      'import_failing:p2',
      'webhook_silent:p2',
    ]);
    expect(result[0]).toMatchObject({
      kind: 'azure_auth',
      projectId: null,
      projectName: null,
    });
    expect(result[1]).toMatchObject({
      projectId: 'p1',
      projectName: 'Project 1',
    });
  });

  describe('sync_errors and sync_conflicts', () => {
    it('treats a project without write-back as obsolete, not active', () => {
      const result = evaluateConditions(
        health({
          projects: [
            project({
              errorCount: 3,
              conflictCount: 2,
              writeBackEnabled: false,
            }),
          ],
        }),
        new Set(),
      );
      expect(find(result, 'sync_errors')).toMatchObject({
        active: false,
        obsolete: true,
      });
      expect(find(result, 'sync_conflicts')).toMatchObject({
        active: false,
        obsolete: true,
      });
    });

    it('is active with the count when write-back is on', () => {
      const result = evaluateConditions(
        health({ projects: [project({ errorCount: 3, conflictCount: 2 })] }),
        new Set(),
      );
      expect(find(result, 'sync_errors')).toMatchObject({
        active: true,
        obsolete: false,
        details: { count: 3 },
      });
      expect(find(result, 'sync_conflicts')).toMatchObject({
        active: true,
        obsolete: false,
        details: { count: 2 },
      });
    });

    it('is inactive but not obsolete when write-back is on and the count is zero', () => {
      const result = evaluateConditions(health(), new Set());
      expect(find(result, 'sync_errors')).toMatchObject({
        active: false,
        obsolete: false,
      });
      expect(find(result, 'sync_conflicts')).toMatchObject({
        active: false,
        obsolete: false,
      });
    });
  });

  describe('import_failing', () => {
    it('is inactive after 14 minutes of failures', () => {
      const result = evaluateConditions(
        health({
          projects: [project({ importFailingSince: minutesBefore(t0, 14) })],
        }),
        new Set(),
      );
      expect(find(result, 'import_failing').active).toBe(false);
    });

    it('is active after 15 minutes of failures and carries the error', () => {
      const result = evaluateConditions(
        health({
          projects: [
            project({
              importFailingSince: minutesBefore(t0, 15),
              lastImportError: 'azure down',
            }),
          ],
        }),
        new Set(),
      );
      expect(find(result, 'import_failing')).toMatchObject({
        active: true,
        details: { error: 'azure down' },
      });
    });

    it('is inactive when the import is not failing', () => {
      const result = evaluateConditions(health(), new Set());
      expect(find(result, 'import_failing').active).toBe(false);
    });
  });

  describe('webhook_silent', () => {
    function webhookCondition(
      lastWebhookAt: Date | null,
      lastImportChangedAt: Date | null,
    ) {
      return find(
        evaluateConditions(
          health({
            projects: [project({ lastWebhookAt, lastImportChangedAt })],
          }),
          new Set(),
        ),
        'webhook_silent',
      );
    }

    it('is inactive when the project never had a webhook', () => {
      expect(webhookCondition(null, t0).active).toBe(false);
    });

    it('is inactive when polling never found changes', () => {
      expect(webhookCondition(minutesBefore(t0, 60), null).active).toBe(false);
    });

    it('is active when polling found changes 31 minutes ago and no webhook followed', () => {
      const changedAt = minutesBefore(t0, 31);
      const webhookAt = minutesBefore(changedAt, 60);
      expect(webhookCondition(webhookAt, changedAt)).toMatchObject({
        active: true,
        details: {},
      });
    });

    it('is inactive when polling found changes only 29 minutes ago', () => {
      const changedAt = minutesBefore(t0, 29);
      const webhookAt = minutesBefore(changedAt, 60);
      expect(webhookCondition(webhookAt, changedAt).active).toBe(false);
    });

    it('is inactive when polling found changes exactly 30 minutes ago', () => {
      const changedAt = minutesBefore(t0, 30);
      const webhookAt = minutesBefore(changedAt, 60);
      expect(webhookCondition(webhookAt, changedAt).active).toBe(false);
    });

    it('is inactive when a webhook arrived after the polled change', () => {
      const changedAt = minutesBefore(t0, 60);
      const webhookAt = minutesBefore(t0, 45);
      expect(webhookCondition(webhookAt, changedAt).active).toBe(false);
    });
  });

  describe('azure_auth and suppression', () => {
    const suppressedKinds = (conditions: AlertCondition[]) =>
      conditions
        .filter((c) => c.suppressed)
        .map((c) => c.kind)
        .sort();
    const noisyProject = project({
      errorCount: 1,
      importFailingSince: minutesBefore(t0, 20),
    });

    it('is active, with the status, when auth failed after it last worked', () => {
      const result = evaluateConditions(
        health({
          auth: {
            authFailedAt: minutesBefore(t0, 1),
            authOkAt: minutesBefore(t0, 5),
            httpStatus: 401,
          },
          projects: [noisyProject],
        }),
        new Set(),
      );
      expect(find(result, 'azure_auth', null)).toMatchObject({
        key: 'azure_auth:global',
        active: true,
        obsolete: false,
        suppressed: false,
        details: { httpStatus: 401 },
      });
      const projectConditions = result.filter((c) => c.projectId === 'p1');
      expect(projectConditions).toHaveLength(4);
      expect(suppressedKinds(projectConditions)).toEqual([
        'import_failing',
        'sync_errors',
        'webhook_silent',
      ]);
    });

    it('never suppresses sync_conflicts while auth is failing', () => {
      const result = evaluateConditions(
        health({
          auth: {
            authFailedAt: minutesBefore(t0, 1),
            authOkAt: null,
            httpStatus: 401,
          },
          projects: [project({ conflictCount: 2 })],
        }),
        new Set(),
      );
      expect(find(result, 'sync_conflicts')).toMatchObject({
        active: true,
        suppressed: false,
      });
    });

    it('keeps suppressing while the azure_auth episode is still open after recovery', () => {
      const result = evaluateConditions(
        health({
          auth: {
            authFailedAt: minutesBefore(t0, 5),
            authOkAt: minutesBefore(t0, 1),
            httpStatus: 401,
          },
          projects: [noisyProject],
        }),
        new Set(['azure_auth:global']),
      );
      expect(find(result, 'azure_auth', null).active).toBe(false);
      expect(suppressedKinds(result)).toEqual([
        'import_failing',
        'sync_errors',
        'webhook_silent',
      ]);
      expect(find(result, 'sync_conflicts').suppressed).toBe(false);
    });

    it('is active when auth failed and never succeeded', () => {
      const result = evaluateConditions(
        health({
          auth: {
            authFailedAt: minutesBefore(t0, 1),
            authOkAt: null,
            httpStatus: null,
          },
        }),
        new Set(),
      );
      const auth = find(result, 'azure_auth', null);
      expect(auth.active).toBe(true);
      expect(auth.details).toEqual({ httpStatus: undefined });
    });

    it('is inactive and suppresses nothing when auth worked after it failed', () => {
      const result = evaluateConditions(
        health({
          auth: {
            authFailedAt: minutesBefore(t0, 5),
            authOkAt: minutesBefore(t0, 1),
            httpStatus: 401,
          },
          projects: [noisyProject],
        }),
        new Set(),
      );
      expect(find(result, 'azure_auth', null).active).toBe(false);
      expect(result.some((c) => c.suppressed)).toBe(false);
    });

    it('is inactive when auth never failed', () => {
      expect(
        find(evaluateConditions(health(), new Set()), 'azure_auth', null)
          .active,
      ).toBe(false);
    });
  });

  describe('integration not configured', () => {
    it('marks every condition obsolete and inactive, including azure_auth', () => {
      const result = evaluateConditions(
        health({
          integrationConfigured: false,
          auth: {
            authFailedAt: minutesBefore(t0, 1),
            authOkAt: null,
            httpStatus: 401,
          },
          projects: [
            project({
              errorCount: 3,
              importFailingSince: minutesBefore(t0, 30),
            }),
          ],
        }),
        new Set(),
      );
      expect(result).toHaveLength(5);
      expect(result.every((c) => c.obsolete)).toBe(true);
      expect(result.every((c) => !c.active)).toBe(true);
      expect(result.every((c) => !c.suppressed)).toBe(true);
    });
  });

  describe('open keys without a known project', () => {
    it('adds an obsolete condition parsed from the key', () => {
      const result = evaluateConditions(
        health(),
        new Set(['sync_errors:gone-project']),
      );
      const gone = result.find((c) => c.key === 'sync_errors:gone-project');
      expect(gone).toEqual({
        key: 'sync_errors:gone-project',
        kind: 'sync_errors',
        projectId: 'gone-project',
        projectName: null,
        active: false,
        obsolete: true,
        suppressed: false,
        details: {},
      });
    });

    it('does not duplicate keys that map to known conditions', () => {
      const result = evaluateConditions(
        health(),
        new Set(['sync_errors:p1', 'azure_auth:global']),
      );
      const keys = result.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toHaveLength(5);
    });
  });
});
