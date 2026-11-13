# Roadmap

Веб-приложение для планирования проектов, инициатив и загрузки команды.

## Структура

- `apps/web` — Next.js интерфейс Roadmap
- `apps/api` — NestJS API и интеграция с Azure DevOps
- `apps/api/prisma` — схема базы данных и миграции
- `docs/13-roadmap.md` — планирование и синхронизация с Azure DevOps

## Запуск

```bash
npm install
npm run db:setup
npm run dev
```

`npm run db:setup` запускает PostgreSQL через Docker Compose, применяет миграции и создаёт локальные учётные записи. При использовании собственного PostgreSQL скопируйте `apps/api/.env.example` в `apps/api/.env`, укажите `DATABASE_URL` и выполните `npm run db:generate`, `npm run db:migrate:deploy` и `npm run db:seed`.

Веб-приложение открывает Roadmap по адресу `http://localhost:3000/roadmap`, API доступен по адресу `http://localhost:3001/api/v1`.

Для production API используйте `AUTH_MODE=strict` и отдельный `JWT_SECRET` длиной от 32 символов. При неверной конфигурации API остановится при запуске.
