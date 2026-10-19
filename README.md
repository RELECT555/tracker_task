# Roadmap

Веб-приложение для планирования проектов, инициатив и загрузки команды.

## Структура

- `apps/web` — Next.js интерфейс Roadmap
- `apps/api` — NestJS API и интеграция с Azure DevOps
- `apps/api/prisma` — схема базы данных и миграции
- `docs/13-roadmap.md` — продуктовый roadmap

## Запуск

```bash
npm install
npm run dev
```

Веб-приложение запускается на `http://localhost:3000`, API — на `http://localhost:3001`.
