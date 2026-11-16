# Журнал изменений плана — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждое изменение назначения (часы, исполнитель, квартал, помесячная разбивка, создание, удаление) записывается в журнал с автором, источником и снимками «было/стало», и журнал виден в карточке Feature/Epic и в ленте проекта.

**Architecture:** Новая таблица `roadmap_plan_changes` и сервис `RoadmapPlanChangeService`, который каждый из 9 путей изменения вызывает внутри своей транзакции Prisma. Чтение — `GET /roadmap/projects/:projectId/changes`. Текст записей строит фронт из снимков.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest (ts-jest, `*.spec.ts`), Next.js, React Query, lucide-react.

**Spec:** `docs/specs/plan-change-log.md` — читать целиком перед первой задачей; §2 — список путей, §3 — модель, §5 — интерфейс.

## Global Constraints

- Старую таблицу `audit_logs` и модель `AuditLog` не трогать. Уведомления (`RoadmapAlert`, `RoadmapNotification`, `docs/specs/notifications.md`) не трогать.
- В той же рабочей копии параллельно идёт работа над уведомлениями и фильтром итераций. Коммитить только свои файлы (`git add <пути>`), никогда `git add -A`. Перед правкой `schema.prisma` делать `git pull`/смотреть `git status` — файл меняют и другие.
- Запись `updated` — только если снимки различаются. Изменение и его запись — в одной транзакции; запись пишется только когда изменение реально применилось (`count > 0`).
- Не логируются: служебные поля синхронизации, `azureTaskId`-привязка, списание времени, часы роли на Feature без назначений (ветка `setRoleHours` без назначений), роли/участники/настройки.
- Источник `source`: `'plan' | 'ai' | 'azure'`. Для `azure` без нажавшего пользователя `actorUserId/actorEmail/actorName = null`, подпись в UI «Azure DevOps».
- Журнал читают все с правом `read` на проект: `access.require(actor, { projectId }, 'read')`.
- Тексты интерфейса — на русском, как в §5.3 спеки.
- Скриншоты — только в `output/`, не коммитить (`AGENTS.md`).
- Коммиты оканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Сохранение без изменений** (те же часы, тот же человек, те же месяцы) — ни одной записи. Тест: Task 2 `saveAllocation без изменений не пишет журнал`.
2. **5-минутный импорт без правок в Azure** — ни одной записи. Тест: Task 4 `reconcile без изменений не пишет журнал`.
3. **Гонка: строку поменяли во время операции** (`updateMany` вернул `count: 0` в `applyAzure` или `finish()`) — записи нет. Тесты: Task 4 `applyAzure при count 0 не пишет журнал`, `finish без применения не пишет журнал`.
4. **Назначение или элемент удалены** — старые записи по-прежнему отдаются API и читаются (снимки, без FK). Тест: Task 6 `список отдаёт записи удалённого назначения`.
5. **Смена исполнителя и фильтр по человеку** — запись «Иванов → Сидоров» находится фильтром и по Иванову, и по Сидорову. Тест: Task 6 `фильтр по человеку ищет в before и after`.

---

## Файлы

| Файл | Ответственность |
|---|---|
| `apps/api/prisma/schema.prisma` | модель `RoadmapPlanChange`, связь `planChanges` у `RoadmapProject` |
| `apps/api/prisma/migrations/20261116120000_roadmap_plan_changes/migration.sql` | таблица и индексы |
| `apps/api/src/modules/roadmap/roadmap-plan-change.ts` | чистые функции и типы: снимок, сравнение, действие, курсор |
| `apps/api/src/modules/roadmap/roadmap-plan-change.service.ts` | запись в транзакции, чтение ссылок/снимков, список |
| `apps/api/src/modules/roadmap/roadmap-plan-change.spec.ts` | тесты чистых функций и сервиса |
| `apps/api/src/modules/roadmap/roadmap-plan-change-paths.spec.ts` | тесты путей 1–9 |
| `apps/api/src/modules/roadmap/roadmap-plan-change-guard.spec.ts` | тест-сторож |
| `roadmap.service.ts`, `roadmap-azure-sync.service.ts`, `roadmap-allocation-azure.service.ts`, `agent.service.ts`, `roadmap.controller.ts`, `roadmap.module.ts` | подключение путей и эндпоинта |
| `apps/web/src/entities/roadmap/api/planChangesApi.ts` | типы и запрос журнала |
| `apps/web/src/entities/roadmap/lib/plan-change-text.ts` | текст записи из снимков |
| `apps/web/src/entities/roadmap/ui/PlanChangeEntry.tsx` | одна запись / группа |
| `apps/web/src/views/roadmap/ui/WorkItemCardSheet.tsx` | слияние с историей Azure |
| `apps/web/src/views/roadmap/ui/PlanChangesSheet.tsx` | лента проекта |
| `apps/web/src/views/roadmap/ui/RoadmapPage.tsx` | кнопка «Журнал изменений» |
| `apps/web/src/entities/roadmap/api/roadmapDemo.ts` | пустой журнал в демо |

