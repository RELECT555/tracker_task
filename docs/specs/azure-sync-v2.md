# ТЗ: Azure DevOps sync v2

Исполнитель — AI-агент. Работай строго по фазам (A → F), каждая фаза оставляет систему рабочей и проходит проверки из §12. Перед началом прочитай `docs/13-roadmap.md` и все файлы из §1.

---

## 1. Что уже есть (v1, не переписывать без нужды)

Монорепо (turbo, npm workspaces): `apps/api` — NestJS 11 + Prisma + PostgreSQL (`@tracker/api`), `apps/web` — Next.js + React Query + Tailwind (`@tracker/web`), `packages/shared` — общий TS-пакет с zod (`@tracker/shared`, собирается в `dist`, web подключает через `transpilePackages`, api — через `dist`).

Предметная модель: **назначение** (`RoadmapAllocation`) = work item (Feature/Epic) × роль × человек × квартал (`YYYY-Qn`) × оценка в часах. Помесячная разбивка (`RoadmapPeriodAllocation`) — только внутри Roadmap.

| Компонент | Файл |
|---|---|
| Подключение, PAT (AES-GCM), HTTP-клиент `request/requestJson`, `AzureDevOpsHttpError(httpStatus)`, секрет webhook, настройки в `system_settings` (ключ `roadmap.integration.azure-devops`) | `apps/api/src/modules/roadmap/roadmap-integration.service.ts` |
| Настройки записи v1 (`mode` off/manual/auto, `workItemType`, шаблоны названия/тегов, флаги полей, политика Remaining Work, `projectIds`), нормализация, совместимость с `writeBackEnabled` | `roadmap-write-back.settings.ts` |
| Очередь отправки (in-memory), create/update Task (JSON Patch + `test /rev`), итерация квартала, предпросмотр, обзор, проверка готовности (`validateOnly=true`), webhook (debounce + перечитывание), `@Interval` восстановления | `roadmap-azure-sync.service.ts` |
| Импорт work items (WIQL → workitemsbatch → upsert), эвристика кастомных полей `/role\|estimate/` | `roadmap-work-item-import.service.ts` |
| Webhook `POST /roadmap/webhooks/azure-devops` (заголовок `X-Roadmap-Webhook-Secret`), исключён из `AuthMiddleware` | `roadmap-webhook.controller.ts`, `apps/api/src/app.module.ts` |
| Админ-эндпоинты (под `AdminRoleGuard`) / обычные эндпоинты плана | `roadmap-settings.controller.ts` / `roadmap.controller.ts` |
| Текущий пользователь запроса | `request.devUser.id` (ставит `AuthMiddleware`) |
| Поля синхронизации на allocation: `azureTaskId`, `azureSyncStatus`, `azureSyncError`, `azureSyncedAt`, `azurePushedHours` | `apps/api/prisma/schema.prisma` |
| Клиент API и демо-режим | `apps/web/src/entities/roadmap/api/roadmapApi.ts`, `roadmapDemo.ts`, `roadmapDemoStore.ts`, `apps/web/src/app/api/roadmap-demo/route.ts` |
| Предпросмотр отправки | `apps/web/src/entities/roadmap/ui/AzurePushPreview.tsx` |
| План: статусы на назначениях, панель задачи, кнопка «Отправить в Azure (N)» | `apps/web/src/views/roadmap/ui/RoadmapPage.tsx` |
| Админка «Интеграции» (вкладки) | `apps/web/src/views/roadmap-admin/ui/RoadmapIntegrationsPage.tsx`, `.../ui/integrations/*` |
| UI-компоненты админки (использовать обязательно) | `.../roadmap-admin/ui/AdminLayout.tsx` (`AdminPage`, `AdminPageHeader`, `AdminAlert`, `AdminCard`, `StatusPill`), `apps/web/src/shared/ui/{switch,popover,searchable-select,button,input,label}.tsx` |

Источник правды v1: план (оценка, исполнитель) — Roadmap; факт (`Completed Work` задачи) — Azure DevOps; эпики/фичи Roadmap только читает.

---

## 2. Цели v2

