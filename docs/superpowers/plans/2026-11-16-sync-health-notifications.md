# Sync Health Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app bell that tells admins and project planners about Azure DevOps sync problems once per episode and says when the problem is gone.

**Architecture:** A minute-interval "watchdog" reads aggregate health (allocation status counts, import outcome, auth outcome, webhook lag). Pure rules turn that into per-key open/refresh/resolve actions. The service applies them with conditional `updateMany` so only one API instance wins each transition. Only the winning instance writes per-user notification rows (`skipDuplicates`). The web polls a summary endpoint and shows a popover list.

**Tech Stack:** NestJS 11 + `@nestjs/schedule`, Prisma/PostgreSQL, Jest (API), Next.js + TanStack Query + `lucide-react` (web), `node:test` `.test.mjs` for web pure logic, shared types in `@tracker/shared`.

**Spec:** `docs/specs/notifications.md` (approved 2026-11-16). Read it first; section references (§) below point there.

## Global Constraints

- UI copy in Russian; no new UI libraries; reuse `shared/ui/popover`, `button`, `error-notice`, `lucide-react` icons.
- Migrations additive only, one new folder `apps/api/prisma/migrations/20261116090000_roadmap_notifications/`; never edit applied migrations; old `notifications` table stays `@@ignore`.
- Match neighbouring file style; do not reformat unrelated code (repo has old prettier violations).
- Scale: 20 000 work items / 3 000 allocations per project — watchdog uses aggregates (`$queryRaw` GROUP BY), never loops over allocations.
- Thresholds exactly: import failing ≥ 15 min, resolve after 10 min clear, webhook lag > 30 min, retention 90 days, interval 60 000 ms, poll 60 000 ms.
- No PAT, webhook secret or `Authorization` header text in any notification title/body.
- Users only ever see their own notifications.
- Every new web API method also in `roadmapDemo.ts` / `roadmapDemoStore.ts` (reads → empty/zero, writes → no-op).
- After shared changes: `npm run build -w @tracker/shared`.
- Screenshots go to `output/` (git-ignored), never committed.

## Review Focus

1. A project whose write-back mode is `off` but that has old `error` rows must not raise `sync_errors` — test in Task 4 (`evaluateConditions` ignores projects with `writeBackEnabled: false`).
2. Integration disconnected (no PAT at all) must not keep `azure_auth` open forever — test in Task 4 (not configured → every condition `obsolete`).
3. A planner whose access email differs only in case from `User.email` must still receive notifications, and an inactive user must not — test in Task 3.
4. Marking someone else's notification read must return 404, not silently succeed — test in Task 5.
5. Demo mode (no API) must render the bell without errors — test in Task 6 (`roadmapDemoStore` returns empty page and zero summary).

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | `RoadmapAlert`, `RoadmapNotification`, new `RoadmapAzureProjectState` fields |
| `apps/api/src/modules/roadmap/roadmap-import-health.ts` | `recordImportOutcome` — persists import success/failure per project |
| `apps/api/src/modules/roadmap/roadmap-integration.service.ts` | auth health record/read |
| `apps/api/src/modules/roadmap/roadmap-alert-rules.ts` | pure: health input → conditions → actions |
| `apps/api/src/modules/roadmap/roadmap-alert-format.ts` | pure: titles, bodies, links, secret redaction |
| `apps/api/src/modules/roadmap/roadmap-alert-recipients.ts` | who receives a given alert |
| `apps/api/src/modules/roadmap/roadmap-alerts.service.ts` | watchdog: load health, apply actions, cleanup |
| `apps/api/src/modules/roadmap/roadmap-notifications.service.ts` + `.controller.ts` | user-facing API |
| `packages/shared/src/roadmap-notifications.ts` | kinds, DTOs, query schema |
| `apps/web/src/widgets/roadmap-shell/NotificationBell.tsx` | bell, badge, popover list |
| `apps/web/src/widgets/roadmap-shell/notification-view.ts` | pure: badge state, relative time, resolution label |

---

### Task 1: Schema, migration and import outcome recording

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`RoadmapAzureProjectState` :414-424, `RoadmapProject` :381, `User` relations)
- Create: `apps/api/prisma/migrations/20261116090000_roadmap_notifications/migration.sql`
- Create: `apps/api/src/modules/roadmap/roadmap-import-health.ts`
- Modify: `apps/api/src/modules/roadmap/roadmap.service.ts:246-298` (`refreshImportedProjects`, `runProjectImport` callers, manual sync)
- Modify: `apps/api/src/modules/roadmap/roadmap-azure-sync.service.ts:1180, 2005, 2144-2162`
- Test: `apps/api/src/modules/roadmap/roadmap-import-health.spec.ts`

