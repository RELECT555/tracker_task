# Iteration Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plan table for a quarter shows the epics/features whose Azure DevOps iteration belongs to that quarter, plus out-of-iteration cards that have plan or fact in the period (marked «вне итерации»).

**Architecture:** Store `System.IterationPath` on `RoadmapWorkItem`. A new endpoint resolves the quarter's iteration path with the existing `quarterIterationPath` (same rule as Task write-back). A pure shared function decides visibility by path prefix + period activity; `RoadmapPage` filters rows with it.

**Tech Stack:** NestJS + Prisma/PostgreSQL, Jest (API), Next.js + TanStack Query (web), `node:test` `.test.mjs` for pure logic, `@tracker/shared`.

**Spec:** `docs/specs/iteration-filter.md`

## Global Constraints

- Migrations additive only: one new folder `apps/api/prisma/migrations/20261116130000_roadmap_work_item_iteration/`. Do not touch `20261116090000_roadmap_notifications` (uncommitted work of another feature on this branch).
- Column: `iterationPath String? @map("iteration_path") @db.VarChar(1000)`.
- After shared changes: `npm run build -w @tracker/shared`.
- No filtering (all cards visible, no badges) when the quarter path is `null` **or** no epic/feature of the project has a non-null `iterationPath`.
- Counters/totals (`getRoadmapSummary` metrics) and the «Все проекты» overview do not change.
- UI copy, exact: badge `вне итерации`; badge tooltip `Итерация: <path>` or `Итерация не задана`; notice `Итерация квартала в Azure не найдена — показаны все карточки`.
- Demo mode: iteration endpoint returns `{ iterationPath: null }`.
- Screenshots go to `output/`, never committed (AGENTS.md).

## Review Focus

1. Prefix false positive: quarter `P\2026\Q4` must not match `P\2026\Q40` or `P\2026\Q4x` → test in Task 1.
2. Case/leading-backslash differences between classification path and work-item path (`\P\2026\Q4` vs `p\2026\q4`) → test in Task 1.
3. While the iteration query is loading or failed, the table must show all cards (no flash of an empty table) → Task 4 treats `undefined` as `null`.
4. Local (non-Azure) project or unconfigured integration → endpoint returns `null`, not an error → test in Task 3.
5. Old rows with `iterationPath = null` after deploy: cron sync is incremental by `ChangedDate`, so they must be enriched once automatically → test in Task 2.

---

### Task 1: Shared visibility rule

**Files:**
- Create: `packages/shared/src/roadmap-plan/iteration.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './roadmap-plan/iteration';`)
- Modify: `packages/shared/src/roadmap-plan/summary.ts` (return own-activity ids)
- Test: `apps/web/src/views/roadmap/model/roadmap-iteration.test.mjs`

**Interfaces:**
- Produces:
  - `roadmapIterationContains(quarterPath: string, itemPath: string | null | undefined): boolean`
  - `interface RoadmapIterationItem { id: string; externalId: string; type: string; parentExternalId: string | null; iterationPath?: string | null }`
  - `interface RoadmapIterationVisibility { filtered: boolean; visibleIds: Set<string>; outsideIds: Set<string> }`
  - `getRoadmapIterationVisibility(items: RoadmapIterationItem[], quarterIterationPath: string | null, activeItemIds: ReadonlySet<string>): RoadmapIterationVisibility`
  - `RoadmapSummary.activeItemIds: Set<string>` — ids of epics/features for which `hasActivity(item)` is true (own activity only, **not** epics activated through their features). Not added to `RoadmapSummaryTotals`.

- [ ] **Step 1: Write failing tests** (`node:test` + `assert/strict`, import from `@tracker/shared`, items built like `roadmap-summary.test.mjs`):
  - `roadmapIterationContains('P\\2026\\Q4', x)` is true for `P\2026\Q4`, `P\2026\Q4\Sprint 1`, `\p\2026\q4`; false for `P\2026\Q40`, `P\2026\Q4x`, `P\2026\Q3`, `P`, `null`, `''`.
  - Quarter path `null` → `filtered: false`, `visibleIds` = all epic/feature ids, `outsideIds` empty.
  - All epics/features have `iterationPath: null` → `filtered: false`.
  - Feature in `P\2026\Q4\Sprint 1`, not active → visible, not outside.
  - Feature in `P\2026\Q3`, active → visible and in `outsideIds`; not active → not visible.
  - Feature with `iterationPath: 'P'` (root) and active → visible, outside.
  - Epic in Q3, inactive, with one visible feature (`parentExternalId` = epic `externalId`) → visible, **not** outside.
  - Epic in Q3, active itself, no visible features → visible, outside.
  - Epic in Q3, inactive, its only feature hidden → not visible.
  - Tasks (`type: 'Task'`) never appear in `visibleIds`.
  - `getRoadmapSummary(...).activeItemIds` contains a feature with a quarter allocation and does not contain its parent epic that has no own activity.