---

### Task 1: Модель, миграция и сервис записи

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (рядом с `RoadmapAllocation`, `RoadmapProject:383`)
- Create: `apps/api/prisma/migrations/20261116120000_roadmap_plan_changes/migration.sql`
- Create: `apps/api/src/modules/roadmap/roadmap-plan-change.ts`, `roadmap-plan-change.service.ts`, `roadmap-plan-change.spec.ts`
- Modify: `apps/api/src/modules/roadmap/roadmap.module.ts` (providers, exports — агент живёт в другом модуле)

**Interfaces — Produces:**
```ts
// roadmap-plan-change.ts
export type PlanChangeSource = 'plan' | 'ai' | 'azure';
export type PlanChangeAction = 'created' | 'updated' | 'deleted';
export interface PlanChangeActor { id: string; email: string }
export interface PlanChangeContext { actor: PlanChangeActor | null; source: PlanChangeSource; batchId: string }
export interface AllocationSnapshot {
  personExternalId: string; personName: string; personEmail: string | null;
  quarterKey: string; estimatedHours: number;
  months: { monthKey: string; hours: number }[]; // только периоды с monthKey, по возрастанию monthKey
}
export interface AllocationRef {
  allocationId: string; projectId: string; workItemId: string;
  workItemExternalId: string; workItemTitle: string;
  roleId: string; roleName: string; azureTaskId: string | null;
}
export interface PlanChangeInput { ref: AllocationRef; before: AllocationSnapshot | null; after: AllocationSnapshot | null; details?: Record<string, unknown> }
export function planChangeContext(actor: PlanChangeActor | null, source: PlanChangeSource, batchId?: string): PlanChangeContext; // batchId по умолчанию randomUUID()
export function snapshotOf(row: AllocationRow): AllocationSnapshot; // AllocationRow — select из ALLOCATION_SNAPSHOT_SELECT
export function sameSnapshot(a: AllocationSnapshot | null, b: AllocationSnapshot | null): boolean;
export function actionOf(before: AllocationSnapshot | null, after: AllocationSnapshot | null): PlanChangeAction | null; // null = не писать
export const ALLOCATION_SNAPSHOT_SELECT: Prisma.RoadmapAllocationSelect; // поля для снимка и ссылки: workItem{id,externalId,title,projectId}, role{id,name}, periods{monthKey,hours}, azureTaskId …

// roadmap-plan-change.service.ts
@Injectable() export class RoadmapPlanChangeService {
  read(tx: Prisma.TransactionClient, allocationIds: string[]): Promise<Map<string, { ref: AllocationRef; snapshot: AllocationSnapshot }>>;
  record(tx: Prisma.TransactionClient, context: PlanChangeContext, changes: PlanChangeInput[]): Promise<number>; // число записанных строк
}
```

- [ ] **Step 1: Модель и миграция.** Поля и индексы — ровно §3 спеки плюс `azureTaskId varchar(100) null`. `projectId` — FK `onDelete: Cascade`; `allocationId`, `workItemId`, `actorUserId` — без FK. Таблица `roadmap_plan_changes`, колонки snake_case через `@map`. SQL миграции написать руками в стиле соседних миграций, затем `npm run db:generate`.
- [ ] **Step 2: Проверка схемы.** Run: `npm run db:migrate:deploy && npm run db:status` → `Database schema is up to date`.
- [ ] **Step 3: Тесты (падают).** В `roadmap-plan-change.spec.ts`:
  - `actionOf`: `(null, s) → 'created'`, `(s, null) → 'deleted'`, `(s, s) → null`, `(s, {...s, estimatedHours: 24}) → 'updated'`, `(null, null) → null`.
  - `sameSnapshot` не зависит от порядка `months` и от `Decimal`-представления (`8` vs `'8.00'` после `snapshotOf`).
  - `record` пропускает неизменённые и возвращает `1` для пачки `[unchanged, changed]`; `createMany` вызван с одной строкой, у которой `batchId`, `source`, `action: 'updated'`, снимки, `roleName`, `workItemTitle`.
  - `record` берёт `actorName` из `tx.user.findUnique({ where: { id }, select: { fullName } })`; при `actor: null` — `actorUserId/actorEmail/actorName` равны `null` и пользователь не читается.
  - `record` с пустым списком не обращается к БД.
