# Sync Problems Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a journal of sync-problem episodes, show them on a `/roadmap/sync` dashboard with history and «что сделать», and redesign the bell popover.

**Architecture:**
- **Journal.** A new `roadmap_alert_episodes` table. The existing watchdog writes to it inside the same conditional transitions it already uses.
- **API.** A new access-scoped endpoint lists problems (one row per alert key with its latest episode) and their history.
- **Web.** A new page, plus a redesigned popover. Both share one set of pure view helpers.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL, Jest; Next.js + TanStack Query + Tailwind + `lucide-react`; `node:test` for web pure logic; shared types in `@tracker/shared`.

**Spec:** `docs/specs/sync-problems-page.md` (approved 2026-11-16). It extends `docs/specs/notifications.md`, which is already implemented. § references point to the new spec.

## Global Constraints

- UI copy in Russian; no new UI libraries; existing theme tokens only (destructive / success / muted), light and dark.
- One additive migration `apps/api/prisma/migrations/20261116140000_roadmap_alert_episodes/`; never edit applied migrations.
- Episode retention 90 days. Recurrence window 7 days ending at the latest episode's `openedAt`. `fixed` episodes end at the alert's `clearSince`, `obsolete` at `now`.
- Access is filtered in the DB query:
  - admins see everything;
  - planners see only projects where they are `planner`, never `azure_auth` / `webhook_silent`;
  - everyone else gets 403.
- No raw (unredacted) error text anywhere; only `details.error` already produced by `redactSecrets`.
- List row = alert key with its latest episode; never one row per episode.
- Every new web API method also in `roadmapDemo.ts` / `roadmapDemoStore.ts`.
- After shared changes: `npm run build -w @tracker/shared`.
- The user commits concurrently on this branch: stage only your own files by explicit path. Screenshots go to `output/` and are never committed.

## Review Focus

1. **A problem opened before the migration** must get an episode on its first refresh or resolve, using `openedAt = alert.openedAt`. Test in Task 1.
2. **A planner who is also a viewer of another project** must not see or filter by the viewer project. Test in Task 2.
3. **A resolved alert with episodes but no notifications** must survive daily cleanup. Test in Task 1.
4. **The popover's «сейчас: N»** must hide when the live count equals the count at opening. Test in Task 3.
5. **A demo-mode admin** must see the page's empty state, not an error. Test in Task 4.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` + migration | `RoadmapAlertEpisode` |
| `apps/api/src/modules/roadmap/roadmap-alert-episodes.ts` | episode writes used by the watchdog (pure-ish helpers taking a tx) |
| `apps/api/src/modules/roadmap/roadmap-alerts.service.ts` | call episode helpers from open/refresh/resolve/cleanup |
| `apps/api/src/modules/roadmap/roadmap-alert-format.ts` | add `alertHint`, `alertAction` |
| `apps/api/src/modules/roadmap/roadmap-sync-problems.service.ts` + `.controller.ts` | list + history with access |
| `apps/api/src/modules/roadmap/roadmap-notifications.service.ts` | `canViewSyncProblems`, `openedCount` |
| `packages/shared/src/roadmap-sync-problems.ts` | DTOs + query schema |
| `apps/web/src/widgets/roadmap-shell/notification-view.ts` | shared status/kind meta, duration, recurrence, «сейчас» rule |
| `apps/web/src/widgets/roadmap-shell/NotificationBell.tsx` | redesigned popover |
| `apps/web/src/views/roadmap-sync/ui/SyncProblemsPage.tsx` + `apps/web/src/app/(workspace)/roadmap/sync/page.tsx` | the page |

---

### Task 1: Episode journal written by the watchdog

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new model; back-relations on `RoadmapAlert`, `RoadmapProject`)
- Create: `apps/api/prisma/migrations/20261116140000_roadmap_alert_episodes/migration.sql`
- Create: `apps/api/src/modules/roadmap/roadmap-alert-episodes.ts`
- Modify: `apps/api/src/modules/roadmap/roadmap-alerts.service.ts` (`apply` :157-205, `open` :212-274, `cleanup` :277-297)
- Test: `apps/api/src/modules/roadmap/roadmap-alerts.spec.ts` (extend its in-memory fake with `roadmapAlertEpisode`)

