# 09 — Гайд по разработке

## Этапы реализации

```mermaid
gantt
    title Roadmap v1
    dateFormat  YYYY-MM-DD
    section Foundation
    Monorepo setup           :a1, 2026-07-07, 3d
    DB schema + migrations   :a2, after a1, 3d
    Auth module              :a3, after a2, 4d
    section Core
    Request CRUD             :b1, after a3, 5d
    Routing engine           :b2, after b1, 7d
    Request lifecycle        :b3, after b2, 5d
    section Frontend
    Auth + Layout            :c1, after a3, 4d
    Inbox / Outbox           :c2, after b3, 5d
    Request detail + actions :c3, after c2, 5d
    Create request flow      :c4, after c3, 4d
    section Admin & Polish
    Admin panels             :d1, after c4, 5d
    Notifications            :d2, after d1, 3d
    SLA cron                 :d3, after d2, 2d
    Testing + QA             :d4, after d3, 5d
```

## Этап 0: Инициализация monorepo

### Структура

```bash
tracker_task/
├── apps/
│   ├── api/                 # NestJS backend
│   └── web/                 # Next.js frontend
├── packages/
│   └── shared/              # Shared types & validation
├── docs/
├── docker-compose.yml
├── package.json             # Root workspace
├── turbo.json               # Turborepo config
└── tsconfig.base.json
```

### Команды инициализации

```bash
# Root workspace
npm init -y
npm install turbo --save-dev

# Backend
npx @nestjs/cli new api --directory apps/api --package-manager npm
cd apps/api && npm install @prisma/client prisma class-validator class-transformer

# Frontend
npx create-next-app@latest web --typescript --tailwind --app --src-dir --directory apps/web

# Shared package
mkdir -p packages/shared/src
cd packages/shared && npm init -y
```

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: tracker
      POSTGRES_PASSWORD: tracker
      POSTGRES_DB: tracker
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  pgdata:
  minio_data:
```

### Environment Variables

```bash
# apps/api/.env
DATABASE_URL=postgresql://tracker:tracker@localhost:5432/tracker
JWT_SECRET=change-me-in-production
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=tracker-attachments

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

## Этап 1: Backend Foundation

### Порядок модулей

1. **shared/** — BaseEntity, DomainEvent, ValueObject, exception filters
2. **identity/** — User, Role, OrgUnit, Auth (JWT)
3. **routing/** — RouteTemplate, RequestType, AssigneeResolver
4. **request/** — Request aggregate, lifecycle, inbox/outbox
5. **notification/** — In-app + email
6. **audit/** — AuditLog event handler

### Принципы кодирования (Backend)

- Один use case = один handler class.
- Domain entity не имеет публичных setters — только методы (`approve()`, `reject()`).
- Repository возвращает domain entities, не Prisma models.
- Mapper: Prisma model ↔ Domain entity — отдельный класс.
- DTO validation через `class-validator` в presentation layer.
- Тесты domain layer — без БД, без NestJS.

### Пример теста domain

```typescript
describe('Request', () => {
  it('should transition from draft to submitted', () => {
    const request = Request.create({ ... });
    request.submit();
    expect(request.status).toBe('submitted');
    expect(request.pullEvents()).toContainEqual(
      expect.objectContaining({ type: 'RequestSubmitted' }),
    );
  });

  it('should not approve if not in_progress', () => {
    const request = Request.create({ status: 'draft' });
    expect(() => request.approve('usr_1')).toThrow(InvalidTransitionError);
  });
});
```

## Этап 2: Frontend Foundation

### Порядок экранов

1. Login + Auth provider
2. Dashboard layout (Sidebar, Header)
3. Inbox (таблица + фильтры)
4. Request detail (карточка + timeline + actions)
5. Create request (wizard: type → fields → route → submit)
6. Outbox
7. Admin panels
8. Notifications

### Принципы кодирования (Frontend)

- Компоненты — только рендер; логика в hooks.
- Server state — TanStack Query; не дублировать в Zustand.
- Формы — React Hook Form; schema из `packages/shared`.
- Каждый feature — self-contained (ui + model).
- `'use client'` только где нужна интерактивность.

## Этап 3: Shared Package

```typescript
// packages/shared/src/validation/create-request.schema.ts
import { z } from 'zod';

export const createRequestSchema = z.object({
  typeId: z.string().uuid(),
  title: z.string().min(1).max(500),
  fields: z.record(z.unknown()),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  routeTemplateId: z.string().uuid().nullable().optional(),
});

export type CreateRequestDto = z.infer<typeof createRequestSchema>;
```

Используется и на backend (валидация), и на frontend (форма).

## Git Workflow

```
main          ← production
  └── develop ← integration
        ├── feature/request-crud
        ├── feature/routing-engine
        └── feature/inbox-ui
```

- Feature branches от `develop`.
- PR → code review → merge.
- `main` ← `develop` при релизе.

### Commit Convention

```
feat: add request approval flow
fix: SLA escalation cron timezone
docs: update API specification
refactor: extract AssigneeResolver
test: add routing engine unit tests
```

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: tracker
          POSTGRES_PASSWORD: tracker
          POSTGRES_DB: tracker_test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

## Code Quality

| Инструмент | Назначение |
|------------|------------|
| ESLint | Linting (shared config) |
| Prettier | Formatting |
| Husky + lint-staged | Pre-commit hooks |
| TypeScript strict | Type safety |

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Definition of Done (DoD)

Задача считается завершённой, когда:

- [ ] Код написан и проходит lint + typecheck
- [ ] Unit-тесты для domain logic
- [ ] API endpoint документирован (Swagger decorator)
- [ ] Frontend отображает результат корректно
- [ ] RBAC проверен (backend policy + frontend UX)
- [ ] PR reviewed и merged

## Чеклист перед MVP

- [ ] Auth: login, refresh, logout
- [ ] CRUD request types (admin)
- [ ] CRUD route templates (admin)
- [ ] Create + submit request
- [ ] Routing engine: auto + manual routes
- [ ] Inbox / Outbox lists
- [ ] Approve / Reject / Request Info / Escalate
- [ ] Route timeline visualization
- [ ] Comments + attachments
- [ ] In-app notifications
- [ ] SLA auto-escalation
- [ ] Audit log
- [ ] User + org management (admin)

## Связанные документы

- [Обзор](01-overview.md)
- [Архитектура](03-architecture.md)
- [API](05-api-specification.md)
- [Схема БД](06-database-schema.md)