- [ ] **Step 2: Run** `npm run build -w @tracker/shared; node --test apps/web/src/views/roadmap/model/roadmap-iteration.test.mjs` → FAIL (export missing).
- [ ] **Step 3: Implement** in `iteration.ts`. Normalize a path: trim, strip leading `\`, lowercase. Contains = equal, or item starts with `quarter + '\\'`. Only `epic`/`feature` types (case-insensitive) take part. Features first, then epics (an epic is visible if in iteration, active, or any visible feature has `parentExternalId === epic.externalId`; outside only if not in iteration and active). In `summary.ts` add `activeItemIds: new Set(items.filter((item) => isPlanItem(item) && hasActivity(item)).map((item) => item.id))` to the returned object and the `RoadmapSummary` interface.
- [ ] **Step 4: Run** the same commands → PASS; also `node --test apps/web/src/views/roadmap/model/roadmap-summary.test.mjs` → PASS.
- [ ] **Step 5: Commit** `feat(roadmap): shared rule for iteration-based plan visibility`

### Task 2: Store the iteration on import

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`RoadmapWorkItem`)
- Create: `apps/api/prisma/migrations/20261116130000_roadmap_work_item_iteration/migration.sql`
- Modify: `apps/api/src/modules/roadmap/roadmap-work-item-import.service.ts` (`upsert` data)
- Modify: `apps/api/src/modules/roadmap/roadmap.service.ts` (`importProjectWorkItems` enrichment block)
- Test: `apps/api/src/modules/roadmap/roadmap-work-item-iteration.spec.ts`

**Interfaces:**
- Produces: `RoadmapWorkItem.iterationPath: string | null` in Prisma; included automatically in `getProjectPlan` work items.

- [ ] **Step 1: Write failing tests** (mock style of `roadmap-project-refresh.spec.ts`):
  - `importWorkItems` with an Azure item whose `fields['System.IterationPath'] = 'P\\2026\\Q4'` calls `prisma.roadmapWorkItem.upsert` with `create.iterationPath` and `update.iterationPath` = `'P\\2026\\Q4'`; when the field is absent both are `null`.
  - Incremental `refreshImportedProjects` (project with `syncedAt`): an existing Feature with `azureCustomFields: { 'System.AssignedTo': null }` and `iterationPath: null` is re-imported by id; one with `iterationPath: 'P'` is not.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-work-item-iteration` → FAIL.
- [ ] **Step 3: Implement.** Add the column. Generate SQL with `npx prisma migrate diff --from-schema-datasource apps/api/prisma/schema.prisma --to-schema-datamodel apps/api/prisma/schema.prisma --script` against a migrated local DB (expected: one `ALTER TABLE "roadmap_work_items" ADD COLUMN "iteration_path" VARCHAR(1000);`). In `upsert` data: `iterationPath: stringValue(fields[ITERATION_PATH])`. In the enrichment block select `iterationPath` too and rename `missingAssigneeIds` → `needsEnrichmentIds`, also matching `item.iterationPath === null`; update the comment.
- [ ] **Step 4: Run** `npm run db:generate; npm run test -w @tracker/api -- roadmap-work-item-iteration roadmap-project-refresh` → PASS; then `npm run test -w @tracker/api` → PASS.
- [ ] **Step 5: Commit** `feat(roadmap): store Azure iteration path of work items`

### Task 3: Quarter iteration endpoint

**Files:**
- Modify: `apps/api/src/modules/roadmap/roadmap-azure-sync.service.ts`
- Modify: `apps/api/src/modules/roadmap/roadmap.controller.ts` (next to `projects/:projectId/plan`)
- Test: `apps/api/src/modules/roadmap/roadmap-quarter-iteration.spec.ts`

