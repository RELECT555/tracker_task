# 05 — API Specification

## Общие соглашения

| Параметр | Значение |
|----------|----------|
| Base URL | `/api/v1` |
| Format | JSON (`Content-Type: application/json`) |
| Auth | `Authorization: Bearer <access_token>` |
| Pagination | `?page=1&limit=20` → `{ data: [], meta: { total, page, limit } }` |
| Sorting | `?sort=-createdAt` (минус = DESC) |
| Filtering | `?status=in_progress&priority=high` |
| Errors | `{ "error": { "code": "...", "message": "...", "details": {} } }` |

## Коды ошибок

| HTTP | Code | Описание |
|------|------|----------|
| 400 | `VALIDATION_ERROR` | Невалидные входные данные |
| 401 | `UNAUTHORIZED` | Нет или просрочен токен |
| 403 | `ACCESS_DENIED` | Нет прав на действие |
| 404 | `NOT_FOUND` | Ресурс не найден |
| 409 | `INVALID_TRANSITION` | Недопустимый переход статуса |
| 409 | `ROUTE_NOT_ALLOWED` | Маршрут не разрешён для типа/роли |
| 422 | `BUSINESS_RULE_VIOLATION` | Нарушение бизнес-правила |
| 429 | `RATE_LIMITED` | Превышен лимит запросов |

---

## Auth

### POST /auth/login

```json
// Request
{ "email": "user@company.com", "password": "..." }

// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": {
    "id": "usr_abc",
    "email": "user@company.com",
    "fullName": "Иванов Иван",
    "roles": ["employee"],
    "orgUnit": { "id": "org_1", "name": "Отдел продаж" }
  }
}
```

### POST /auth/refresh

```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "accessToken": "eyJ...", "expiresIn": 900 }
```

### GET /auth/me

Текущий пользователь. Response — объект `user` как выше.

---

## Requests

### POST /requests

Создание запроса (черновик).

```json
// Request
{
  "typeId": "rt_vacation",
  "title": "Отпуск 10–24 июля",
  "fields": {
    "dateFrom": "2026-07-10",
    "dateTo": "2026-07-24",
    "days": 10,
    "reason": "Ежегодный оплачиваемый"
  },
  "priority": "normal",
  "routeTemplateId": null
}

// Response 201
{
  "id": "req_001",
  "typeId": "rt_vacation",
  "title": "Отпуск 10–24 июля",
  "status": "draft",
  "fields": { ... },
  "priority": "normal",
  "route": null,
  "author": { "id": "usr_abc", "fullName": "..." },
  "createdAt": "2026-07-07T10:00:00Z",
  "updatedAt": "2026-07-07T10:00:00Z"
}
```

### POST /requests/:id/submit

Отправка черновика. Строит маршрут, создаёт первое назначение.

```json
// Request (optional body)
{ "routeTemplateId": "rtpl_custom" }

// Response 200
{
  "id": "req_001",
  "status": "in_progress",
  "route": {
    "templateId": "rtpl_vacation_default",
    "templateVersion": 3,
    "steps": [
      {
        "index": 0,
        "name": "Согласование руководителя",
        "assignee": { "id": "usr_mgr", "fullName": "Петров П." },
        "status": "active",
        "slaHours": 24,
        "dueAt": "2026-07-08T10:00:00Z"
      },
      {
        "index": 1,
        "name": "Согласование HR",
        "assignee": { "id": "usr_hr", "fullName": "Сидорова С." },
        "status": "pending",
        "slaHours": 24,
        "dueAt": null
      }
    ]
  },
  "currentStepIndex": 0,
  "submittedAt": "2026-07-07T10:05:00Z"
}
```

### GET /requests/:id

Полная карточка запроса.

```json
// Response 200
{
  "id": "req_001",
  "type": { "id": "rt_vacation", "name": "Отпуск" },
  "title": "Отпуск 10–24 июля",
  "status": "in_progress",
  "fields": { ... },
  "priority": "normal",
  "route": { ... },
  "currentStepIndex": 0,
  "author": { "id": "usr_abc", "fullName": "..." },
  "transitions": [
    {
      "id": "tr_1",
      "fromStatus": "draft",
      "toStatus": "submitted",
      "action": "submit",
      "actor": { "id": "usr_abc", "fullName": "..." },
      "comment": null,
      "createdAt": "2026-07-07T10:05:00Z"
    }
  ],
  "comments": [],
  "attachments": [],
  "createdAt": "2026-07-07T10:00:00Z",
  "submittedAt": "2026-07-07T10:05:00Z"
}
```