**Interfaces:**
- Produces:
  - Prisma models `RoadmapAlert` (`roadmap_alerts`) and `RoadmapNotification` (`roadmap_notifications`), fields exactly per spec §3.1–3.2. `RoadmapNotification.alertId` stays NOT NULL in v1.
  - `@@unique([alertId, generation, userId])` and `@@index([userId, readAt, createdAt(sort: Desc)])` on notifications; `key @unique` on alerts.
  - `RoadmapAzureProjectState` gains `importFailingSince`, `lastImportError` (VarChar 500), `lastImportFailedAt`, `lastImportOkAt`, `lastImportChangedAt` (all nullable).
  - `type ImportOutcome = { ok: true; changed: boolean; source: 'poll' | 'webhook' } | { ok: false; error: unknown }`
  - `recordImportOutcome(prisma: PrismaService, projectId: string, outcome: ImportOutcome, now?: Date): Promise<void>`

- [ ] **Step 1: Write failing tests** in `roadmap-import-health.spec.ts` with a mocked `prisma.roadmapAzureProjectState` (`upsert`, `updateMany` as `jest.fn`), in the style of `roadmap-table-preferences.spec.ts`:
  - `failure sets importFailingSince only when empty`: two failures at `t0` and `t0+5min` → stored `importFailingSince === t0`, `lastImportFailedAt === t0+5min`.
  - `success clears the failure series`: failure then `{ ok: true, changed: false, source: 'poll' }` → `importFailingSince === null`, `lastImportOkAt` set.
  - `poll with changes stamps lastImportChangedAt, webhook does not`: `{ok:true, changed:true, source:'poll'}` sets it; same with `source:'webhook'` leaves it unchanged.
  - `failure text is redacted and truncated`: error message `'Basic abc123 failed ' + 'x'.repeat(600)` → stored `lastImportError` has no `abc123` and `length <= 500`.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-import-health` → FAIL (module not found).
- [ ] **Step 3: Edit schema, then write the migration.**
  - Edit the schema.
  - Generate the SQL with `npx prisma migrate diff --from-schema-datasource apps/api/prisma/schema.prisma --to-schema-datamodel apps/api/prisma/schema.prisma --script` against a migrated local DB, and save it to the migration folder above.
  - Check the SQL: it must contain only `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` and `CREATE INDEX`.
- [ ] **Step 4: Implement `recordImportOutcome`.**
  - Failure: `upsert` (create with `importFailingSince: now`). Then, in the update path, run `updateMany({ where: { projectId, importFailingSince: null }, data: { importFailingSince: now } })` so concurrent failures keep the earliest timestamp.
  - Redaction: use `redactSecrets` from Task 2's `roadmap-alert-format.ts`. Create that file now with just `redactSecrets(text: string, max: number): string`. It must strip `(Basic|Bearer)\s+\S+`, 52-char and 84-char alphanumeric tokens and anything after `x-roadmap-webhook-secret:`, then truncate.
- [ ] **Step 5: Wire callers.**
  - `refreshImportedProjects` and the manual sync path (`runProjectImport` callers in `roadmap.service.ts`) record `{ ok: true, changed: importedWorkItems > 0, source: 'poll' }` on success and `{ ok: false, error }` on failure. Keep the existing `logger.warn`.
  - `flushWebhookImports` records `source: 'webhook'` / failure.
  - The `importWorkItems` calls at `:1180` and `:2005` record failure only. On success they record `{ ok: true, changed: false, source: 'webhook' }`, which never stamps `lastImportChangedAt`.
  - Do not change queueing.
- [ ] **Step 6: Run** `npm run db:generate && npm run test -w @tracker/api -- roadmap-import-health` → PASS; then full `npm run test -w @tracker/api` → PASS.
- [ ] **Step 7: Commit** `feat(api): persist Azure import health per project`.

---

### Task 2: Auth health and alert formatting

**Files:**
- Modify: `apps/api/src/modules/roadmap/roadmap-integration.service.ts` (`getCredentials` :96, `request` ~:245-272)
- Modify: `apps/api/src/modules/roadmap/roadmap-alert-format.ts` (created in Task 1)
- Create: `packages/shared/src/roadmap-notifications.ts`, export from `packages/shared/src/index.ts`
- Test: `apps/api/src/modules/roadmap/roadmap-auth-health.spec.ts`, `apps/api/src/modules/roadmap/roadmap-alert-format.spec.ts`

**Interfaces:**
- Produces (shared):
  ```ts
  export const ROADMAP_ALERT_KINDS = ['sync_errors', 'sync_conflicts', 'import_failing', 'azure_auth', 'webhook_silent'] as const;
  export type RoadmapAlertKind = (typeof ROADMAP_ALERT_KINDS)[number];
  export type RoadmapAlertResolution = 'fixed' | 'obsolete';
  export interface RoadmapAlertDetails { count?: number; httpStatus?: number; error?: string }
  export interface RoadmapNotificationDto {
    id: string; kind: RoadmapAlertKind; projectId: string | null; projectName: string | null;
    title: string; body: string | null; link: string; createdAt: string; readAt: string | null;
    active: boolean; resolution: RoadmapAlertResolution | null; current: RoadmapAlertDetails | null;
  }
  export interface RoadmapNotificationPage { items: RoadmapNotificationDto[]; nextCursor: string | null }
  export interface RoadmapNotificationSummary { unread: number; activeUnread: number }
  export const roadmapNotificationListQuerySchema: z.ZodType<{ cursor?: string; limit: number }>;
  // z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) })
  ```
- Produces (API):
  - `RoadmapIntegrationService.getAuthHealth(): Promise<{ authFailedAt: Date | null; authOkAt: Date | null; httpStatus: number | null }>`, stored in `system_settings` key `roadmap.integration.health`.
  - `formatAlert(kind: RoadmapAlertKind, details: RoadmapAlertDetails, projectName: string | null): { title: string; body: string | null }`
  - `alertLink(kind: RoadmapAlertKind, projectId: string | null): string`
  - `pluralAssignments(n: number): string`

- [ ] **Step 1: Write failing tests.**
  - `roadmap-alert-format.spec.ts`:
    - `formatAlert('sync_errors', { count: 5 }, 'Alpha').title === 'Ошибки отправки в Azure: 5 назначений · Alpha'`;
    - `count: 1` → `'1 назначение'`, `2` → `'2 назначения'`, `11` → `'11 назначений'`, `21` → `'21 назначение'`;
    - `formatAlert('azure_auth', { httpStatus: 401 }, null).title === 'Azure DevOps отклоняет PAT (HTTP 401)'`;
    - `formatAlert('import_failing', { error: 'Bearer secrettoken boom' }, 'Beta')` — title `'Не удаётся обновить проект из Azure · Beta'`, body contains `'boom'` and not `'secrettoken'`;
    - `sync_conflicts` → `'Конфликты с Azure: 2 назначения · Alpha'`;
    - `webhook_silent` → `'Webhook из Azure не приходит · Alpha'`;
    - body never exceeds 300 chars.
    - Links:
      - `alertLink('sync_errors', 'p1') === '/roadmap/admin/integrations#azure-projects'`; same for `sync_conflicts` and `import_failing`;
      - `alertLink('azure_auth', null) === '/roadmap/admin/integrations#azure-connection'`;
      - `alertLink('webhook_silent', 'p1') === '/roadmap/admin/integrations#azure-webhook'`.
  - `roadmap-auth-health.spec.ts`. Mock `fetch` and `prisma.systemSetting`, and stub stored settings the way existing integration specs do:
    - a 401 response writes `authFailedAt` + `httpStatus: 401` once across three 401 calls;
    - a following 200 writes `authOkAt` once;
    - a 403 writes nothing;
    - `getCredentials()` with an undecryptable PAT writes `authFailedAt` and still throws.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-alert-format roadmap-auth-health` → FAIL.