**Interfaces:**
- Produces:
  - Model `RoadmapAlertEpisode` with the fields of spec §3.1, plus `openedCount Int?`: the `details.count` at opening, used by Task 3.
  - `@@unique([alertId, generation])`, `@@index([projectId, openedAt(sort: Desc)])`, `@@index([resolvedAt])`.
  - In `roadmap-alert-episodes.ts`:
    ```ts
    type EpisodeDb = Pick<Prisma.TransactionClient, 'roadmapAlertEpisode'>;
    export function createEpisode(db: EpisodeDb, alert: { id: string; generation: number; kind: string; projectId: string | null; openedAt: Date }, details: RoadmapAlertDetails): Promise<void>; // createMany skipDuplicates, peakCount = openedCount = details.count ?? null
    export function touchEpisode(db: EpisodeDb, alert: { id: string; generation: number; kind: string; projectId: string | null; openedAt: Date }, details: RoadmapAlertDetails): Promise<void>; // upsert; update details; peakCount = max(old, count)
    export function closeEpisode(db: EpisodeDb, alert: {...same}, resolution: 'fixed' | 'obsolete', endedAt: Date): Promise<void>; // upsert with resolvedAt/resolution
    ```

- [x] **Step 1: Write failing tests** in `roadmap-alerts.spec.ts`:
  - `opening creates one episode with openedCount and peakCount` (count 3 → both 3).
  - `refresh raises peakCount but never lowers it`: counts 3 → 5 → 2 give peak 5, `details.count` 2.
  - `fixed resolve ends the episode at clearSince`: clear starts at t+1 min, resolves at t+11 min, so `resolvedAt === t+1min` and `resolution 'fixed'`.
  - `obsolete resolve ends the episode at now`.
  - `two concurrent evaluate() open one episode`.
  - `a lost resolve race writes nothing to the episode`.
  - `an alert opened before the journal gets an episode on its first refresh` with `openedAt` equal to the alert's.
  - `cleanup deletes resolved episodes older than 90 days and keeps resolved alerts that still have episodes`.
