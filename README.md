# Roadmap

Веб-приложение для планирования проектов, инициатив и загрузки команды.

## Структура

- `apps/web` — Next.js интерфейс Roadmap
- `apps/api` — NestJS API и интеграция с Azure DevOps
- `apps/api/prisma` — схема базы данных и миграции
- `docs/13-roadmap.md` — планирование и синхронизация с Azure DevOps
- `docs/coder.md` — как поднять и обновить стенд на Coder
- `docs/deploy.md` — образы, Kubernetes-манифесты, health-эндпоинты и проверка Trivy для DevOps
- `deploy/` — Dockerfile'ы (`deploy/docker`) и манифесты Kubernetes (`deploy/k8s`)

## Запуск

```bash
npm install
npm run db:setup
```

`npm run db:setup` запускает PostgreSQL через Docker Compose и применяет миграции, включая создание локального администратора. При использовании собственного PostgreSQL скопируйте `apps/api/.env.example` в `apps/api/.env`, укажите `DATABASE_URL` и выполните `npm run db:generate` и `npm run db:migrate:deploy`.

Задайте `LOCAL_ADMIN_PASSWORD` и отдельный `JWT_SECRET` (от 32 символов) в `apps/api/.env`, затем выполните `npm run dev`. Логин администратора — `admin@tracker.local`. Минимальная длина пароля при `NODE_ENV=development` — 7 символов, в остальных окружениях — 12.

Веб-приложение открывает Roadmap по адресу `http://localhost:3000/roadmap`, API доступен по адресу `http://localhost:3001/api/v1`.

При обновлении существующего стенда примените `npm run db:migrate:deploy` и войдите заново. Если сохранённые данные интеграции Azure шифровались прежним `JWT_SECRET`, при его замене задайте `ROADMAP_ENCRYPTION_KEY` равным прежнему ключу, чтобы API мог прочитать их после перезапуска.

В разделе **Администрирование → Доступ к проектам** можно выдать сотруднику права по корпоративному email. Доступ хранится отдельно для каждого проекта. Сотрудники смогут использовать назначенные права после подключения корпоративного входа.