- [ ] **Step 3: Implement.**
  - Shared types: write them, then run `npm run build -w @tracker/shared`.
  - `formatAlert` / `alertLink`: titles are exactly as in the tests. Body: the redacted `details.error` (≤ 300) for `import_failing`, otherwise `null`.
  - Auth health in the integration service:
    - Private `recordAuthHealth('failed' | 'ok', httpStatus?)`. It reads the cached DB state (cache ≤ 60 s) and writes only when the new state differs.
    - Call it from `request` on `response.status === 401` (before throwing) and on `response.ok`.
    - Call it from `getCredentials` around `decryptPat`, with failure and `httpStatus: null`.
    - `testConnection` uses raw `fetch`, so it stays untouched.
- [ ] **Step 4: Run** the same tests → PASS; full API tests → PASS.
- [ ] **Step 5: Commit** `feat(api): record Azure auth health and alert texts`.

---

### Task 3: Recipients

**Files:**
- Create: `apps/api/src/modules/roadmap/roadmap-alert-recipients.ts`
- Test: `apps/api/src/modules/roadmap/roadmap-alert-recipients.spec.ts`

**Interfaces:**
- Consumes: `RoadmapAlertKind` (Task 2).
- Produces: `resolveRecipients(prisma: PrismaService, kind: RoadmapAlertKind, projectId: string | null): Promise<string[]>`, which returns unique user ids.
  - `azure_auth` and `webhook_silent` go to admins only.
  - The other kinds go to admins plus the project's planners.