- [x] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-alerts` and expect FAIL.
- [x] **Step 3: Schema and migration.**
  - Edit the schema.
  - Generate the SQL with `npx prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel apps/api/prisma/schema.prisma --script`, as Task 1 of the previous plan did.
  - Save it to the migration folder above. It must be additive only.
  - Run `npm run db:generate`. If it hits EPERM because a dev server holds the engine, note it and continue.
- [x] **Step 4: Implement the helpers, then wire them in.**
  - **`open`:** call `createEpisode(tx, …)` right after the alert row is won or created, before recipients. It belongs to the same transaction and is written even with zero recipients.
  - **`refresh`:** after a won `updateMany` (`count === 1`), load the alert (`id`, `generation`, `kind`, `projectId`, `openedAt`) and call `touchEpisode`.
  - **`resolve`:**
    - Wrap it in `$transaction`. First read the alert by key to get `clearSince`, `id` and `generation`.
    - Run the existing conditional `updateMany`. Only on `count === 1`, call `closeEpisode` with `endedAt = resolution === 'fixed' ? clearSince : now`.
  - **`cleanup`:**
    - Add `roadmapAlertEpisode.deleteMany({ where: { resolvedAt: { lt: now − 90d } } })`.
    - Change the alert delete to `{ state: 'resolved', notifications: { none: {} }, episodes: { none: {} } }`.
- [x] **Step 5: Run** the spec, expect PASS. Then run the full `npm run test -w @tracker/api` and expect PASS.
- [x] **Step 6: Commit** `feat(api): journal of sync problem episodes`.

---

### Task 2: Sync problems API

**Files:**
- Create: `packages/shared/src/roadmap-sync-problems.ts` (export from `packages/shared/src/index.ts`)
- Modify: `apps/api/src/modules/roadmap/roadmap-alert-format.ts`
- Create: `apps/api/src/modules/roadmap/roadmap-sync-problems.service.ts`, `roadmap-sync-problems.controller.ts`
- Modify: `apps/api/src/modules/roadmap/roadmap.module.ts`, `roadmap-notifications.service.ts` (`summary` :90, `list`), `packages/shared/src/roadmap-notifications.ts`
- Test: `apps/api/src/modules/roadmap/roadmap-sync-problems.spec.ts`, `roadmap-alert-format.spec.ts`, `roadmap-notifications.spec.ts`

**Interfaces:**
- Consumes: `RoadmapAlertEpisode` (Task 1).
- Produces (shared):
  ```ts
  export type SyncProblemStatus = 'active' | 'fixed' | 'obsolete';
  export interface SyncProblemAction { label: string; link: string }
  export interface SyncProblemDto {
    alertId: string; episodeId: string; kind: RoadmapAlertKind; projectId: string | null; projectName: string | null;
    title: string; body: string | null; status: SyncProblemStatus; openedAt: string; resolvedAt: string | null;
    peakCount: number | null; currentCount: number | null; recurrence7d: number; historyCount: number;
    hint: string; action: SyncProblemAction | null;
  }
  export interface SyncProblemEpisodeDto { episodeId: string; openedAt: string; resolvedAt: string | null; resolution: RoadmapAlertResolution | null; peakCount: number | null; details: RoadmapAlertDetails }
  export interface SyncProblemPage { items: SyncProblemDto[]; nextCursor: string | null; counts: { active: number }; projects: { id: string; name: string }[] }
  export const syncProblemListQuerySchema; // z.object({ status: z.enum(['active','resolved','all']).default('active'), projectId: z.string().uuid().optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) })
  // RoadmapNotificationSummary gains canViewSyncProblems: boolean; RoadmapNotificationDto gains openedCount: number | null
  ```
- Produces (API):
  - `alertHint(kind): string`. The texts are exactly those in spec §6.
  - `alertAction(kind, projectId, isAdmin): SyncProblemAction | null`. The labels and links come from the spec §6 table: admin links use `alertLink`; planners get `{ label: 'Открыть план', link: '/roadmap' }`, or `null` for `azure_auth` / `webhook_silent`.
  - `GET /roadmap/sync-problems` → `SyncProblemPage`.
  - `GET /roadmap/sync-problems/:alertId/history?limit=20` → `{ items: SyncProblemEpisodeDto[] }`.

- [x] **Step 1: Write failing tests.**
  - `roadmap-alert-format.spec.ts`:
    - `alertHint` returns the exact copy for all 5 kinds.
    - `alertAction`, admin: `sync_errors` → «Интеграции → Проекты», `#azure-projects`; `azure_auth` → «Подключение», `#azure-connection`; `webhook_silent` → «Webhook», `#azure-webhook`.
    - `alertAction`, planner: «Открыть план», `/roadmap`, or `null` for the two global kinds.
  - `roadmap-sync-problems.spec.ts` (mocked Prisma, in the style of `roadmap-notifications.spec.ts`):
    - The admin `where` has no project filter.
    - The planner `where` is limited to planner project ids and excludes kinds `azure_auth` / `webhook_silent`.
    - A user with only viewer grants gets `ForbiddenException`.
    - `projectId` outside the allowed set gets `ForbiddenException`.
    - `projects` lists only planner projects for a planner, and all synced projects for an admin.
    - Status `active` → `state: 'open'`; `resolved` → `state: 'resolved'`.
    - Ordering and cursor for each status.
    - `recurrence7d` counts episodes of the key with `openedAt` in [latest.openedAt − 7 d, latest.openedAt].
    - `historyCount = episodes − 1`.
    - Alerts without any episode are excluded.
    - `counts.active` respects access.
    - History excludes the latest episode, is newest first, and returns `NotFoundException` for a key the user can't see.
    - Malformed `limit` gets `BadRequestException`.
  - `roadmap-notifications.spec.ts`:
    - `summary.canViewSyncProblems`: admin → true; a user with one planner grant → true; viewer only → false.
    - `list` returns `openedCount` from the matching episode, or `null` when there is none.
- [x] **Step 2: Run** the three specs and expect FAIL.
- [x] **Step 3: Implement.**
  - Access: look up the planner project ids for `user.email.trim().toLowerCase()` with `roadmapProjectAccess.findMany({ where: { email, role: 'planner' } })`.
  - Latest episode per alert: query alerts with `include: { episodes: { orderBy: { generation: 'desc' }, take: 1 } }` and `episodes: { some: {} }` in the where.
  - `recurrence7d` and `historyCount`: one `$queryRaw` over the page's alert ids. Return per alertId the episode count and the count where `opened_at >= latest_opened_at - interval '7 days'`.
  - `title`: `formatAlert(kind, latest.details, projectName)`. `body`: the `formatAlert` body.
  - `currentCount`: `details.count` of the latest episode.
  - Controller: `@Controller('roadmap/sync-problems')` with `@CurrentUser()`, like the notifications controller. Register it in the module.
