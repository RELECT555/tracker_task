# Database & Environments

Руководство по локальной PostgreSQL и подготовке к production.  
Один источник правды для схемы — `apps/api/prisma/schema.prisma`, миграции — в git.

---

## Стратегия окружений

| Окружение | БД | Миграции | Seed |
|-----------|-----|----------|------|
| **Local (dev)** | Docker Postgres или локальный Postgres | `migrate dev` / `migrate deploy` | ✅ `db:seed` |
| **CI** | Postgres service container | `migrate deploy` | опционально |
| **Production** | Managed PostgreSQL (RDS, Cloud SQL, …) | **`migrate deploy` only** | ❌ никогда автоматически |

### Принципы

1. **Миграции в git** — папка `apps/api/prisma/migrations/` коммитится целиком.
2. **Dev создаёт, prod применяет** — новые миграции создаются через `db:migrate`, на prod только `db:migrate:deploy`.
3. **Seed только для dev** — `prisma/seed.ts` блокируется при `NODE_ENV=production`.
4. **Один DATABASE_URL** — Prisma читает строку подключения из env, формат одинаковый везде.

---

## Быстрый старт (Docker — рекомендуется)

### Требования

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS / Linux)
- Node.js 20+

### Одной командой

```bash
npm install
npm run db:setup
npm run dev
```

Скрипт `db:setup`:
1. Поднимает контейнер `tracker-postgres`
2. Ждёт готовности БД
3. `prisma generate` + `migrate deploy` + `seed`

### Вручную

```bash
# 1. Env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 2. PostgreSQL
docker compose up -d postgres

# 3. Миграции и seed
npm run db:generate
npm run db:migrate:deploy
npm run db:seed

# 4. Проверка
curl http://localhost:3001/api/v1/health/ready
```

Ожидаемый ответ ready: `{ "status": "ok", "db": true }`.

---

## Локально без Docker (Windows)

Если Docker недоступен — установите PostgreSQL 16:

1. Скачайте [PostgreSQL for Windows](https://www.postgresql.org/download/windows/)
2. Создайте БД и пользователя:

```sql
CREATE USER tracker WITH PASSWORD 'tracker';
CREATE DATABASE tracker OWNER tracker;
GRANT ALL PRIVILEGES ON DATABASE tracker TO tracker;
```

3. В `apps/api/.env`:

```env
DATABASE_URL="postgresql://tracker:tracker@localhost:5432/tracker?schema=public"
```

4. Примените миграции:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

---

## Docker Compose

### Только PostgreSQL (минимум для разработки)

```bash
docker compose up -d postgres
```

### Полный стек (Postgres + Redis + MinIO)

```bash
docker compose --profile full up -d
```

| Сервис | Порт | Назначение |
|--------|------|------------|
| postgres | 5432 | Основная БД |
| redis | 6379 | Очереди, кэш (будущее) |
| minio | 9000 / 9001 | S3-совместимое хранилище вложений |

Переопределение портов/паролей — через `.env` в корне (см. `.env.docker.example`).

---

## Команды npm

| Команда | Когда использовать |
|---------|-------------------|
| `npm run db:up` | Поднять Postgres в Docker |
| `npm run db:down` | Остановить контейнеры |
| `npm run db:setup` | Полная локальная инициализация |
| `npm run db:generate` | Обновить Prisma Client после изменения schema |
| `npm run db:migrate` | **Dev:** создать и применить новую миграцию |
| `npm run db:migrate:deploy` | **CI/Prod:** применить существующие миграции |
| `npm run db:migrate:reset` | **Dev only:** сброс БД + все миграции + seed |
| `npm run db:seed` | Заполнить dev-данными (идемпотентный upsert) |
| `npm run db:status` | Проверить состояние миграций |

### Создание новой миграции (разработчик)

```bash
# После изменения prisma/schema.prisma
npm run db:migrate -w @tracker/api -- --name add_notifications
```

Коммитьте:
- `prisma/migrations/<timestamp>_<name>/migration.sql`
- `prisma/migrations/migration_lock.toml`

---

## Seed-данные (dev)

Файл: `apps/api/prisma/seed.ts`

| Сущность | ID / email |
|----------|------------|
| Admin | `00000000-0000-4000-8000-000000000002` / admin@tracker.local |
| Manager | `00000000-0000-4000-8000-000000000003` / manager@tracker.local |
| Org unit | `00000000-0000-4000-8000-000000000001` |
| Тип «Отпуск» | `00000000-0000-4000-8000-000000000101` |
| Тип «Закупка» | `00000000-0000-4000-8000-000000000102` |

Переключение dev-пользователя API:

```env
DEV_USER_ID=00000000-0000-4000-8000-000000000003   # manager → inbox
```

---

## Production

### Env

Скопируйте `apps/api/.env.production.example` в секрет-хранилище.  
**Обязательно:**

- `NODE_ENV=production`
- `DATABASE_URL` с `sslmode=require`
- Сильный `JWT_SECRET` (≥ 32 символов, случайный)
- **Не задавайте** `DEV_USER_ID`

Пример DATABASE_URL:

```
postgresql://tracker_app:SECRET@db.internal:5432/tracker?schema=public&sslmode=require
```

### Деплой миграций

В CI/CD **перед** запуском новой версии API:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run build -w @tracker/api
# start API
```

`migrate deploy` не создаёт новых миграций и не запускает seed — безопасно для prod.

### Connection pooling

Для высокой нагрузки — PgBouncer или managed pooler:

```
postgresql://user:pass@pooler:6432/tracker?schema=public&sslmode=require&pgbouncer=true
```

Prisma docs: [Connection pooling](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool).

### Backup

- Managed DB: включите automated backups (PITR).
- Self-hosted: `pg_dump` по расписанию + проверка restore.

---

## CI (GitHub Actions)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: tracker
      POSTGRES_PASSWORD: tracker
      POSTGRES_DB: tracker_test
    ports: ['5432:5432']
    options: >-
      --health-cmd "pg_isready -U tracker -d tracker_test"
      --health-interval 5s
      --health-retries 5

env:
  DATABASE_URL: postgresql://tracker:tracker@localhost:5432/tracker_test?schema=public

steps:
  - run: npm ci
  - run: npm run db:generate
  - run: npm run db:migrate:deploy
  - run: npm test
  - run: npm run build
```

---

## Troubleshooting

### API в degraded mode (`db: false`)

- Postgres не запущен → `docker compose up -d postgres` или `npm run db:up`
- Неверный `DATABASE_URL` в `apps/api/.env`
- Миграции не применены → `npm run db:migrate:deploy`

### `EPERM` при `prisma generate` (Windows)

Остановите dev-сервер API и повторите `npm run db:generate`.

### Docker не найден

Используйте локальный PostgreSQL (см. раздел выше) или установите Docker Desktop.

### Сброс локальной БД

```bash
npm run db:migrate:reset -w @tracker/api
```

Удалит все данные и пересоздаст схему + seed.

---

## Связанные документы

- [06 — Схема БД](06-database-schema.md)
- [09 — Гайд по разработке](09-development-guide.md)
- [Prisma Migrate docs](https://www.prisma.io/docs/orm/prisma-migrate)
