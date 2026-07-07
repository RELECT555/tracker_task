# 08 — Роли и права доступа (RBAC)

## Модель доступа

Комбинация **RBAC** (роли) и **ABAC** (контекстные атрибуты: участие в запросе, подразделение).

```
Access = Role Permissions ∩ Context Policies
```

- **Role Permissions** — статический набор: «роль manager может approve».
- **Context Policies** — динамические: «approve только если user = текущий assignee».

## Роли

| Роль | code | Описание |
|------|------|----------|
| Сотрудник | `employee` | Базовая роль, есть у всех |
| Руководитель | `manager` | Обработка запросов подчинённых |
| Директор | `director` | Эскалированные и стратегические запросы |
| Администратор | `admin` | Полный доступ к конфигурации |
| Наблюдатель | `observer` | Только чтение всех запросов |

Роли назначаются через `user_roles`. Пользователь может иметь несколько ролей.

## Матрица permissions

| Permission | employee | manager | director | admin | observer |
|------------|:--------:|:-------:|:--------:|:-----:|:--------:|
| `request:create` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `request:read:own` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `request:read:all` | ✗ | ✗ | ✗ | ✓ | ✓ |
| `request:update:own` | ✓* | ✓* | ✓* | ✓ | ✗ |
| `request:submit` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `request:cancel:own` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `request:approve` | ✗ | ✓** | ✓** | ✓** | ✗ |
| `request:reject` | ✗ | ✓** | ✓** | ✓** | ✗ |
| `request:escalate` | ✗ | ✓** | ✓** | ✓ | ✗ |
| `request:request-info` | ✗ | ✓** | ✓** | ✓** | ✗ |
| `request:provide-info` | ✓*** | ✓*** | ✓*** | ✓ | ✗ |
| `request:reassign` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `request:select-route` | ✓**** | ✓ | ✓ | ✓ | ✗ |
| `request:build-personal-route` | ✓***** | ✓ | ✓ | ✓ | ✗ |
| `comment:create` | ✓*** | ✓** | ✓** | ✓ | ✗ |
| `comment:create:internal` | ✗ | ✓** | ✓** | ✓ | ✗ |
| `attachment:upload` | ✓*** | ✓** | ✓** | ✓ | ✗ |
| `route-template:manage` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `request-type:manage` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `user:manage` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `org-unit:manage` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `audit:read` | ✗ | ✗ | ✗ | ✓ | ✓ |

**Примечания:**

- \* Только в статусе `draft`
- \** Только если user = текущий assignee
- \*** Только если user = author и status = `pending_info` (provide-info) или участник запроса (comment/upload)
- \**** Только маршруты из `allowedManualRoutes` для данного типа
- \***** Только если `RequestType.allowsPersonalRoute = true`; нельзя назначить себя

## Context Policies

```typescript
// application/policies/request.policy.ts

interface PolicyContext {
  user: User;
  request: Request;
  action: string;
}

class RequestPolicy {
  canApprove(ctx: PolicyContext): boolean {
    if (!this.hasPermission(ctx.user, 'request:approve')) return false;
    return this.isCurrentAssignee(ctx.user, ctx.request);
  }

  canRead(ctx: PolicyContext): boolean {
    if (this.hasPermission(ctx.user, 'request:read:all')) return true;
    if (ctx.request.authorId === ctx.user.id) return true;
    if (this.isParticipant(ctx.user, ctx.request)) return true;
    return false;
  }

  canCancel(ctx: PolicyContext): boolean {
    if (ctx.request.status === 'approved' || ctx.request.status === 'rejected') {
      return false;
    }
    if (ctx.request.authorId === ctx.user.id) return true;
    return this.hasPermission(ctx.user, 'request:reassign'); // admin
  }

  private isCurrentAssignee(user: User, request: Request): boolean {
    const step = request.route.steps[request.currentStepIndex];
    return step?.assigneeId === user.id && step.status === 'active';
  }

  private isParticipant(user: User, request: Request): boolean {
    return request.route.steps.some(s => s.assigneeId === user.id);
  }
}
```