1. **Понятный вход** — FAQ, мастер настройки, подсказки у каждой опции.
2. **Гибкий маппинг полей** в обе стороны, включая `Custom.*` у Task/Feature/Epic; любой источник факта; связка ролей с полями фичи.
3. **Переопределения по проектам** (разные процессы и поля).
4. **Контроль**: пополевой diff, конфликты (в т.ч. обнаружение через webhook), журнал, права на отправку, откат.
5. **Аналитика план/факт** по кварталам и месяцам (по истории ревизий).
6. **Надёжность**: несколько инстансов API, лимиты Azure, тесты.

---

## 3. Сквозные требования

- **UI** — русский язык, стиль существующей админки (`AdminLayout`), без новых UI-библиотек. У каждого нового экрана — состояния загрузки, пустое, ошибка; вёрстка без горизонтального скролла страницы на 375 px (таблицы скроллятся внутри своего контейнера).
- **Общий код** — схема настроек (zod), нормализация/миграция настроек, рендер шаблонов, вычисление итоговых значений полей (`evaluateWriteRules`) — в `packages/shared/src/roadmap-sync/*`, экспорт из `packages/shared/src/index.ts`. API и web используют одну и ту же реализацию (живой пример в UI = реальная отправка). После правок — `npm run build -w @tracker/shared`.
- **Совместимость** — сохранённые настройки v1 читаются без ручных действий; при настройках по умолчанию поведение v2 = поведение v1 (покрыть тестом).
- **Безопасность** — в Azure ничего не пишется без режима manual/auto; предпросмотр и проверки — только чтение или `validateOnly=true`. PAT и секреты никогда не попадают в журнал, логи, ответы API.
- **Каждое новое значение настройки** имеет дефолт и подсказку «что делает + пример».
- **Демо-режим** — каждый новый метод клиента добавить в `roadmapDemo.ts`/`roadmapDemoStore.ts` (чтение → пустые/дефолтные данные, запись → ошибка «недоступно в демо»).
- **БД** — только аддитивные миграции в новых папках `apps/api/prisma/migrations/<timestamp>_<name>/`. Применённые миграции не трогать.
- **Код** — стиль соседних файлов; не переформатировать чужой код (в репо есть старые prettier-нарушения).
- **Масштаб** — рассчитывать на проект до 20 000 work items и 3 000 назначений: обзоры через агрегаты (`groupBy`/SQL), запросы в Azure пачками по 200 id.
- **Документация** — обновлять `docs/13-roadmap.md` в конце каждой фазы.

---

## 4. Модель статусов назначения

```
null (не отправлено) ─┐
                      ├─► pending ─► sending ─► synced
изменение в Roadmap ──┘                    ├─► error     (Azure отклонил; текст ошибки)
                                           ├─► conflict  (ручная правка в Azure, политика stop/skip-field)
                                           └─► skipped   (демо-участник / проект вне записи / нет identity)
synced ─► conflict  (webhook увидел ручную правку поля из правил записи)
synced/error/conflict/skipped ─► pending  (изменение плана, «Отправить снова», «Отправить всё»)
sending (> 5 мин) ─► pending  (восстановление зависших)
```

Новые статусы `sending` и `conflict` — во всех местах: значки на плане, легенда, FAQ, счётчики, предпросмотр, фильтры журнала, тип `RoadmapAzureSyncStatus`.

---

## 5. Фаза A — FAQ, мастер, подсказки

### A1. Вкладка «Начало» (первая; открыта по умолчанию, пока мастер не пройден)

**FAQ** — аккордеон с поиском (по вопросу и ответу). Тексты в `apps/web/src/views/roadmap-admin/ui/integrations/faq.tsx` (массив `{ id, question, answer: ReactNode }`). Используй эти ответы (можно уточнять формулировки, смысл не менять):