**Interfaces:**
- Produces:
  - `RoadmapAzureSyncService.findQuarterIteration(projectId: string, quarterKey: string): Promise<{ iterationPath: string | null }>`
  - `GET /roadmap/projects/:projectId/iteration?quarterKey=YYYY-Qn` → `{ iterationPath: string | null }`; access `this.access.require(actor, { projectId }, 'read')`; `ParseUUIDPipe` on `projectId`.

- [ ] **Step 1: Write failing tests:**
  - Malformed `quarterKey` (`'2026-Q5'`, `'2026Q4'`, missing) → `BadRequestException`.
  - Unknown project → `NotFoundException`.
  - Integration not configured (`getPublicSettings().configured === false`) → `{ iterationPath: null }` without an Azure call.
  - Iterations tree with `\P\Iteration\2026\Q4` → `{ iterationPath: 'P\\2026\\Q4' }`.
  - `requestJson` rejects / `getCredentials` throws → `{ iterationPath: null }`.
- [ ] **Step 2: Run** `npm run test -w @tracker/api -- roadmap-quarter-iteration` → FAIL.
- [ ] **Step 3: Implement** `findQuarterIteration`: validate with `/^\d{4}-Q[1-4]$/`, look up `roadmapProject.externalId`, check configured, then `quarterIterationPath(externalId, quarterKey, credentials)` inside try/catch → `null` on error. Reuse the existing `iterationCache`; do not change `quarterIterationPath`'s behavior. Add the controller route.
- [ ] **Step 4: Run** `npm run test -w @tracker/api -- roadmap-quarter-iteration` → PASS; then `npm run test -w @tracker/api` → PASS.
- [ ] **Step 5: Commit** `feat(roadmap): endpoint for the Azure iteration of a quarter`

### Task 4: Filter the plan table

**Files:**
- Modify: `apps/web/src/entities/roadmap/api/roadmapApi.ts` (`RoadmapWorkItem`, `roadmapApi`)
- Modify: `apps/web/src/entities/roadmap/api/roadmapDemo.ts`, `roadmapDemoStore.ts` (demo handler)
- Modify: `apps/web/src/views/roadmap/ui/RoadmapPage.tsx`

**Interfaces:**
- Consumes: Task 1 `getRoadmapIterationVisibility`, `RoadmapSummary.activeItemIds`; Task 3 endpoint.
- Produces: `RoadmapWorkItem.iterationPath?: string | null`; `roadmapApi.quarterIteration(projectId: string, quarterKey: string): Promise<{ iterationPath: string | null }>`; demo `quarterIteration` → `{ iterationPath: null }`.

- [ ] **Step 1: Add API types and client**, demo handler.
- [ ] **Step 2: Wire the page.** `useQuery` with key `['roadmap', 'iteration', roadmapProjectId, currentQuarterKey]`, `enabled: Boolean(plan && !isAllProjects)`, `staleTime: 5 * 60 * 1000`, `retry: false`. `quarterIterationPath = query.data?.iterationPath ?? null` (loading/error = no filter). `const iteration = getRoadmapIterationVisibility(plannedItems, quarterIterationPath, summary?.activeItemIds ?? new Set())`. Apply `iteration.visibleIds.has(item.id)` together with `matchesState` in: epic rows (`epics.map` in the main table), their `children`, `standaloneFeatures`, and `stateOptions`/`stateCounts` (so state counts match visible rows). Leave `QuarterPlanningGrid` (periods view) and summary counters untouched.
- [ ] **Step 3: Badge and notice.** In `renderItemRow`'s meta line (`data-plan-meta`, epic and feature variants) render `<span>вне итерации</span>` when `iteration.outsideIds.has(item.id)`, styled like the existing feature-count pill with an amber tone, `title` = `Итерация: ${item.iterationPath}` or `Итерация не задана`. When `quarterIterationPath === null` and the query has succeeded and the plan is an Azure project (not demo, `configured`), show the notice text in the status row above the table (same place/style as the month status line).
- [ ] **Step 4: Verify.** `npm run lint -w @tracker/web` → no errors; `node --test apps/web/src/views/roadmap/model/*.test.mjs` → PASS. Run the web dev server via preview, open a synced Azure project: switching Q3↔Q4 changes the row list; an out-of-iteration card with plan shows the badge and tooltip; demo mode looks unchanged. Screenshot into `output/`.
- [ ] **Step 5: Commit** `feat(roadmap): filter plan rows by Azure iteration of the quarter`