- [ ] **Step 4:** Run: `npm test -w @tracker/api -- roadmap-plan-change.spec` → FAIL (модуль не найден).
- [ ] **Step 5: Реализация** по Interfaces. `record` пишет одним `tx.roadmapPlanChange.createMany`. Сервис регистрируется в `providers` и `exports` модуля roadmap.
- [ ] **Step 6:** Run: тот же тест → PASS; `npx tsc --noEmit -p apps/api` → без ошибок.
- [ ] **Step 7: Commit** `feat(api): add plan change log table and recorder` (schema, миграция, три файла, module).

---

### Task 2: Пути 1–4 — сохранение, ассистент, месяцы, перераспределение

**Files:**
- Modify: `apps/api/src/modules/roadmap/roadmap.service.ts` (`saveAllocation:1404`, `rebalanceAllocations:1589`, `saveAllocationQuarter:1692`, конструктор `:151`)
- Modify: `apps/api/src/modules/roadmap/roadmap.controller.ts` (`:355`, `:389`, `:465`)
- Modify: `apps/api/src/modules/agent/agent.service.ts` (`apply:106`, вызов `:132`)
- Test: `apps/api/src/modules/roadmap/roadmap-plan-change-paths.spec.ts` (моки по образцу `roadmap-allocation.spec.ts`)

**Interfaces — Consumes:** Task 1. **Produces:** новые сигнатуры (последний параметр обязательный):
```ts
saveAllocation(dto, options: { skipSync?: boolean } | undefined, context: PlanChangeContext)
saveAllocationQuarter(allocationId: string, quarterKey: string, months: { monthKey: string; hours: number }[], context: PlanChangeContext)
rebalanceAllocations(ids: string[], context: PlanChangeContext)
```
Точный порядок параметров у `saveAllocation` — сохранить существующие, `context` добавить последним. Все вызовы в контроллере передают `planChangeContext(actor, 'plan')`.

- [ ] **Step 1: Тесты (падают):**
  - `saveAllocation создаёт назначение и пишет created` — `before: null`, `after.estimatedHours: 8`, `source: 'plan'`.
  - `saveAllocation меняет часы и пишет updated с before 8 / after 16`.
  - `saveAllocation без изменений не пишет журнал` (Review Focus 1).
  - `saveAllocationQuarter пишет одну запись с months до и после`.
  - `rebalanceAllocations пишет по записи на изменённое назначение с одним batchId`; неизменённые не пишутся.
  - `agent.apply пишет source ai с одним batchId на все применённые предложения; отклонённое предложение записи не даёт`.
- [ ] **Step 2:** Run: `npm test -w @tracker/api -- roadmap-plan-change-paths` → FAIL.
- [ ] **Step 3: Реализация.** В каждой транзакции: `planChanges.read(tx, ids)` до записи → изменение → `read` после → `record`. `agent.apply` создаёт `planChangeContext(actor, 'ai')` один раз до цикла и передаёт во все `saveAllocation`. Существующие вызовы `saveAllocation` вне контроллера и агента (найти `grep -rn "saveAllocation(" apps/api/src`) получают контекст по смыслу вызова.
- [ ] **Step 4:** Run: тест → PASS; `npm test -w @tracker/api` → все старые тесты зелёные (поправить моки старых тестов под новый параметр и `planChanges`).
- [ ] **Step 5: Commit** `feat(api): log plan, assistant, quarter and rebalance allocation changes`.

---

### Task 3: Пути 5–6 — часы роли в ячейке и удаление

