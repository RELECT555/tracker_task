import type {
  RoadmapAlertDetails,
  RoadmapAlertKind,
  RoadmapAlertResolution,
} from '@tracker/shared';

export const ALERT_INTERVAL_MS = 60_000;
export const ALERT_CLEAR_DELAY_MS = 10 * 60_000;
export const IMPORT_FAILING_MS = 15 * 60_000;
export const WEBHOOK_LAG_MS = 30 * 60_000;
export const NOTIFICATION_RETENTION_DAYS = 90;

export interface ProjectHealth {
  id: string;
  name: string;
  writeBackEnabled: boolean;
  errorCount: number;
  conflictCount: number;
  importFailingSince: Date | null;
  lastImportError: string | null;
  lastWebhookAt: Date | null;
  lastImportChangedAt: Date | null;
}

export interface HealthInput {
  now: Date;
  integrationConfigured: boolean;
  auth: {
    authFailedAt: Date | null;
    authOkAt: Date | null;
    httpStatus: number | null;
  };
  projects: ProjectHealth[];
}

export interface AlertCondition {
  key: string;
  kind: RoadmapAlertKind;
  projectId: string | null;
  projectName: string | null;
  /** The problem exists right now. */
  active: boolean;
  /** The problem no longer makes sense, so an open episode closes at once. */
  obsolete: boolean;
  /** Another problem (a rejected PAT) already explains this one. */
  suppressed: boolean;
  details: RoadmapAlertDetails;
}

export interface AlertSnapshot {
  state: 'open' | 'resolved';
  generation: number;
  clearSince: Date | null;
}

export type AlertAction =
  | { type: 'open' }
  | { type: 'refresh' }
  | { type: 'start-clear' }
  | { type: 'resolve'; resolution: RoadmapAlertResolution }
  | { type: 'none' };

export function alertKey(
  kind: RoadmapAlertKind,
  projectId: string | null,
): string {
  return `${kind}:${projectId ?? 'global'}`;
}

function isAzureAuthFailing(auth: HealthInput['auth']): boolean {
  if (!auth.authFailedAt) return false;
  if (!auth.authOkAt) return true;
  return auth.authFailedAt.getTime() > auth.authOkAt.getTime();
}

function evaluateProject(
  project: ProjectHealth,
  input: HealthInput,
  suppressed: boolean,
): AlertCondition[] {
  const { now, integrationConfigured } = input;
  const make = (
    kind: RoadmapAlertKind,
    active: boolean,
    obsolete: boolean,
    details: RoadmapAlertDetails,
  ): AlertCondition => ({
    key: alertKey(kind, project.id),
    kind,
    projectId: project.id,
    projectName: project.name,
    active: active && !obsolete,
    obsolete,
    suppressed,
    details,
  });

  const writesBack = integrationConfigured && project.writeBackEnabled;
  const importFailing =
    project.importFailingSince !== null &&
    now.getTime() - project.importFailingSince.getTime() >= IMPORT_FAILING_MS;
  const webhookSilent =
    project.lastWebhookAt !== null &&
    project.lastImportChangedAt !== null &&
    project.lastImportChangedAt.getTime() - project.lastWebhookAt.getTime() >
      WEBHOOK_LAG_MS;

  return [
    make('sync_errors', project.errorCount >= 1, !writesBack, {
      count: project.errorCount,
    }),
    make('sync_conflicts', project.conflictCount >= 1, !writesBack, {
      count: project.conflictCount,
    }),
    make('import_failing', importFailing, !integrationConfigured, {
      error: project.lastImportError ?? undefined,
    }),
    make('webhook_silent', webhookSilent, !integrationConfigured, {}),
  ];
}

function parseOpenKey(key: string): AlertCondition {
  const separator = key.indexOf(':');
  const kind = key.slice(0, separator) as RoadmapAlertKind;
  const rawProjectId = key.slice(separator + 1);
  return {
    key,
    kind,
    projectId: rawProjectId === 'global' ? null : rawProjectId,
    projectName: null,
    active: false,
    obsolete: true,
    suppressed: false,
    details: {},
  };
}

/**
 * Turns a health snapshot into one condition per alert key: the global
 * `azure_auth` first, then four per project, then an obsolete condition for
 * every open key that no longer maps to anything known.
 */
export function evaluateConditions(
  input: HealthInput,
  openKeys: ReadonlySet<string>,
): AlertCondition[] {
  const authActive =
    input.integrationConfigured && isAzureAuthFailing(input.auth);

  const conditions: AlertCondition[] = [
    {
      key: alertKey('azure_auth', null),
      kind: 'azure_auth',
      projectId: null,
      projectName: null,
      active: authActive,
      obsolete: !input.integrationConfigured,
      suppressed: false,
      details: { httpStatus: input.auth.httpStatus ?? undefined },
    },
  ];

  for (const project of input.projects) {
    conditions.push(...evaluateProject(project, input, authActive));
  }

  const known = new Set(conditions.map((condition) => condition.key));
  for (const key of openKeys) {
    if (!known.has(key)) conditions.push(parseOpenKey(key));
  }
  return conditions;
}

/** Decides what to do with one alert, given its stored episode (if any). */
export function decideAlert(
  current: AlertSnapshot | null,
  condition: AlertCondition,
  now: Date,
): AlertAction {
  const isOpen = current?.state === 'open';

  if (condition.obsolete) {
    return isOpen
      ? { type: 'resolve', resolution: 'obsolete' }
      : { type: 'none' };
  }
  if (condition.suppressed) return { type: 'none' };

  if (condition.active) {
    return isOpen ? { type: 'refresh' } : { type: 'open' };
  }

  if (!current || !isOpen) return { type: 'none' };
  if (!current.clearSince) return { type: 'start-clear' };
  return now.getTime() - current.clearSince.getTime() >= ALERT_CLEAR_DELAY_MS
    ? { type: 'resolve', resolution: 'fixed' }
    : { type: 'none' };
}