- [x] **Step 4: Run** `npm run build -w @tracker/shared`, then the three specs → PASS, then full API tests and `npm run lint -w @tracker/api` → PASS.
- [x] **Step 5: Commit** `feat(api): sync problems list and history`.

---

### Task 3: Shared view helpers and popover redesign

**Files:**
- Modify: `apps/web/src/widgets/roadmap-shell/notification-view.ts`, `notification-view.test.mjs`, `NotificationBell.tsx`
- Modify: `apps/web/src/shared/config/routes.ts` (add `roadmapSync: '/roadmap/sync'`)

**Interfaces:**
- Consumes: `RoadmapNotificationDto.openedCount` and `RoadmapNotificationSummary.canViewSyncProblems` (Task 2).
- Produces (in `notification-view.ts`):
  ```ts
  export type ProblemTone = 'active' | 'fixed' | 'obsolete';
  export const PROBLEM_STATUS_META: Record<ProblemTone, { label: string; dotClass: string; textClass: string; bgClass: string }>; // labels 'Активна' | 'Исправлено' | 'Больше не актуально'; Tailwind token classes only
  export const ALERT_KIND_ICON: Record<RoadmapAlertKind, LucideIcon>; // sync_errors CircleAlert, sync_conflicts GitCompareArrows, import_failing CloudOff, azure_auth KeyRound, webhook_silent Webhook
  export function notificationTone(item: Pick<RoadmapNotificationDto,'active'|'resolution'>): ProblemTone;
  export function currentLabel(item: Pick<RoadmapNotificationDto,'active'|'current'|'openedCount'>): string | null; // null unless active and current.count !== openedCount
  export function durationLabel(openedAt: string, endedAt: string): string; // '<1 мин' | 'N мин' | 'N ч M мин' | 'N дн'
  export function recurrenceLabel(n: number): string | null; // null for n < 2; '2-й раз за 7 дней', …
  ```
  - `ALERT_KIND_ICON` imports `lucide-react`. If importing it breaks the `node --test` run, move the icon map into `notification-icons.ts` and keep `notification-view.ts` icon-free.

- [x] **Step 1: Write failing tests** in `notification-view.test.mjs`:
  - `notificationTone`: active → `'active'`; `fixed` → `'fixed'`; `obsolete` → `'obsolete'`.
  - `currentLabel`:
    - active, `current.count` 1, `openedCount` 1 → `null`;
    - active, 3 vs 1 → `'сейчас: 3'`;
    - inactive → `null`;
    - `openedCount` `null` with count 2 → `'сейчас: 2'`.
  - `durationLabel`: 30 s → `'<1 мин'`; 25 min → `'25 мин'`; 2 h 5 min → `'2 ч 5 мин'`; 3 days → `'3 дн'`.
  - `recurrenceLabel`: 1 → `null`; 2 → `'2-й раз за 7 дней'`; 5 → `'5-й раз за 7 дней'`.
  - `PROBLEM_STATUS_META` labels are exactly «Активна», «Исправлено», «Больше не актуально».
  - The previous `statusLabel` tests are updated or removed if the function is replaced.
- [x] **Step 2: Run** `node --test apps/web/src/widgets/roadmap-shell/notification-view.test.mjs` and expect FAIL.
- [x] **Step 3: Implement the helpers, then redesign the popover** per spec §7.2.
  - **Each row:**
    - kind icon in a round chip coloured by tone;
    - title in `font-semibold text-foreground` when unread, `font-normal text-foreground` when read;
    - second line «проект · relativeTime · статус», with the status coloured;
    - `currentLabel` shown only when it is non-null;
    - row divider, plus hover and focus background.
  - **Footer:** «Все уведомления →» links to `routes.roadmapSync`, rendered only when `summary.canViewSyncProblems`. Clicking it closes the popover.
  - **Keep:** the width, `collisionPadding={16}`, the non-blocking mark-read, and the `aria-label`.
- [x] **Step 4: Run** the node test (PASS), `npx tsc --noEmit -p apps/web`, and eslint on the touched files from `apps/web` (clean).
- [x] **Step 5: Commit** `feat(web): clearer notification popover`.

---

### Task 4: Sync problems page

