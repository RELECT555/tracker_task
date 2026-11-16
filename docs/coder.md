# Roadmap на Coder

Как поднять и обновить стенд Roadmap на Coder-воркспейсе. Все команды выполняются в **Terminal** воркспейса (кнопка Terminal на странице воркспейса в Coder).

## Коротко

| Ситуация | Команда |
| --- | --- |
| На Git появились новые изменения | `cd ~/tracker_task && bash scripts/coder-up.sh --pull` |
| Воркспейс перезапустился, приложение не открывается | `cd ~/tracker_task && bash scripts/coder-up.sh` |
| Посмотреть лог приложения | `tail -f ~/roadmap.log` (выход — `Ctrl+C`, приложение продолжит работать) |
| Проверить, что API и база живы | `curl -s http://localhost:3001/api/v1/health/ready` → должно быть `"db":true` |

Скрипт [`scripts/coder-up.sh`](../scripts/coder-up.sh) делает всё сам: при `--pull` забирает код, затем запускает PostgreSQL в Docker, ставит зависимости, применяет миграции, перезапускает приложение (dev-режим с очищенным кэшем Vite или, с флагом `--prod`, production-сборку) и ждёт, пока API ответит. В конце он печатает «Готово» или понятную ошибку.

После запуска откройте порт **3000** через **Open ports** в Coder и перейдите на `/roadmap`. Обновите страницу с `Ctrl+Shift+R`, чтобы браузер не показал старую версию. Логин — `admin@tracker.local`, пароль — значение `LOCAL_ADMIN_PASSWORD` из `apps/api/.env`.

## Режим с минимальным потреблением памяти (`--prod`)

Обычный запуск — dev-режим: `turbo` + `nest start --watch` (компилятор TypeScript живёт в памяти) + Vite dev-сервер. Вместе с PostgreSQL это легко занимает 1,5 GiB и больше, то есть почти весь воркспейс на 2 GiB.

```bash
cd ~/tracker_task && bash scripts/coder-up.sh --pull --prod
```

Что меняется:

- приложение собирается один раз (`turbo build --concurrency=1`, куча Node ограничена 1 GiB), дальше работают только `node dist/src/main` (API, лимит кучи 256 MiB) и `vite preview` (статика фронта + прокси `/api/v1`, лимит 128 MiB). Ни watcher'ов, ни компиляции на лету;
- PostgreSQL в [`docker-compose.yml`](../docker-compose.yml) урезан: `shared_buffers=48MB`, `max_connections=30`, лимит контейнера 320 MiB;
- порт тот же, **3000**, адрес тот же.

Минус: правки в коде не подхватываются на лету. После каждого изменения (или `git pull`) запускайте команду снова, пересборка занимает около минуты. Для разработки на самом воркспейсе используйте обычный `bash scripts/coder-up.sh`.

Проверить, сколько реально занято:

```bash
free -m && ps -eo pid,rss,cmd --sort=-rss | head -8
```

Если сборка упирается в память (в логе `JavaScript heap out of memory` или процесс `Killed`), остановите приложение (`pkill -f "dist/src/main"; pkill -f vite`), запустите сборку ещё раз и затем `--prod`. Ещё лучше — увеличить RAM воркспейса в шаблоне Coder или собирать локально и не собирать на воркспейсе вовсе.

## Важно: данные не переживают перезапуск воркспейса

Docker на воркспейсе стартует пустым после каждого перезапуска. Вместе с контейнером пропадает и том с базой, поэтому после перезапуска база создаётся заново. Проекты, роли и подключение к Azure DevOps придётся настроить снова.

Чтобы данные сохранялись, нужен постоянный том для Docker в шаблоне Coder или внешний PostgreSQL (тогда поменяйте `DATABASE_URL` в `apps/api/.env`). Это настраивается в шаблоне воркспейса, а не в проекте.

## Рабочая ветка

Актуальный код сейчас в ветке **`feature/azure-sync-v2`**, а не в `main` (в `main` старая версия). Проверить, что стоит на воркспейсе:

```bash
cd ~/tracker_task && git fetch origin && git status -sb && git log --oneline -1
```

Первая строка должна быть `## feature/azure-sync-v2...origin/feature/azure-sync-v2` без `behind`. Если ветка другая:

```bash
git checkout feature/azure-sync-v2
```

## Первый запуск на новом воркспейсе

Нужно один раз, если папки `~/tracker_task` ещё нет.

```bash
cd ~ && git clone https://github.com/RELECT555/tracker_task.git && cd tracker_task
```

```bash
git checkout feature/azure-sync-v2
```

```bash
cp apps/api/.env.example apps/api/.env
```

Откройте `apps/api/.env` (например, `nano apps/api/.env`) и заполните:

- `LOCAL_ADMIN_PASSWORD` — пароль администратора, от 7 символов;
- `JWT_SECRET` — случайная строка от 32 символов, её можно получить командой `openssl rand -hex 32`;
- `ROADMAP_ENCRYPTION_KEY` — если переносите сохранённые настройки Azure со старого стенда, укажите прежний ключ (подробнее в [README](../README.md)).

`DATABASE_URL` менять не нужно: значение по умолчанию подходит для PostgreSQL из Docker Compose.

Затем запустите:

```bash
bash scripts/coder-up.sh
```

## Если что-то пошло не так

| Что видно | Причина | Что делать |
| --- | --- | --- |
| В логе `PostgreSQL unavailable — API starts in degraded mode` или `Can't reach database server at localhost:5432` | База не запущена, обычно после перезапуска воркспейса | `bash scripts/coder-up.sh` |
| В браузере `auth/refresh` отвечает 503, не получается войти | То же: API работает без базы | `bash scripts/coder-up.sh` |
| `auth/me` отвечает 401 до входа | Это нормально, вы ещё не вошли | Войдите |
| Новые изменения не видны | Не тот коммит или старый кэш | Проверьте ветку (раздел выше), запустите `bash scripts/coder-up.sh --pull`, обновите страницу с `Ctrl+Shift+R` |
| `Exit 254` у `npm run ...` | Команда запущена не из папки проекта | Сначала `cd ~/tracker_task` |
| Скрипт пишет «есть незакоммиченные изменения» | На воркспейсе правили файлы | `git stash`, затем снова `bash scripts/coder-up.sh --pull` |
| `Docker не отвечает` | Демон Docker не запущен | `sudo service docker start`, затем снова скрипт |

## Остановить приложение

```bash
pkill -f "turbo dev"; pkill -f "dist/src/main"; pkill -f vite
```

```bash
cd ~/tracker_task && docker compose stop postgres
```