1. **Что такое обратная синхронизация?** — Roadmap создаёт в Azure DevOps по задаче на каждое назначение (фича × роль × человек × квартал) и держит в ней оценку и исполнителя. Люди списывают время в эту задачу, и факт возвращается в Roadmap.
2. **Что происходит, когда я заполняю план?** — Зависит от режима. *Выключено*: в Azure ничего не уходит, назначения помечаются «не отправлено». *По кнопке*: изменения копятся, в шапке плана кнопка «Отправить в Azure (N)» с предпросмотром. *Автоматически*: каждое сохранённое назначение уходит через несколько секунд.
3. **Что появится в Azure?** — Пример: «Backend: Заявки (Q4 2026)» под фичей «Заявки», исполнитель — Иван, Original Estimate и Remaining Work = 40, теги Roadmap, Roadmap 2026-Q4, Backend, итерация квартала (если найдена). Состав полей настраивается во вкладке «Маппинг полей».
4. **Что если я поменяю часы / человека / месяцы / квартал?** — Часы: обновится оценка той же задачи, Remaining Work пересчитается (оценка − списанное) или останется — по настройке. Человек: задача переназначится. Помесячная разбивка: в Azure не уходит. Другой квартал: это отдельное назначение и отдельная задача.
5. **Откуда факт и когда обновляется?** — Из поля факта задачи (по умолчанию Completed Work). С webhook — через секунды, без него — кнопками «Синхронизировать» (план) или «Загрузить из Azure» (интеграции).
6. **Что можно менять в Azure руками?** — Название, состояние, описание, комментарии, факт — можно. Поля из правил записи (оценка, исполнитель и т.д.) — нет: Roadmap обнаружит правку и поступит по политике конфликтов (перезаписать / не трогать поле / остановить и спросить).
7. **Почему назначение «пропущено»?** — Демо-участник, проект не выбран для записи, или для человека нет учётной записи Azure.
8. **Что делать при ошибке?** — Открыть назначение или «Проекты и статус → Ошибки», прочитать причину (переведена на русский), исправить (права PAT, поле, исполнитель) и нажать «Отправить снова».
9. **Можно ли откатить?** — Да: «Проекты и статус → Откат» показывает задачи, созданные Roadmap, и закрывает или удаляет их (в корзину Azure) после подтверждения. Режим «Выключено» останавливает новые отправки.
10. **Как писать в кастомные поля и брать факт из своего поля?** — Вкладка «Маппинг полей»: выберите поле Azure и источник значения; там же источник факта.
11. **Нужен ли webhook?** — Не обязателен, но без него факт и конфликты видны только после ручной загрузки. API должен быть доступен из интернета.
12. **Какие права нужны PAT?** — Project and Team: Read, Graph: Read, Work Items: Read; для записи — Work Items: Read & Write.
13. **Кто может отправлять в Azure?** — По настройке: только администраторы или все, кто планирует.
14. **Чем «По кнопке» отличается от «Автоматически» и что выбрать?** — Начните с «По кнопке» на одном проекте; когда задачи выглядят как нужно — включайте «Автоматически».

**Мастер** — чек-лист над FAQ, статусы шагов вычисляются, у каждого шага кнопка «Перейти»:
1. Подключено к Azure.
2. PAT умеет писать (последняя проверка готовности без ошибки `write`).
3. Выбраны режим и проекты.
4. Проверка готовности пройдена без `error` (хотя бы один проект).
5. Пробная отправка: есть хотя бы одно `synced`.
6. Webhook работает: есть `lastWebhookAt` хотя бы у одного проекта.

Когда все шаги выполнены — вкладкой по умолчанию становится «Проекты и статус».

### A2. Подсказки
Компонент `HelpHint` (иконка `CircleHelp` + `Popover`: что делает, пример, ссылка на вопрос FAQ) у каждой настройки во вкладках «Настройки записи», «Маппинг полей», «Webhook».

### A3. Состояние проекта
Таблица `roadmap_azure_project_state`: `project_id uuid PK FK→roadmap_projects ON DELETE CASCADE`, `last_check_at timestamptz`, `last_check_result jsonb`, `last_webhook_at timestamptz`, `settings_override jsonb`, `updated_at`. `checkProject` сохраняет результат; `overview` отдаёт `lastCheckAt`, худший статус проверки, `lastWebhookAt`.

**DoD A**: новый пользователь видит «Начало», шаги мастера соответствуют реальному состоянию, поиск по FAQ работает, у всех настроек есть подсказки.

---

## 6. Фаза B — Гибкий маппинг полей

### B1. Обнаружение полей и типов (админ-API)