## Реализация на Backend

### Guard (Presentation Layer)

```typescript
@RequirePermission('request:approve')
@Post(':id/approve')
async approve(@Param('id') id: string, @CurrentUser() user: User) {
  return this.approveHandler.execute({ requestId: id, actorId: user.id });
}
```

### Policy Check (Application Layer)

```typescript
class ApproveRequestHandler {
  async execute(cmd: ApproveRequestCommand): Promise<void> {
    const request = await this.repo.findById(cmd.requestId);
    const user = await this.userRepo.findById(cmd.actorId);

    if (!this.policy.canApprove({ user, request, action: 'approve' })) {
      throw new AccessDeniedError();
    }

    request.approve(cmd.actorId, cmd.comment);
    await this.repo.save(request);
  }
}
```

Двойная проверка: guard (role) + policy (context).

## Реализация на Frontend

### Conditional Rendering

```typescript
// features/request-actions/ui/RequestActionBar.tsx
export function RequestActionBar({ request }: { request: Request }) {
  const { user } = useAuth();
  const permissions = useRequestPermissions(request, user);

  return (
    <div className="flex gap-2">
      {permissions.canApprove && <ApproveDialog requestId={request.id} />}
      {permissions.canReject && <RejectDialog requestId={request.id} />}
      {permissions.canEscalate && <EscalateDialog requestId={request.id} />}
      {permissions.canRequestInfo && <RequestInfoDialog requestId={request.id} />}
      {permissions.canCancel && <CancelDialog requestId={request.id} />}
    </div>
  );
}
```

### Permission Hook

```typescript
// entities/request/model/useRequestPermissions.ts
export function useRequestPermissions(request: Request, user: User) {
  return useMemo(() => ({
    canApprove: isAssignee(user, request) && hasRole(user, 'manager', 'director', 'admin'),
    canReject: isAssignee(user, request) && hasRole(user, 'manager', 'director', 'admin'),
    canEscalate: isAssignee(user, request) && hasRole(user, 'manager', 'director'),
    canRequestInfo: isAssignee(user, request),
    canProvideInfo: isAuthor(user, request) && request.status === 'pending_info',
    canCancel: (isAuthor(user, request) || hasRole(user, 'admin'))
      && !['approved', 'rejected'].includes(request.status),
    canComment: isAuthor(user, request) || isParticipant(user, request),
    canInternalComment: isAssignee(user, request) || hasRole(user, 'admin'),
  }), [request, user]);
}
```

Frontend permissions — **только для UX** (скрытие кнопок). Авторизация всегда проверяется на backend.

## Организационный контекст

Руководитель видит запросы подчинённых не через `request:read:all`, а через контекст:

```typescript
canReadSubordinateRequest(user: User, request: Request): boolean {
  const author = await this.userRepo.findById(request.authorId);
  return author.managerId === user.id
    || this.isInOrgSubtree(user.orgUnitId, author.orgUnitId);
}
```

Это позволяет руководителю видеть запросы своего отдела без роли `observer`.

## Admin vs Observer

| | Admin | Observer |
|---|-------|----------|
| Чтение всех запросов | ✓ | ✓ |
| Изменение конфигурации | ✓ | ✗ |
| Действия над запросами | ✓ (reassign) | ✗ |
| Управление пользователями | ✓ | ✗ |
| Аудит | ✓ | ✓ |

## Аудит доступа

Каждый отказ в доступе логируется:

```json
{
  "action": "access_denied",
  "entityType": "request",
  "entityId": "req_001",
  "actorId": "usr_abc",
  "payload": {
    "attemptedAction": "approve",
    "reason": "not_current_assignee"
  }
}
```

## Связанные документы

- [Доменная модель](02-domain-model.md)
- [API](05-api-specification.md)
- [Архитектура](03-architecture.md)
