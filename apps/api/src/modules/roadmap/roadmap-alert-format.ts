import type {
  RoadmapAlertDetails,
  RoadmapAlertKind,
  SyncProblemAction,
} from '@tracker/shared';

const REDACTED = '[redacted]';
const ALERT_BODY_MAX = 300;
const INTEGRATIONS_PAGE = '/roadmap/admin/integrations';

const SECRET_PATTERNS: readonly RegExp[] = [
  // Everything after the webhook secret header, quoted (JSON) or not.
  /x-roadmap-webhook-secret["']?\s*:[\s\S]*/gi,
  /\b(?:Basic|Bearer)\s+\S+/gi,
  // Azure DevOps personal access tokens: 52 characters, or 84 for the newer format.
  /(?<![A-Za-z0-9])(?:[A-Za-z0-9]{52}|[A-Za-z0-9]{84})(?![A-Za-z0-9])/g,
];

/** Removes credentials from text that is stored or shown to users, then truncates it. */
export function redactSecrets(text: string, max: number): string {
  const clean = SECRET_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, REDACTED),
    text,
  );
  return clean.slice(0, max);
}

/** "1 назначение", "2 назначения", "5 назначений". */
export function pluralAssignments(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? 'назначений'
      : last === 1
        ? 'назначение'
        : last >= 2 && last <= 4
          ? 'назначения'
          : 'назначений';
  return `${n} ${word}`;
}

/** Russian title and optional body of a sync alert, shown in the notification list. */
export function formatAlert(
  kind: RoadmapAlertKind,
  details: RoadmapAlertDetails,
  projectName: string | null,
): { title: string; body: string | null } {
  const scope = projectName ? ` · ${projectName}` : '';
  switch (kind) {
    case 'sync_errors':
      return {
        title: `Ошибки отправки в Azure: ${pluralAssignments(details.count ?? 0)}${scope}`,
        body: null,
      };
    case 'sync_conflicts':
      return {
        title: `Конфликты с Azure: ${pluralAssignments(details.count ?? 0)}${scope}`,
        body: null,
      };
    case 'import_failing':
      return {
        title: `Не удаётся обновить проект из Azure${scope}`,
        body: details.error
          ? redactSecrets(details.error, ALERT_BODY_MAX)
          : null,
      };
    case 'azure_auth':
      return {
        title: `Azure DevOps отклоняет PAT (HTTP ${details.httpStatus ?? 401})`,
        body: null,
      };
    case 'webhook_silent':
      return { title: `Webhook из Azure не приходит${scope}`, body: null };
  }
}

/** Relative web-app URL an alert leads to; routes are kept here so they live in one place. */
export function alertLink(
  kind: RoadmapAlertKind,
  projectId: string | null,
): string {
  // Every kind currently links to a global admin tab; the project id is kept in
  // the signature for a future per-project plan link.
  void projectId;
  switch (kind) {
    case 'azure_auth':
      return `${INTEGRATIONS_PAGE}#azure-connection`;
    case 'webhook_silent':
      return `${INTEGRATIONS_PAGE}#azure-webhook`;
    case 'sync_errors':
    case 'sync_conflicts':
    case 'import_failing':
      return `${INTEGRATIONS_PAGE}#azure-projects`;
  }
}

const ALERT_HINTS: Record<RoadmapAlertKind, string> = {
  sync_errors:
    'Откройте назначения с ошибкой, проверьте текст ошибки и отправьте снова.',
  sync_conflicts:
    'Назначение изменили вручную в Azure. Решите, чья версия верна, и отправьте снова или примите значение из Azure.',
  import_failing:
    'Проверьте, что у PAT есть доступ к проекту, и обновите проект из Azure.',
  azure_auth:
    'Azure не принимает PAT. Выпустите новый PAT и сохраните его в подключении.',
  webhook_silent:
    'Изменения в Azure находит только опрос. Проверьте service hook в Azure DevOps.',
};

const ADMIN_ACTION_LABELS: Record<RoadmapAlertKind, string> = {
  sync_errors: 'Интеграции → Проекты',
  sync_conflicts: 'Интеграции → Проекты',
  import_failing: 'Интеграции → Проекты',
  azure_auth: 'Подключение',
  webhook_silent: 'Webhook',
};

const GLOBAL_KINDS: ReadonlySet<RoadmapAlertKind> = new Set([
  'azure_auth',
  'webhook_silent',
]);

/** «Что сделать» for a sync problem (sync problems page spec §6). */
export function alertHint(kind: RoadmapAlertKind): string {
  return ALERT_HINTS[kind];
}

/** The button of a sync problem; planners cannot open admin pages, so they get the plan. */
export function alertAction(
  kind: RoadmapAlertKind,
  projectId: string | null,
  isAdmin: boolean,
): SyncProblemAction | null {
  if (isAdmin) {
    return {
      label: ADMIN_ACTION_LABELS[kind],
      link: alertLink(kind, projectId),
    };
  }
  return GLOBAL_KINDS.has(kind)
    ? null
    : { label: 'Открыть план', link: '/roadmap' };
}