- `GET /roadmap/settings/azure-devops/work-item-types?projectId=` → `{ name, referenceName, icon?, color? }[]` (`GET {org}/{project}/_apis/wit/workitemtypes`).
- `GET /roadmap/settings/azure-devops/fields?projectId=&workItemType=` → `{ referenceName, name, type, isCustom, readOnly, isIdentity, isPicklist, alwaysRequired, allowedValues?, defaultValue?, helpText? }[]`. Источники: `GET {org}/{project}/_apis/wit/workitemtypes/{type}/fields?$expand=all` (required/allowedValues/defaultValue/helpText) + `GET {org}/_apis/wit/fields` (type/isCustom/readOnly/isIdentity/isPicklist). Кэш 10 мин, параметр `refresh=1`.
- `GET /roadmap/settings/azure-devops/states?projectId=&workItemType=` → состояния типа (`.../workitemtypes/{type}/states`), нужны для отката/закрытия.

### B2. Модель настроек v2 (zod-схема в `packages/shared`)

```ts
type FieldSource =
  | { kind: 'constant'; value: string | number | boolean }
  | { kind: 'template'; template: string }
  | { kind: 'roadmap'; value: 'estimate' | 'remaining' | 'assignee' | 'roleName' | 'quarterKey' | 'quarterStart' | 'quarterEnd' | 'iterationPath' | 'parentAreaPath' }
  | { kind: 'parentField'; field: string }                         // значение поля фичи/эпика
  | { kind: 'byRole'; values: Record<string /*roleName*/, string | number>; fallback?: string | number };

type WriteRule = { id: string; targetField: string; source: FieldSource; apply: 'create' | 'always'; enabled: boolean };

type ReadRule = { id: string; workItemTypes: string[]; field: string; label: string; display: 'badge' | 'column' | 'hidden' };

type FactSource = {
  field: string;                                   // числовое поле; по умолчанию Microsoft.VSTS.Scheduling.CompletedWork
  scope: 'roadmapTasks' | 'allChildTasks';         // только задачи Roadmap / все задачи-потомки фичи
  unlinkedTasks: 'featureOnly' | 'byAssignee';     // для allChildTasks: факт непривязанных задач только в фиче / ещё и в назначение по исполнителю
};

type RoleFieldLink = {                             // связка роли с полями фичи
  roleName: string;
  estimateField?: string;                          // поле фичи с оценкой роли (чтение, сверка, импорт плана)
  aggregateField?: string;                         // поле фичи, куда писать сумму плана роли (опционально)
};

type SyncSettingsV2 = {
  version: 2;
  mode: 'off' | 'manual' | 'auto';
  projectIds: string[] | null;
  workItemType: string;
  titleTemplate: string;
  tagsTemplate: string;
  writeRules: WriteRule[];
  readRules: ReadRule[];
  fact: FactSource;
  roleFields: RoleFieldLink[];
  writeFeatureAggregates: boolean;                 // писать суммы в aggregateField (по умолчанию false)
  conflictPolicy: 'overwrite' | 'skip-field' | 'stop';   // по умолчанию 'overwrite' (= v1)
  removalPolicy: { action: 'keep' | 'set-state' | 'delete'; state?: string };  // по умолчанию keep
  pushPermission: 'admins' | 'planners';           // по умолчанию 'planners' (= v1)
};
```

Токены шаблонов: v1 (`{role} {title} {quarter} {quarterKey} {person} {id}`) + `{personEmail} {quarterStart} {quarterEnd} {epic} {field:Reference.Name}` (значение поля родителя). Неизвестный токен остаётся как есть и подсвечивается в UI.

**Миграция v1 → v2** (чистая функция, без SQL): `fields.assignedTo` → правило `System.AssignedTo ← roadmap.assignee (always)`; `originalEstimate` → `OriginalEstimate ← estimate (always)`; `remainingWork` → `RemainingWork ← remaining`, `apply = remainingWorkPolicy === 'create-only' ? 'create' : 'always'`; `iteration` → `IterationPath ← iterationPath (create)`; `areaPath` → `AreaPath ← parentAreaPath (create)`; `description` → `Description ← template (create)` с текстом v1. `readRules` по умолчанию — одно правило «авто: кастомные поля Feature/Epic с role/estimate в имени» (эквивалент эвристики v1, можно выключить). Сохранять всегда v2.