**Files:**
- Modify: `apps/api/src/modules/roadmap/roadmap-azure-sync.service.ts` (`setRoleHours` ~`:1785–1910`)
- Modify: `apps/api/src/modules/roadmap/roadmap-allocation-azure.service.ts` (`deleteAllocation:223`)
- Modify: `apps/api/src/modules/roadmap/roadmap.controller.ts` (`:372`, `:442`)
- Test: `roadmap-plan-change-paths.spec.ts`

**Interfaces — Produces:**
```ts
setRoleHours(actorId: string, workItemId: string, roleId: string, hours: number, quarterKey: string | undefined, context: PlanChangeContext)
deleteAllocation(actor: Actor, allocationId: string, context: PlanChangeContext)
```

- [ ] **Step 1: Тесты (падают):**
  - `setRoleHours пишет updated на каждое назначение роли с одним batchId и details.roleHours { from: 40, to: 60 }`.
  - `setRoleHours без назначений не пишет журнал` (ветка ~`:1826`, решение спеки).
  - `deleteAllocation пишет deleted с before-снимком и details.task = 'state'` (политика `state`).
  - `deleteAllocation при ошибке Azure не пишет журнал и не удаляет` (существующее поведение сохраняется).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Реализация.** `setRoleHours`: снимки до — из уже прочитанных `current`, `record` внутри существующей `$transaction` (~`:1879`). `deleteAllocation`: `read` до `applyRemoval`; затем `$transaction([delete, record])` с `details: { task }`.
- [ ] **Step 4:** Run → PASS, весь `npm test -w @tracker/api` зелёный.
- [ ] **Step 5: Commit** `feat(api): log role-cell hours and allocation removal`.

---

### Task 4: Пути 7–9 — изменения из Azure

**Files:**
- Modify: `apps/api/src/modules/roadmap/roadmap-allocation-azure.service.ts` (`reconcile:82`, `acceptFromAzure:113`, `applyAzure:300`, транзакция `:379–395`)
- Modify: `apps/api/src/modules/roadmap/roadmap-azure-sync.service.ts` (`finish()` с `acceptedHours` ~`:1187`, `shrinkPeriods:2062`)
- Modify: `roadmap.controller.ts:433`
- Test: `roadmap-plan-change-paths.spec.ts`

**Interfaces — Produces:**
```ts
acceptFromAzure(allocationId: string, context: PlanChangeContext) // контроллер: planChangeContext(actor, 'azure')
applyAzure(allocation, task, policy, force: boolean, context: PlanChangeContext) // private
```
`reconcile` создаёт `planChangeContext(null, 'azure')` один на вызов (один импорт = один `batchId`).

- [ ] **Step 1: Тесты (падают):**
  - `acceptFromAzure пишет updated с source azure и автором — нажавшим пользователем`.
  - `reconcile пишет updated без автора при смене оценки в Task` (`actorUserId: null`, `azureTaskId` заполнен).
  - `reconcile без изменений не пишет журнал` (Review Focus 2).
  - `applyAzure при count 0 не пишет журнал` (Review Focus 3).
  - `finish с acceptedHours пишет updated с месяцами после shrinkPeriods`; `finish без применения не пишет журнал` (Review Focus 3).
  - `ошибка shrinkPeriods не роняет отправку`, запись пишется с фактически сохранёнными месяцами.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Реализация.** `applyAzure`: `record` внутри транзакции `:379`, только при `updated.count > 0`, снимок после — повторным `read(tx, [id])`. Путь 9: после успешного `finish` (вернуть из `finish` `count`, если сейчас не возвращает) и `shrinkPeriods` — отдельная короткая транзакция `read` + `record`; ошибка записи журнала здесь логируется `logger.warn` и не роняет отправку (Task уже создан в Azure — это решение плана, т.к. откатить нечего).
- [ ] **Step 4:** Run → PASS, весь набор зелёный.
- [ ] **Step 5: Commit** `feat(api): log allocation changes coming from Azure DevOps`.

---

### Task 5: Тест-сторож

**Files:** Create: `apps/api/src/modules/roadmap/roadmap-plan-change-guard.spec.ts`