- [ ] **Step 1: Write failing tests** with mocked `prisma.user.findMany` and `prisma.roadmapProjectAccess.findMany`:
  - `planner email matched case-insensitively`: access email `planner@x.test`, user email `Planner@X.test` → included. The query must use `email: { in: [...], mode: 'insensitive' }`; assert on the mock call args.
  - `inactive users excluded`: assert both queries filter `isActive: true`.
  - `admin who is also planner appears once`.
  - `viewer never included`: access query filters `role: 'planner'`.
  - `webhook_silent ignores planners`: `roadmapProjectAccess.findMany` not called.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-alert-recipients` → FAIL.
- [ ] **Step 3: Implement** `resolveRecipients` as above. Admins: `user.findMany({ where: { isActive: true, roles: { some: { role: { code: 'admin' } } } }, select: { id: true } })`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): resolve notification recipients`.

---

### Task 4: Alert rules (pure)

**Files:**
- Create: `apps/api/src/modules/roadmap/roadmap-alert-rules.ts`
- Test: `apps/api/src/modules/roadmap/roadmap-alert-rules.spec.ts`

**Interfaces:**
- Consumes: `RoadmapAlertKind`, `RoadmapAlertDetails`, `RoadmapAlertResolution` (Task 2).
- Produces:
  ```ts
  export const ALERT_INTERVAL_MS = 60_000;
  export const ALERT_CLEAR_DELAY_MS = 10 * 60_000;
  export const IMPORT_FAILING_MS = 15 * 60_000;
  export const WEBHOOK_LAG_MS = 30 * 60_000;
  export const NOTIFICATION_RETENTION_DAYS = 90;
  export interface ProjectHealth {
    id: string; name: string; writeBackEnabled: boolean; errorCount: number; conflictCount: number;
    importFailingSince: Date | null; lastImportError: string | null;
    lastWebhookAt: Date | null; lastImportChangedAt: Date | null;
  }
  export interface HealthInput {
    now: Date; integrationConfigured: boolean;
    auth: { authFailedAt: Date | null; authOkAt: Date | null; httpStatus: number | null };
    projects: ProjectHealth[];
  }
  export interface AlertCondition {
    key: string; kind: RoadmapAlertKind; projectId: string | null; projectName: string | null;
    active: boolean; obsolete: boolean; suppressed: boolean; details: RoadmapAlertDetails;
  }
  export interface AlertSnapshot { state: 'open' | 'resolved'; generation: number; clearSince: Date | null }
  export type AlertAction =
    | { type: 'open' } | { type: 'refresh' } | { type: 'start-clear' }
    | { type: 'resolve'; resolution: RoadmapAlertResolution } | { type: 'none' };
  export function alertKey(kind: RoadmapAlertKind, projectId: string | null): string; // `${kind}:${projectId ?? 'global'}`
  export function evaluateConditions(input: HealthInput, openKeys: ReadonlySet<string>): AlertCondition[];
  export function decideAlert(current: AlertSnapshot | null, condition: AlertCondition, now: Date): AlertAction;
  ```
  - `evaluateConditions` returns one `azure_auth` condition first, then five per project.
  - It also returns an `obsolete` condition for every key in `openKeys` that no longer maps to a known project.
  - `azure_auth` is active when `integrationConfigured && (authOkAt == null ? authFailedAt != null : authFailedAt > authOkAt)`.
  - When `azure_auth` is active, every project condition has `suppressed: true`.