### B3. Переопределения по проекту
`settings_override` (частичный `SyncSettingsV2` без `mode`/`projectIds`/`pushPermission`). Эффективные настройки = глобальные ⊕ override; `writeRules` объединяются по `targetField`, `readRules` — по `id`, `roleFields` — по `roleName`. UI: у проекта «Свои настройки» с метками переопределённых полей и «Сбросить к общим».

### B4. Применение

**Запись**: операции строятся `evaluateWriteRules` (shared) только из включённых правил и только для полей, существующих у типа; `apply: 'create'` — только при создании. Identity-поля — identity человека (см. E4), picklist — значение из `allowedValues`, иначе ошибка при сохранении правила. Обязательные поля типа без `defaultValue`, не покрытые правилами, — `error` в проверке готовности и предупреждение в UI маппинга.
Поле `azure_pushed_values jsonb` на allocation — значения, отправленные последней успешной отправкой (`{ [field]: value }`). Назначение требует обновления, если итоговые значения правил `always` ≠ `azure_pushed_values` (заменяет сравнение `azurePushedHours`; старое поле оставить для совместимости и заполнять).

**Чтение**: импорт запрашивает поля из `readRules` + поле факта + `roleFields.estimateField` (вместо regex). `azureCustomFields` хранит значения по `referenceName`, подписи берутся из правил. На плане: `badge` — бейдж в строке фичи, `column` — колонка после «Факт» с меню видимости колонок (сохраняется в localStorage).

**Факт**:
- `roadmapTasks`: факт назначения = поле факта его задачи; факт фичи = сумма по задачам Roadmap под ней и её потомкам.
- `allChildTasks`: факт фичи = сумма по всем задачам-потомкам. При `byAssignee` задача без привязки к назначению приписывается назначению этой фичи, если совпадает исполнитель (email/identity, регистронезависимо) **и** итерация задачи попадает в квартал назначения; если подходит несколько назначений или ни одного — факт идёт только в фичу, в строке фичи показывается «не распределено N ч».

**Связка ролей с полями фичи (`roleFields`)**:
- Сверка: в строке фичи по роли показывать «оценка в Azure X ч / план Y ч», расхождение подсвечивать.
- Импорт плана: кнопка «Взять оценку из Azure» в ячейке роли и массово «Создать назначения из оценок Azure» для проекта/квартала (человек — по умолчанию для роли; предпросмотр перед созданием).
- `writeFeatureAggregates = true`: при отправке записывать в `aggregateField` фичи сумму плана роли за все кварталы (только это поле, с `test /rev`, через ту же очередь, статус в журнале). По умолчанию выключено; в UI — явное предупреждение, что это изменение фичи.

### B5. UI — новая вкладка «Маппинг полей» (между «Настройки записи» и «Проекты и статус»)
- Проект-образец и тип задачи для загрузки полей; кнопка «Обновить поля».
- **Правила записи** — таблица: поле Azure (`SearchableSelect`, бейджи `custom/required/readonly/identity/picklist` и тип; readonly выбрать нельзя), источник (вид + редактор: шаблон с вставкой токенов, константа, значение Roadmap, поле фичи, «по ролям» — таблица роль→значение с выпадающим списком для picklist), «Когда» (при создании / всегда), вкл/выкл, удалить, порядок. «Добавить правило».
- **Живой пример**: выбор реального назначения проекта → итоговые значения всех полей задачи (через `evaluateWriteRules`) + предупреждения (обязательные поля без правил, неизвестные токены).
- **Правила чтения**, **Источник факта** (только числовые поля), **Связка ролей с полями фичи**.
- Экспорт/импорт настроек JSON (валидация zod, показ diff перед применением), «Сбросить к умолчанию».
- Сохранение с оптимистичной блокировкой: в настройках хранить `revision`; при расхождении — 409 и предложение перезагрузить.

**DoD B**: можно (1) писать `Microsoft.VSTS.Common.Activity` по ролям; (2) писать `Custom.*` константой и шаблоном; (3) брать факт из кастомного числового поля; (4) показать кастомное поле фичи колонкой; (5) задать проекту свой тип задачи; (6) сверить и импортировать оценку роли из поля фичи. Тест: настройки v1 → v2 дают идентичные операции патча.

---

## 7. Фаза C — Контроль изменений

