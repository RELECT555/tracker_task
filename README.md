# Request Tracker

Система трекинга запросов с иерархической маршрутизацией: сотрудники и руководители направляют запросы выше по цепочке, а маршрут определяется ролями, подразделениями и настраиваемыми правилами.

## Статус проекта

**Этап 0 (Foundation) — в работе.** Monorepo поднят: NestJS API, Next.js Web, shared-пакет, Prisma-схема, Docker Compose.

## Документация

| Документ | Описание |
|----------|----------|
| [01 — Обзор системы](docs/01-overview.md) | Цели, пользователи, сценарии, глоссарий |
| [02 — Доменная модель](docs/02-domain-model.md) | Сущности, агрегаты, события, инварианты |
| [03 — Архитектура](docs/03-architecture.md) | Слои, модули, границы, стек |
| [04 — Движок маршрутизации](docs/04-routing-engine.md) | Правила, маршруты, эскалация |
| [05 — API](docs/05-api-specification.md) | REST-контракты, форматы, коды ошибок |
| [06 — Схема БД](docs/06-database-schema.md) | Таблицы, индексы, миграции |
| [07 — Фронтенд](docs/07-frontend-architecture.md) | FSD, состояние, UI-паттерны |
| [08 — Роли и права](docs/08-roles-and-permissions.md) | RBAC, политики доступа |
| [09 — Гайд по разработке](docs/09-development-guide.md) | Структура репозитория, CI, этапы |
| [10 — Design System](docs/10-design-system.md) | Темы, токены, компоненты, типографика |
| [11 — Архитектурные правила](docs/11-architecture-rules.md) | Clean + FSD, anti-patterns, чеклисты |

## Рекомендуемый стек

| Слой | Технология |
|------|------------|
| Backend | TypeScript, NestJS (или Fastify), PostgreSQL, Prisma |
| Frontend | TypeScript, React, Next.js, TanStack Query, Zustand |
| Auth | JWT + refresh tokens, интеграция с корпоративным SSO (опционально) |
| Realtime | WebSocket / SSE для уведомлений о статусах |
| Infra | Docker, GitHub Actions |

Стек можно заменить; архитектурные принципы (Clean Architecture, DDD-lite, FSD) остаются неизменными.

## Ключевые принципы

1. **Домен в центре** — бизнес-логика не зависит от фреймворков и БД.
2. **Явная маршрутизация** — каждый запрос имеет прозрачный маршрут с историей переходов.
3. **RBAC + контекст** — доступ определяется ролью, подразделением и участием в запросе.
4. **Аудит** — все значимые действия фиксируются в журнале.
5. **Расширяемость** — новые типы запросов и правила маршрутизации добавляются без переписывания ядра.

## Структура репозитория (целевая)

```
tracker_task/
├── docs/                  # Архитектурная документация
├── apps/
│   ├── api/               # Backend (NestJS)
│   └── web/               # Frontend (Next.js)
├── packages/
│   ├── shared/            # Общие типы, константы, утилиты
│   └── eslint-config/     # Общие правила линтинга
├── docker-compose.yml
└── README.md
```

## Быстрый старт

```bash
# 1. Инфраструктура (PostgreSQL, Redis, MinIO)
docker compose up -d

# 2. Зависимости
npm install

# 3. Env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. БД
npm run db:generate
npm run db:migrate -w @tracker/api -- --name init
npm run db:seed

# 5. Запуск
npm run dev
```

- API: http://localhost:3001/api/v1/health
- Web: http://localhost:3000

Подробности — в [гайде по разработке](docs/09-development-guide.md).