- [ ] **Step 1: Write failing tests**, one `it` per case; `t0 = new Date('2026-11-16T10:00:00Z')`.
  - `decideAlert`:
    - `null` + active → `open`;
    - resolved + active → `open`;
    - open + active → `refresh`;
    - open + inactive + `clearSince null` → `start-clear`;
    - open + inactive + `clearSince = now − 9min` → `none`;
    - open + inactive + `clearSince = now − 10min` → `resolve/fixed`;
    - open + `obsolete` → `resolve/obsolete` regardless of `clearSince`;
    - resolved + inactive → `none`;
    - `null` + inactive → `none`;
    - open + `suppressed` → `none`;
    - `null` + active + `suppressed` → `none`.
  - `evaluateConditions`:
    - project with `errorCount: 3, writeBackEnabled: false` → `sync_errors` has `active: false, obsolete: true`;
    - `writeBackEnabled: true, errorCount: 3` → active with `details.count === 3`;
    - `importFailingSince = now − 14min` inactive, `now − 15min` active;
    - `webhook_silent`:
      - `lastWebhookAt null` → inactive;
      - `lastImportChangedAt null` → inactive;
      - `lastImportChangedAt − lastWebhookAt = 31min` → active;
      - `= 29min` → inactive;
    - auth failed after ok → `azure_auth` active and every project condition `suppressed: true`;
    - auth ok after failed → not suppressed;
    - `integrationConfigured: false` → every condition `obsolete: true`;
    - `openKeys` containing `sync_errors:gone-project` → an obsolete condition for that key.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-alert-rules` → FAIL.
- [ ] **Step 3: Implement** both functions with no I/O.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): alert rules for sync health`.

---

### Task 5: Watchdog service and notifications API

**Files:**
- Create: `apps/api/src/modules/roadmap/roadmap-alerts.service.ts`
- Create: `apps/api/src/modules/roadmap/roadmap-notifications.service.ts`
- Create: `apps/api/src/modules/roadmap/roadmap-notifications.controller.ts`
- Modify: `apps/api/src/modules/roadmap/roadmap.module.ts` (register both services and the controller)
- Test: `apps/api/src/modules/roadmap/roadmap-alerts.spec.ts`, `apps/api/src/modules/roadmap/roadmap-notifications.spec.ts`

**Interfaces:**
- Consumes:
  - `evaluateConditions`, `decideAlert`, constants (Task 4);
  - `resolveRecipients` (Task 3);
  - `formatAlert`, `alertLink` (Task 2);
  - `RoadmapIntegrationService.getAuthHealth`, `getPublicSettings`, `getSyncSettings` (existing + Task 2).
- Produces:
  - `RoadmapAlertsService.evaluate(now?: Date): Promise<void>` (decorated `@Interval(ALERT_INTERVAL_MS)` through a thin wrapper `tick()` that catches and logs);
  - `RoadmapAlertsService.loadHealth(now: Date): Promise<HealthInput>`;
  - `RoadmapNotificationsService.list(userId: string, query: unknown): Promise<RoadmapNotificationPage>`;
  - `summary(userId: string): Promise<RoadmapNotificationSummary>`;
  - `markRead(userId: string, id: string): Promise<void>` (throws `NotFoundException`);
  - `markAllRead(userId: string): Promise<void>`.
  - Routes, all under `@Controller('roadmap/notifications')`, with `@CurrentUser()` like `RoadmapTablePreferencesController`:
    - `GET /roadmap/notifications`;
    - `GET /roadmap/notifications/summary`;
    - `POST /roadmap/notifications/read-all` (204);
    - `POST /roadmap/notifications/:id/read` (204).