**C1. Пополевой diff в предпросмотре.** Для `update` — текущие значения задач пачкой (`workitemsbatch` по 200, только поля правил) и строки «поле: было → станет»; задачи без изменений помечены «без изменений» и не выбраны. Для `create` — итоговые поля. Для агрегатов фичи — отдельный блок.

**C2. Конфликты.** Конфликт = текущее значение в Azure ≠ `azure_pushed_values[field]` (кто-то правил руками). Обнаружение: (а) при предпросмотре и отправке; (б) **по webhook** — при `workitem.updated` задачи Roadmap сравнить изменённые поля из правил `always` с `azure_pushed_values`, при расхождении → статус `conflict` с перечнем полей. Политика `conflictPolicy`: `overwrite` (перезаписать), `skip-field` (не трогать поле, остальное отправить, назначение помечено конфликтом по этому полю), `stop` (не отправлять задачу). UI: в предпросмотре конфликтные поля подсвечены с выбором «оставить Azure» (принять значение: для оценки — обновить оценку в Roadmap, для прочих — записать в `azure_pushed_values`) / «перезаписать»; список конфликтов во вкладке «Проекты».

**C3. Журнал.** Таблица `roadmap_azure_sync_log`: `id, created_at, project_id, allocation_id null, azure_work_item_id null, direction ('push'|'pull'|'webhook'), action ('create'|'update'|'skip'|'conflict'|'error'|'import'|'delete'|'close'|'settings'), changes jsonb ({field:{from,to}}), message, user_id null`. Индексы `(project_id, created_at desc)`, `(allocation_id, created_at desc)`. Писать при каждой отправке, импорте по webhook (агрегировано: одна запись на пачку), изменении настроек (`settings`, diff без секретов). Ротация >90 дней — `@Cron` раз в сутки. UI: «Проекты и статус → Журнал» с фильтрами (проект, направление, действие, период) и пагинацией по курсору; в панели задачи на плане — последние 5 записей назначения. `user_id` — `request.devUser.id`; авто-отправки помечаются «автоматически».

**C4. Права на отправку.** `pushPermission`: `admins` → эндпоинты push/preview-push/retry под `AdminRoleGuard`-проверкой внутри сервиса (403 с понятным текстом); на плане кнопки скрыты для не-админов с подсказкой.

**DoD C**: ручная правка Original Estimate в Azure → (с webhook) назначение сразу в `conflict`; предпросмотр показывает конфликт и diff; поведение по каждой политике; журнал содержит diff и автора.

---

## 8. Фаза D — Откат и удаление

**D1. Удаление назначения.** `DELETE /roadmap/allocations/:id` + кнопка в редакторе назначения с подтверждением. Перед удалением в БД применить `removalPolicy` к задаче (если есть): `keep` / `set-state` (состояние из `states`) / `delete` (`DELETE {org}/_apis/wit/workitems/{id}` — в корзину Azure). Оценка = 0 трактуется так же, если задано в настройке «Обнулённая оценка = удаление» (по умолчанию нет).

**D2. Откат проекта.** «Проекты и статус → Откат»: список задач, созданных Roadmap (`azureTaskId` + тег Roadmap), выбор действия (закрыть в состояние / удалить в корзину), предпросмотр, подтверждение вводом названия проекта. Выполняется через очередь, пишется в журнал, после — режим проекта переключается на «Выключено» (через override).

**DoD D**: удаление назначения и откат работают по выбранной политике, всё видно в журнале, без подтверждения ничего не удаляется.

---

## 9. Фаза E — Надёжность

**E1. Несколько инстансов.** Захват: `updateMany({ where: { id, azureSyncStatus: 'pending' }, data: { azureSyncStatus: 'sending', azure_sync_claimed_at: now } })`, обработка только при `count === 1`. `@Interval`: `sending` старше 5 мин → `pending`. Очередь in-memory остаётся как ускоритель, источник истины — БД.

**E2. Лимиты и ошибки.** 429/503 — `Retry-After` (по умолчанию 10 с), до 3 попыток с экспоненциальной паузой, пауза для всей очереди. Сетевые ошибки — ретрай. 4xx (кроме 409/412/429) — сразу `error`. Словарь перевода частых ошибок Azure на русский (неизвестный identity, readonly-поле, значение не из allowedValues, обязательное поле пусто, нет прав, тип не существует, родитель не найден) + исходный текст в деталях.