### GET /requests/inbox

Входящие запросы текущего пользователя (назначенные на него).

```
GET /requests/inbox?status=active&page=1&limit=20
```

```json
// Response 200
{
  "data": [
    {
      "id": "req_001",
      "title": "Отпуск 10–24 июля",
      "type": { "id": "rt_vacation", "name": "Отпуск" },
      "status": "in_progress",
      "priority": "normal",
      "author": { "id": "usr_abc", "fullName": "Иванов И." },
      "currentStep": { "name": "Согласование руководителя", "dueAt": "..." },
      "createdAt": "2026-07-07T10:00:00Z"
    }
  ],
  "meta": { "total": 15, "page": 1, "limit": 20 }
}
```

### GET /requests/outbox

Исходящие запросы текущего пользователя (созданные им).

```
GET /requests/outbox?status=in_progress
```

Формат аналогичен inbox.

### POST /requests/:id/approve

```json
// Request
{ "comment": "Согласовано" }

// Response 200 — обновлённый Request
```

### POST /requests/:id/reject

```json
// Request
{ "reason": "Недостаточно обоснования" }

// Response 200
```

### POST /requests/:id/request-info

```json
// Request
{ "message": "Уточните даты возвращения" }

// Response 200 — status → pending_info
```

### POST /requests/:id/provide-info

```json
// Request
{
  "fields": { "dateTo": "2026-07-20" },
  "comment": "Скорректировал даты"
}

// Response 200 — status → in_progress
```

### POST /requests/:id/escalate

```json
// Request
{ "reason": "Требуется решение директора" }

// Response 200
```

### POST /requests/:id/cancel

```json
// Request
{ "reason": "Больше не актуально" }

// Response 200
```

### POST /requests/:id/reassign (Admin)

```json
// Request
{
  "assigneeId": "usr_new",
  "reason": "Иванов в отпуске"
}

// Response 200
```

### POST /requests/:id/comments

```json
// Request
{ "body": "Документы приложены", "isInternal": false }

// Response 201
```

### POST /requests/:id/attachments

```
Content-Type: multipart/form-data
file: <binary>
```

```json
// Response 201
{
  "id": "att_001",
  "fileName": "scan.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 102400,
  "url": "/api/v1/attachments/att_001/download"
}
```

---

## Request Types

### GET /request-types

Список активных типов запросов.

```json
// Response 200
{
  "data": [
    {
      "id": "rt_vacation",
      "code": "vacation",
      "name": "Отпуск",
      "description": "Заявление на ежегодный оплачиваемый отпуск",
      "fieldSchema": [
        { "key": "dateFrom", "label": "Дата начала", "type": "date", "required": true },
        { "key": "dateTo", "label": "Дата окончания", "type": "date", "required": true },
        { "key": "days", "label": "Кол-во дней", "type": "number", "required": true },
        { "key": "reason", "label": "Причина", "type": "text", "required": false },
        { "key": "addressee", "label": "Кому адресовано", "type": "user_ref", "required": false }
      ],
      "allowsPersonalRoute": false,
      "maxPersonalRouteSteps": 5
    }
  ]
}
```

### GET /request-types/:id/available-routes

Допустимые маршруты для ручного выбора (UC-05). Возвращается только если тип имеет непустой `allowedManualRoutes`.

```json
// Response 200
{
  "data": [
    {
      "id": "rtpl_vacation_default",
      "name": "Стандартный (руководитель → HR)",
      "steps": [
        { "name": "Руководитель", "assigneeType": "manager_chain" },
        { "name": "HR", "assigneeType": "role" }
      ],
      "isDefault": true
    }
  ],
  "allowsPersonalRoute": true,
  "maxPersonalRouteSteps": 5
}
```

> Если `allowsPersonalRoute = true`, UI показывает вкладку «Собрать свой маршрут» вместо или в дополнение к whitelist.

### POST /requests/:id/submit — персональный маршрут