- [ ] **Step 1: Write failing tests.**
  - `roadmap-alerts.spec.ts`: use an in-memory fake Prisma for `roadmapAlert` and `roadmapNotification`:
    - `updateMany` honours `where.state` and returns `{ count }`;
    - `createMany` with `skipDuplicates` honours the `(alertId, generation, userId)` uniqueness.

    Stub `loadHealth` via `jest.spyOn`. Cases:
    - `first error opens one notification per recipient` (2 recipients → 2 rows, `generation 1`);
    - `five ticks with growing count create no new rows and update details.count`;
    - `clear for 5 min then error again keeps the episode` (no resolve, no new rows);
    - `clear for 10 min resolves with fixed, next error opens generation 2 with new rows`;
    - `two concurrent evaluate() calls create one row per user` (`Promise.all([svc.evaluate(t), svc.evaluate(t)])`);
    - `daily cleanup deletes notifications older than 90 days` (runs when `now`'s server-local date differs from the last cleanup date kept in memory).
  - `roadmap-notifications.spec.ts`: mocked Prisma, in the table-preferences spec style:
    - `list returns only own rows` (assert `where.userId`);
    - `active is true only when alert.state is open and generations match`;
    - `resolution comes from the alert when the episode is closed`;
    - `summary.activeUnread excludes closed episodes`;
    - `markRead on someone else's id throws NotFoundException` (`updateMany` count 0 → throw);
    - `list rejects limit=500` with `BadRequestException`.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-alerts roadmap-notifications` → FAIL.
- [ ] **Step 3: Implement `loadHealth`.**
  - Counts: one `$queryRaw` that selects `wi.project_id, a.azure_sync_status, count(*)` from `roadmap_allocations a join roadmap_work_items wi`, filtered to status `in ('error','conflict')` and grouped by both.
  - Then read `roadmapProject` (only projects with `syncedAt` not null, joined to `azureState`) and auth health.
  - `writeBackEnabled = settings.mode !== 'off' && (!settings.projectIds || settings.projectIds.includes(project.id))`, using `getSyncSettings()`. This mirrors `roadmap-azure-sync.service.ts:905`.
- [ ] **Step 4: Implement `evaluate`.** Load the open alert keys, run `evaluateConditions`, then for each condition read the alert and apply `decideAlert`:
  - `open`:
    - existing row → `updateMany({ where: { key, state: 'resolved' } })`;
    - missing row → `create`, catching P2002 as "lost the race";
    - set `state: 'open', generation: { increment: 1 }, openedAt, clearSince: null, resolvedAt: null, resolution: null, details`;
    - only on `count === 1` (or a successful create), re-read the generation, then `formatAlert` + `resolveRecipients` + `createMany({ skipDuplicates: true })`.
  - `refresh`: `update` `details` and `clearSince: null`.
  - `start-clear`: `updateMany({ where: { key, state: 'open', clearSince: null } })`.
  - `resolve`: `updateMany({ where: { key, state: 'open' } })` setting `resolved`, `resolvedAt`, `resolution`.
  - Cleanup: delete notifications older than 90 days, then resolved alerts with no notifications.
- [ ] **Step 5: Implement `RoadmapNotificationsService` and the controller.**
  - Query: parse with `roadmapNotificationListQuerySchema` (invalid → `BadRequestException`). Fetch `take: limit + 1` ordered by `createdAt desc, id desc`, with `cursor` and `skip: 1` when a cursor is given. Include `alert: { select: { state, generation, details, resolution } }` and `alert.project.name`.
  - `link` comes from `alertLink(kind, projectId)`.
  - `active = alert.state === 'open' && alert.generation === row.generation`.
  - `current` is `alert.details` when active, else `null`.
  - `resolution` is `alert.resolution` when not active and the generation matches; a newer generation means the old episode was `fixed`.
- [ ] **Step 6: Run** the two spec files → PASS. Then run:
  - full `npm run test -w @tracker/api` → PASS;
  - `npm run test:e2e -w @tracker/api` → PASS (the existing access e2e still works with the new controller registered);
  - `npm run lint -w @tracker/api` → no new errors.
- [ ] **Step 7: Commit** `feat(api): sync health watchdog and notifications API`.

---

### Task 6: Web bell

**Files:**
- Create: `apps/web/src/widgets/roadmap-shell/notification-view.ts`
- Create: `apps/web/src/widgets/roadmap-shell/notification-view.test.mjs`
- Create: `apps/web/src/widgets/roadmap-shell/NotificationBell.tsx`
- Modify: `apps/web/src/widgets/roadmap-shell/RoadmapFrame.tsx:348-366` (render `<NotificationBell />` before `<TourLauncherIcon />`)
- Modify: `apps/web/src/widgets/roadmap-shell/RoadmapFrameSkeleton.tsx:39` (one more `size-9` placeholder)
- Modify: `apps/web/src/entities/roadmap/api/roadmapApi.ts`, `roadmapDemo.ts`, `roadmapDemoStore.ts`

**Interfaces:**
- Consumes: the shared DTOs (Task 2) and the routes (Task 5).
- Produces:
  - `roadmapApi.notifications(cursor?: string): Promise<RoadmapNotificationPage>`, plus `notificationSummary()`, `markNotificationRead(id: string)` and `markAllNotificationsRead()`, with the same names in the demo API;
  - `badgeOf(summary: RoadmapNotificationSummary | undefined): { kind: 'count'; label: string } | { kind: 'dot' } | null` (labels above 9 become `'9+'`);
  - `statusLabel(item: RoadmapNotificationDto): string | null` (`'исправлено'` / `'больше не актуально'` / `null` when active).

- [ ] **Step 1: Write failing tests** in `notification-view.test.mjs` (`node:test` + `assert/strict`, importing `./notification-view.ts` like `shared/lib/error-message.test.mjs`):
  - `badgeOf`:
    - `{unread:0, activeUnread:0}` → `null`;
    - `{unread:2, activeUnread:0}` → `{kind:'dot'}`;
    - `{unread:3, activeUnread:3}` → `{kind:'count', label:'3'}`;
    - `activeUnread:12` → label `'9+'`;
    - `undefined` → `null`.
  - `statusLabel`:
    - an active item → `null`;
    - `resolution:'fixed'` → `'исправлено'`;
    - `'obsolete'` → `'больше не актуально'`.
  - A test asserting that the `roadmapDemoStore` reads return `{ items: [], nextCursor: null }` and `{ unread: 0, activeUnread: 0 }`. Import the store's handler; if it cannot be imported under `node --test`, cover this with a manual demo-mode check in Step 5 instead.
- [ ] **Step 2: Run** `node --test apps/web/src/widgets/roadmap-shell/notification-view.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `notification-view.ts`, the API and demo methods, and `NotificationBell.tsx`.
  - Queries:
    - `useQuery(['roadmap','notifications','summary'], …, { refetchInterval: 60_000, refetchOnWindowFocus: true })`;
    - the list query is enabled only while the popover is open, and uses `useInfiniteQuery` for «Показать ещё».
  - Item click: `markNotificationRead` mutation, then `router.push(item.link)`, then invalidate both queries.
  - «Прочитать все» calls `markAllNotificationsRead`.
  - Copy:
    - empty state: «Всё спокойно — проблем с синхронизацией нет»;
    - error state: `ErrorNotice`.
  - Layout:
    - the button uses the same classes as the neighbouring header buttons;
    - `aria-label="Уведомления"`;
    - the popover is `w-[min(24rem,calc(100vw-2rem))]`.
- [ ] **Step 4: Run** the `node --test` file → PASS; `npm run lint -w @tracker/web` and `npx tsc --noEmit -p apps/web` → no new errors.
- [ ] **Step 5: Verify in browser.**
  - Run `npm run dev` via preview, log in as admin, and set an allocation's status with SQL: `update roadmap_allocations set azure_sync_status='error' where id='<id>'` on a project with write-back on.
  - Within ~1 min the bell shows `1` and the item reads «Ошибки отправки в Azure: 1 назначение · …». Clicking it opens `/roadmap/admin/integrations#azure-projects` and clears the badge.
  - Reset the status. After about 10 minutes, or by temporarily lowering `ALERT_CLEAR_DELAY_MS` locally and never committing that change, the item shows «исправлено».
  - At 375 px the bell fits and the popover has no horizontal scroll.
  - Demo mode renders the empty state.
  - Save screenshots to `output/`.
- [ ] **Step 6: Commit** `feat(web): notification bell for sync health` (exclude `output/`).

---

### Task 7: Documentation and final verification

**Files:**
- Modify: `docs/13-roadmap.md` (new section «Уведомления» after «Two-way sync»)

- [ ] **Step 1: Write the section.** Cover:
  - the five kinds and who receives each;
  - the 15 / 10 / 30 minute thresholds and the 90-day retention;
  - the two closed labels;
  - that 403 does not count as a rejected PAT;
  - that only in-app delivery exists.
- [ ] **Step 2: Run** `npm run build`, `npm run test`, `npm run lint` from the root → all pass.
- [ ] **Step 3: Commit** `docs(roadmap): document sync health notifications`.