**Files:**
- Create: `apps/web/src/app/(workspace)/roadmap/sync/page.tsx` (`Suspense` wrapper, as in `roadmap/analytics/page.tsx`)
- Create: `apps/web/src/views/roadmap-sync/ui/SyncProblemsPage.tsx`
- Create: `apps/web/src/views/roadmap-sync/model/sync-problems-query.ts`, a pure parser and serializer for `?status=&project=`
- Create: `apps/web/src/views/roadmap-sync/model/sync-problems-query.test.mjs`
- Modify: `apps/web/src/widgets/roadmap-shell/RoadmapFrame.tsx`
  - nav item «Синхронизация» after «Аналитика», icon `Activity`, shown only when `canViewSyncProblems`; reuse the summary query key `['roadmap','notifications','summary']`;
  - breadcrumb «Синхронизация».
- Modify: `apps/web/src/entities/roadmap/api/roadmapApi.ts`, `roadmapDemo.ts`, `roadmapDemoStore.ts`

**Interfaces:**
- Consumes: the Task 2 endpoints and DTOs, and the Task 3 helpers and `routes.roadmapSync`.
- Produces:
  - `roadmapApi.syncProblems(params: { status; projectId?; cursor? }): Promise<SyncProblemPage>`.
  - `roadmapApi.syncProblemHistory(alertId: string): Promise<{ items: SyncProblemEpisodeDto[] }>`.
  - Matching demo methods.
  - `parseSyncQuery(search: URLSearchParams): { status: 'active'|'resolved'|'all'; projectId: string | null }` and `serializeSyncQuery(q): string`.

- [x] **Step 1: Write failing tests.**
  - `sync-problems-query.test.mjs`:
    - an empty search gives `{ status: 'active', projectId: null }`;
    - an invalid status falls back to `'active'`;
    - a round trip keeps the values;
    - the default status is omitted from the serialized string.
  - Demo store reads return `{ items: [], nextCursor: null, counts: { active: 0 }, projects: [] }` and `{ items: [] }`.
  - The demo summary for an admin has `canViewSyncProblems: true`.
- [x] **Step 2: Run** `node --test` on both test files and expect FAIL.
- [x] **Step 3: Implement the page** per spec §7.1.
  - **Header:** «Проблемы синхронизации» with «Активных: N» or «Активных проблем нет».
  - **Status filter:** a segmented control «Активные / Исправленные / Все».
  - **Project filter:** a project select built from `page.projects`, with «Все проекты» first.
  - **URL state:** filters are kept in the URL through `router.replace`.
  - **Rows** (`useInfiniteQuery`, `refetchInterval: 60_000`, refetch on window focus):
    - kind icon and status pill from the Task 3 helpers;
    - meta line: project, then «открыта … назад» or «длилась X · исправлено <date>», then `recurrenceLabel`;
    - «макс. N» when `peakCount` is greater than `currentCount`;
    - hint;
    - the action button as a `Link`;
    - the body in a collapsible mono block clamped to 2 lines;
    - «История (N)» when `historyCount > 0`, which lazily loads the history list.
  - **States:** a skeleton while loading. Empty copy exactly per §7.1. Errors through `ErrorNotice`. A 403 shows «Нет доступа к проблемам синхронизации».
  - **Layout at 375 px:** the row stacks into a column and the button takes full width.
- [x] **Step 4: Run** the node tests (PASS), `npx tsc --noEmit -p apps/web`, and eslint on the touched files (clean).
- [x] **Step 5: Verify in the browser.** The dev server is already running on :3000.
  - Problems resolved before the migration have no episode, so they are not listed. To check the flow, temporarily set one allocation of a write-back project to `error` with SQL, then restore it.
  - As admin, `/roadmap/sync` shows the problem under «Активные» within about 1 minute, and under «Исправленные» about 10 minutes after the restore.
  - Filters update the URL and survive a reload.
  - History expands.
  - At 375 px there is no horizontal scroll.
  - In light and dark themes the popover shows the new rows and the footer link.
  - Save screenshots to `output/`.
- [x] **Step 6: Commit** `feat(web): sync problems page`.

---

### Task 5: Docs and final verification

**Files:**
- Modify: `docs/13-roadmap.md` (extend the «Notifications» section: the page, who sees it, the journal, 90 days)

- [x] **Step 1: Write the doc paragraph and a short list of the page's filters and actions.**
- [x] **Step 2: Run** `npm run build`, `npm run test` and `npm run lint` from the root, and expect all to pass.
- [x] **Step 3: Commit** `docs(roadmap): document the sync problems page`.