Альтернатива `routeTemplateId` для типов с `allowsPersonalRoute`:

```json
// Request
{
  "personalSteps": [
    { "name": "Согласование руководителя", "assigneeUserId": "usr_mgr", "slaHours": 24 },
    { "name": "Информирование HR", "assigneeUserId": "usr_hr", "slaHours": 48 }
  ]
}

// Errors
// 409 ROUTE_NOT_ALLOWED — тип не разрешает personal route
// 422 BUSINESS_RULE_VIOLATION — self-assign, inactive user, too many steps
```

---

## Route Templates (Admin)

### GET /admin/route-templates

### POST /admin/route-templates

```json
{
  "name": "Закупка — стандартный",
  "steps": [
    {
      "order": 0,
      "name": "Согласование руководителя",
      "assigneeType": "manager_chain",
      "assigneeRef": "1",
      "actions": ["approve", "reject", "escalate", "request_info"],
      "slaHours": 24
    },
    {
      "order": 1,
      "name": "Финансовый контроль",
      "assigneeType": "role",
      "assigneeRef": "role_finance",
      "actions": ["approve", "reject"],
      "slaHours": 48
    }
  ],
  "conditions": [
    {
      "when": { "field": "fields.amount", "operator": "gt", "value": 100000 },
      "then": {
        "type": "add_step",
        "stepTemplate": {
          "order": 99,
          "name": "Директор",
          "assigneeType": "role",
          "assigneeRef": "role_director",
          "actions": ["approve", "reject"],
          "slaHours": 72
        }
      }
    }
  ]
}
```

### PUT /admin/route-templates/:id/publish

Публикует новую версию шаблона.

---

## Request Types (Admin)

### GET /admin/request-types

Список типов с полной конфигурацией (включая `fieldSchema`, `allowedManualRoutes`, `allowsPersonalRoute`).

### POST /admin/request-types

```json
{
  "code": "personal_request",
  "name": "Личный запрос",
  "description": "Произвольный запрос с выбором согласующих",
  "fieldSchema": [
    { "key": "subject", "label": "Тема", "type": "text", "required": true },
    { "key": "details", "label": "Подробности", "type": "textarea", "required": false },
    { "key": "addressee", "label": "Кому", "type": "user_ref", "required": true }
  ],
  "defaultRouteTemplateId": null,
  "allowedManualRoutes": [],
  "allowsPersonalRoute": true,
  "maxPersonalRouteSteps": 3,
  "isActive": true
}
```

### PATCH /admin/request-types/:id

Частичное обновление. Поле `fieldSchema` заменяет схему целиком (не merge).

**Типы полей `fieldSchema`:** `text`, `textarea`, `number`, `date`, `boolean`, `select`, `user_ref`.

---

## Users & Org (Admin)

### GET /admin/users

### POST /admin/users

### GET /admin/org-units

Дерево подразделений.

```json
// Response 200
{
  "data": [
    {
      "id": "org_root",
      "name": "Компания",
      "head": { "id": "usr_ceo", "fullName": "..." },
      "children": [
        {
          "id": "org_sales",
          "name": "Отдел продаж",
          "head": { "id": "usr_mgr", "fullName": "..." },
          "children": []
        }
      ]
    }
  ]
}
```

---

## Notifications

### GET /notifications

```json
{
  "data": [
    {
      "id": "ntf_001",
      "type": "request_assigned",
      "title": "Новый запрос: Отпуск 10–24 июля",
      "requestId": "req_001",
      "isRead": false,
      "createdAt": "2026-07-07T10:05:00Z"
    }
  ],
  "meta": { "unreadCount": 3 }
}
```

### PATCH /notifications/:id/read

---

## Realtime (SSE)

### GET /events/stream

Server-Sent Events для live-обновлений.

```
event: request_updated
data: {"requestId": "req_001", "status": "approved"}

event: notification
data: {"id": "ntf_002", "type": "request_assigned", ...}
```

---

## Swagger / OpenAPI

При реализации — автогенерация из NestJS decorators (`@nestjs/swagger`). Файл `openapi.yaml` будет лежать в `apps/api/docs/`.

## Связанные документы

- [Архитектура](03-architecture.md)
- [Схема БД](06-database-schema.md)
- [Роли и права](08-roles-and-permissions.md)