- [ ] **Step 1: Тест.** Читает все `apps/api/src/modules/**/*.ts` кроме `*.spec.ts`, находит вызовы `roadmapAllocation.(create|createMany|update|updateMany|upsert|delete|deleteMany)` и `roadmapPeriodAllocation.(…те же…)`, у которых в ближайших ~25 строках аргумента встречаются `estimatedHours`, `personExternalId`, `quarterKey` или `hours:` (для периодов — любой вызов). Каждое такое место (файл + имя окружающего метода) должно быть в явном списке `LOGGED` (методы путей 1–9) или `SYNC_ONLY` (claim, `finish` без `acceptedHours`, `pushProject`, `pushAllocation`, `recoverPending`, `handleDeletedWorkItem`, `shrinkPeriods` — с комментарием, почему). Неизвестное место → тест падает с сообщением `Новое изменение назначений без журнала: <файл>:<строка> (<метод>)`.
- [ ] **Step 2:** Run: `npm test -w @tracker/api -- roadmap-plan-change-guard` → PASS. Проверить, что ловит: временно добавить в любой сервис `prisma.roadmapAllocation.update({ data: { estimatedHours: 1 } })` → FAIL с нужным сообщением; убрать.
- [ ] **Step 3: Commit** `test(api): guard that allocation writes reach the plan change log`.

---

### Task 6: Эндпоинт списка

**Files:**
- Modify: `roadmap-plan-change.service.ts` (метод `list`), `roadmap-plan-change.ts` (курсор, DTO)
- Modify: `apps/api/src/modules/roadmap/roadmap.controller.ts` (новый `@Get('projects/:projectId/changes')`)
- Test: `roadmap-plan-change.spec.ts`; доступ — по образцу `apps/api/test/roadmap-access.e2e-spec.ts`

**Interfaces — Produces:**
```ts
interface PlanChangeQuery { workItemExternalId?: string; personExternalId?: string; from?: string; to?: string; cursor?: string; limit?: number }
interface PlanChangeDto { id; batchId; action; source; actorName: string | null; actorEmail: string | null;
  workItemExternalId; workItemTitle; roleName; quarterKey; azureTaskId: string | null;
  before: AllocationSnapshot | null; after: AllocationSnapshot | null; details: Record<string, unknown>; createdAt: string }
list(projectId: string, query: PlanChangeQuery): Promise<{ items: PlanChangeDto[]; nextCursor: string | null }>
```
Фильтр карточки — по `workItemExternalId` (карточка знает `externalId`; колонка есть в §3) — это отклонение от формулировки §5.1 спеки в пользу простоты, смысл тот же. `limit` по умолчанию 50, максимум 200; DTO-валидация `class-validator` по образцу соседних DTO в контроллере. Курсор — base64url от `createdAt|id`, сортировка `createdAt desc, id desc`.

- [ ] **Step 1: Тесты (падают):**
  - `список отдаёт записи удалённого назначения` (Review Focus 4).
  - `фильтр по человеку ищет в before и after` (Review Focus 5; JSON-путь `before->>'personExternalId'` или `OR` по `path` в Prisma).
  - `пагинация: limit 2 из 3 записей даёт nextCursor, вторая страница — оставшуюся, без повторов при одинаковом createdAt`.
  - `limit 500 обрезается до 200`.
  - e2e: viewer своего проекта получает 200, чужого — 403.
- [ ] **Step 2:** Run → FAIL. **Step 3:** реализация, `access.require(actor, { projectId }, 'read')`. **Step 4:** Run → PASS, `npm run test:e2e -w @tracker/api -- roadmap-access` зелёный.
- [ ] **Step 5: Commit** `feat(api): list plan changes per project`.

---

### Task 7: Клиент и текст записей

**Files:**
- Create: `apps/web/src/entities/roadmap/api/planChangesApi.ts`, `apps/web/src/entities/roadmap/lib/plan-change-text.ts`, `apps/web/src/entities/roadmap/ui/PlanChangeEntry.tsx`
- Modify: `apps/web/src/entities/roadmap/api/roadmapDemo.ts` (метод `planChanges` → `{ items: [], nextCursor: null }`)

