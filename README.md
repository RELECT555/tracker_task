# Request Tracker

Система трекинга запросов с иерархической маршрутизацией: сотрудники и руководители направляют запросы выше по цепочке, а маршрут определяется ролями, подразделениями и настраиваемыми правилами.

## Статус проекта

**Foundation + Request CRUD + Routing (submit) — готово.** Monorepo: NestJS API, Next.js Web, Prisma, Docker Compose для локальной БД.

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
| [12 — БД и окружения](docs/12-database-and-environments.md) | Локальная PostgreSQL, миграции, production |

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
npm install

# Локальная БД (Docker) — одной командой
npm run db:setup

# Или вручную:
# cp apps/api/.env.example apps/api/.env
# cp apps/web/.env.example apps/web/.env.local
# docker compose up -d postgres
# npm run db:generate && npm run db:migrate:deploy && npm run db:seed

npm run dev
```

- API: http://localhost:3001/api/v1/health/ready
- Web: http://localhost:3000

**Без Docker?** — [12 — БД и окружения](docs/12-database-and-environments.md#локально-без-docker-windows)

Подробности — в [гайде по разработке](docs/09-development-guide.md) и [документации по БД](docs/12-database-and-environments.md).