**E3. Webhook.** Сохранять `last_webhook_at` по проекту. Принимать секрет и в заголовке `X-Roadmap-Webhook-Secret`, и как пароль Basic auth (в подписке Azure есть поля Username/Password — так проще настроить); UI показывает оба способа. Если webhook настроен, но событий нет > 24 ч при наличии отправок за это время — предупреждение в «Проекты» и в мастере.

**E4. Сопоставление людей.** Поле `azure_identity` на `RoadmapPerson` (override; иначе email/principal name). Редактируется в «Пользователи» (минимальная правка `RoadmapUsersPage.tsx`). Проверка готовности валидирует до 20 уникальных исполнителей проекта через `validateOnly` и перечисляет непринятых.

---

## 10. Фаза F — Аналитика план/факт

**F1. Факт по датам.** Для задач с фактом читать историю: `GET {org}/_apis/wit/workItems/{id}/updates` → приращения поля факта с `revisedDate`. Хранить в `roadmap_fact_entries (work_item_id, revision, logged_at, delta_hours)` с уникальностью `(work_item_id, revision)`; загружать инкрементально (с последней известной ревизии) при импорте/webhook; первичная загрузка — фоновой задачей с прогрессом в «Проекты».

**F2. Отчёт** — вкладка/режим на странице плана «План / факт»: по кварталу и месяцам — план (помесячные значения и оценка), факт по датам списания, отклонение в ч и %, подсветка > ±20% (порог в настройках). Срезы: проект → эпик → фича → роль → человек. Экспорт CSV.

**DoD F**: на тестовых данных (моки истории) месячный факт совпадает с суммой приращений; отчёт строится < 2 с для 3 000 назначений.

---

## 11. Тесты (обязательно)

`apps/api` (jest: `*.spec.ts` в `src`, `npm run test -w @tracker/api`). Чистые функции из `packages/shared` тестировать из api-спеков. Минимум:
- нормализация/миграция настроек: v1 `writeBackEnabled`, v1 `writeBack`, v2; v1→v2 даёт те же операции патча;
- шаблоны и теги (все токены, `;`, пустые значения, `{field:…}`, неизвестный токен);
- итерация квартала (имя в пути, даты, самая узкая, отсутствие);
- `evaluateWriteRules` (create/always, readonly/отсутствующие поля, identity, picklist, byRole с fallback);
- override проекта (слияние правил);
- конфликты для трёх политик, в т.ч. обнаружение по webhook;
- захват `pending → sending`, возврат зависших;
- 404 (задача удалена → создать заново), 409/412 (повтор), 429 (`Retry-After`);
- webhook: неверный секрет (заголовок и Basic) → 401; created/updated/deleted; неимпортированный проект;
- атрибуция факта `allChildTasks/byAssignee` (однозначно, неоднозначно, не найдено);
- приращения факта из истории ревизий.

---

## 12. Как проверять (после каждой фазы)

```bash
npm run build -w @tracker/shared
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
(cd apps/web && npx eslint src/views/roadmap src/views/roadmap-admin src/entities/roadmap)
(cd apps/api && npx eslint src/modules/roadmap --rule 'prettier/prettier: off')
npm run test -w @tracker/api
npm run db:migrate:deploy          # только локальная БД
npm run build -w @tracker/api && node apps/api/dist/src/main.js   # curl новых эндпоинтов
```

**Запрещено**: реальные create/update/delete в Azure DevOps (только чтение и `validateOnly=true`). Реальную отправку проверяет человек.

---

## 13. Вне рамок

Изменение эпиков/фич в Azure, кроме явно включённого `writeFeatureAggregates`; помесячный план в Azure; другие трекеры; редизайн админки вне «Интеграций» (`RoadmapFrame.tsx`, `RoadmapAdminHomePage.tsx`, `RoadmapRolesPage.tsx`, `AdminLayout.tsx` — не трогать; `RoadmapUsersPage.tsx` — только поле identity из E4).

---

## 14. Отчёт после каждой фазы

Что сделано; новые эндпоинты, таблицы, поля настроек; что и как проверено (команды и результат); что не сделано и почему; что нужно от человека (например, «проверить реальную отправку на тестовом проекте», «перевыпустить PAT»).