**Interfaces — Produces:**
```ts
// planChangesApi.ts — типы зеркалят PlanChangeDto/PlanChangeQuery из Task 6
planChangesApi.list(projectId: string, query: PlanChangeQuery): Promise<{ items: PlanChange[]; nextCursor: string | null }>
// plan-change-text.ts
describePlanChange(change: PlanChange): { verb: string; text: string; author: string } // author: actorName ?? 'Azure DevOps'
groupByBatch(items: PlanChange[]): { batchId: string; items: PlanChange[] }[] // соседние записи одного batchId
// PlanChangeEntry.tsx
PlanChangeEntry({ group, onOpenWorkItem? }: { group: { batchId; items: PlanChange[] }; onOpenWorkItem?: (externalId: string) => void })
```
Тексты — §5.3 спеки: «Создал назначение», «Изменил часы: 16 → 24 ч (окт 8 → 12, ноя 8 → 12)», «Сменил исполнителя: Иванов И. → Сидоров С.», «Удалил назначение … задача в Azure закрыта/удалена/оставлена» (по `details.task`: `state`/`deleted`/`kept`), префикс «Ассистент (применил X)» для `ai`, «Из Azure DevOps (задача #N)» для `azure`. Группа из >1 записи: «X перераспределил часы — N назначений» (для `ai` — «применил предложения ассистента», для `azure` — «изменения из Azure DevOps»), раскрывается.

- [ ] **Step 1:** реализация. **Step 2:** Run: `npx tsc --noEmit -p apps/web` и `npm run lint -w @tracker/web` → без ошибок.
- [ ] **Step 3: Commit** `feat(web): plan change client and entry rendering`.

---

### Task 8: История в карточке

**Files:** Modify: `apps/web/src/views/roadmap/ui/WorkItemCardSheet.tsx` (`HistoryTab:642`, вкладки `:286`)

- [ ] **Step 1: Реализация.** Для типов Feature и Epic — отдельный `useQuery(['plan-changes', projectId, externalId], …)` с `workItemExternalId`; записи сливаются с `item.history` по времени, новые сверху. У записей Roadmap — значок «Roadmap» / «Ассистент». Ошибка истории Azure не скрывает записи Roadmap, и наоборот. Пустое состояние — только если пусто в обоих. После успешных мутаций назначений в карточке и в плане — `invalidateQueries(['plan-changes'])`.
- [ ] **Step 2: Проверка в браузере.** `preview_start` (`.claude/launch.json`), открыть план, изменить часы назначения, открыть карточку Feature → «История»: запись «Изменил часы: … → … ч» с вашим именем сверху. Скриншот в `output/`.
- [ ] **Step 3:** `npx tsc --noEmit -p apps/web`, lint → чисто. **Commit** `feat(web): show plan changes in the work item history`.

---

### Task 9: Лента проекта

**Files:** Create: `apps/web/src/views/roadmap/ui/PlanChangesSheet.tsx`; Modify: `apps/web/src/views/roadmap/ui/RoadmapPage.tsx` (шапка рядом с кнопкой «Отправить в Azure» `:1517`; открытие карточки — существующий `setCard` `:865`)

**Interfaces — Consumes:** `planChangesApi.list`, `groupByBatch`, `PlanChangeEntry` (Task 7).

- [ ] **Step 1: Реализация.** Кнопка-иконка `History` с подписью/подсказкой «Журнал изменений» открывает боковую панель в стиле `WorkItemCardSheet` (тот же `dialog`, анимации, `roadmap-scrollbar`). Фильтры: человек (участники ролей проекта из уже загруженного плана) и период (с/по). `useInfiniteQuery` по `nextCursor`, подгрузка при прокрутке. Клик по записи → закрыть панель и открыть карточку элемента. Кнопка видна и в демо (пустой журнал: «Изменений пока нет»).
- [ ] **Step 2: Проверка в браузере.** Сделать перераспределение → в ленте одна группа «перераспределил часы — N назначений», раскрывается; фильтр по человеку оставляет только его записи; клик открывает карточку. Ширина 375px — панель без горизонтальной прокрутки. Тёмная тема — читаемо. Скриншоты в `output/`.
- [ ] **Step 3:** tsc, lint → чисто. **Commit** `feat(web): add the project plan change feed`.

---

### Task 10: Документация и финальная проверка

- [ ] Дописать в `docs/13-roadmap.md` раздел «Журнал изменений» (что пишется, где смотреть, что не пишется) — 5–8 строк.
- [ ] Run: `npm test -w @tracker/api`, `npm run test:e2e -w @tracker/api`, `npm run lint`, `npm run build` → всё зелёное.
- [ ] Commit `docs: describe the plan change log`.
