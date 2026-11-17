# Деплой в Kubernetes

Памятка для DevOps: как собрать образы, чем проверять и что выкатывать. Для стенда на Coder смотрите [coder.md](coder.md).

## Что за чем стоит

```
Интернет ─▶ Ingress (tracker.example.com)
              ├─ /api/v1 ─▶ Service tracker-api :3001 ─▶ Pod api  ─▶ PostgreSQL (внешний, управляемый)
              └─ /       ─▶ Service tracker-web :8080 ─▶ Pod web  (nginx со статикой SPA)
```

| Компонент | Что это | Образ | Порт |
| --- | --- | --- | --- |
| `tracker-web` | React SPA (Vite), раздаётся nginx без root | `deploy/docker/web.Dockerfile` | 8080 |
| `tracker-api` | NestJS + Prisma | `deploy/docker/api.Dockerfile`, target `api` | 3001 |
| миграции | `prisma migrate deploy` | `deploy/docker/api.Dockerfile`, target `migrate` | — |

PostgreSQL в манифесты не входит: предполагается управляемая БД (PostgreSQL 16, `sslmode=require`). Для локального запуска есть `docker-compose.yml`.

Фронт и API живут на одном домене, поэтому фронт собирается с `VITE_API_URL=/api/v1`, CORS не нужен, а один и тот же образ веба подходит для всех стендов.

## Health-эндпоинты

Авторизация не нужна, префикс `/api/v1`.

| Эндпоинт | Назначение | Ходит в БД | Ответ |
| --- | --- | --- | --- |
| `GET /api/v1/health` | liveness и startup: процесс жив | нет | `200 {"status":"ok","service":"tracker-api",...}` |
| `GET /api/v1/health/ready` | readiness: можно слать трафик | да, `SELECT 1`, таймаут 3 с | `200 {"status":"ok","db":true}` или `503 {"status":"degraded","db":false}` |
| `GET /healthz` (web) | liveness и readiness nginx | — | `200 ok` |

Liveness специально не проверяет БД: если PostgreSQL недоступен, под выводится из балансировки (readiness), но не перезапускается. API умеет стартовать без БД и сам переподключится.

## Сборка образов

Контекст сборки всегда корень репозитория. Нужен BuildKit (`DOCKER_BUILDKIT=1`, в современном Docker включён по умолчанию).

Пакеты `@mtkit/*` лежат в приватном реестре Azure Artifacts, поэтому сборка API требует токен. Он передаётся как секрет BuildKit и не попадает в слои образа:

```bash
docker build -f deploy/docker/api.Dockerfile --target api \
  --secret id=npmrc,src=$HOME/.npmrc -t registry.example.com/tracker/api:<tag> .
```

```bash
docker build -f deploy/docker/api.Dockerfile --target migrate \
  --secret id=npmrc,src=$HOME/.npmrc -t registry.example.com/tracker/api-migrate:<tag> .
```

```bash
docker build -f deploy/docker/web.Dockerfile -t registry.example.com/tracker/web:<tag> .
```

Файл для `--secret` — обычный `.npmrc` с доступом к реестру (в формате `~/.npmrc` разработчика: `username`, `_password` с base64 от PAT с правом Packaging → Read, `email`). В CI создавайте его из секретной переменной пайплайна. Образу веба токен не нужен.

Образы запускаются от пользователя `10001`, подходят для `readOnlyRootFilesystem`. Базовые образы задаются аргументами `NODE_IMAGE` и `NGINX_IMAGE`; для воспроизводимых сборок закрепите их по дайджесту (`--build-arg NODE_IMAGE=node:22-alpine@sha256:...`). Во время `prisma generate` нужен доступ к `binaries.prisma.sh`.

Теги: используйте версию или короткий SHA коммита, не `latest`.

## Манифесты

```
deploy/k8s/
├── base/                  # всё, что нужно приложению (Kustomize)
├── overlays/example/      # пример стенда: образы, домен
└── secret.example.yaml    # шаблон Secret (в kustomization НЕ входит)
```

Что описано в `base`: Namespace с Pod Security `restricted`, ServiceAccount без токена, ConfigMap, Deployment и Service для api и web, Ingress, PodDisruptionBudget для web, NetworkPolicy (запрет по умолчанию и точечные разрешения).

Выкатка:

```bash
kubectl apply -f deploy/k8s/base/namespace.yaml
```

```bash
kubectl -n tracker create secret generic tracker-api-secrets \
  --from-literal=DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/tracker?schema=public&sslmode=require' \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=LOCAL_ADMIN_PASSWORD='<не короче 12 символов>' \
  --from-literal=ROADMAP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

```bash
kubectl apply -k deploy/k8s/overlays/example
```

Для своего стенда скопируйте `overlays/example`, поменяйте теги образов, домен Ingress и `CORS_ORIGIN`. В CI теги удобно ставить так: `kustomize edit set image registry.example.com/tracker/api=registry.example.com/tracker/api:<tag>`. Итоговый YAML до применения: `kubectl kustomize deploy/k8s/overlays/example`.

### Миграции

Миграции применяет init-контейнер `migrate` в поде API перед каждым стартом. `prisma migrate deploy` берёт advisory-lock в PostgreSQL, поэтому параллельный запуск безопасен. Если миграция упала, новый под не стартует, а старый продолжает работать. Если у вас GitOps с хуками (Argo CD `PreSync`, Helm hook), init-контейнер можно заменить на Job с тем же образом (команда по умолчанию уже `prisma migrate deploy`, конфигурация в `prisma.config.ts`, нужна только переменная `DATABASE_URL`).

Откат миграций Prisma не делает: откатывайте приложение на предыдущий образ, а схему меняйте только обратно совместимыми миграциями.

## Переменные окружения API

Несекретные лежат в ConfigMap `tracker-api-config`, секретные — в Secret `tracker-api-secrets`.

| Переменная | Где | Обязательна | Описание |
| --- | --- | --- | --- |
| `DATABASE_URL` | Secret | да | строка подключения к PostgreSQL. Параметры `schema` и `connection_limit` (размер пула) поддерживаются, `pgbouncer` игнорируется. В production `sslmode=require`: драйвер `pg` трактует его как проверку сертификата (verify-full); если БД использует собственный CA, добавьте `uselibpqcompat=true` или `sslrootcert` |
| `JWT_SECRET` | Secret | да | подпись JWT, не короче 32 символов, API не стартует с коротким |
| `AUTH_PROVIDER` | ConfigMap | нет | `local` (по умолчанию) или `entra` |
| `LOCAL_ADMIN_PASSWORD` | Secret | при `local` | пароль `admin@tracker.local`, не короче 12 символов |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_API_AUDIENCE` | ConfigMap | при `entra` | параметры Microsoft Entra ID, `ENTRA_API_SCOPE` по желанию |
| `ROADMAP_ENCRYPTION_KEY` | Secret | рекомендуется | ключ шифрования сохранённых доступов Azure; не задан — берётся `JWT_SECRET`. Задайте отдельный и не меняйте: после смены ключа сохранённые доступы станут нечитаемыми |
| `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT` | ConfigMap, Secret | нет | интеграция с Azure DevOps; то же можно задать из админки |
| `HRNNG_API_URL`, `HRNNG_MODEL`, `HRNNG_API_KEY` | ConfigMap, Secret | нет | AI-ассистент (OpenAI-совместимый API) |
| `CORS_ORIGIN` | ConfigMap | нет | публичный адрес фронта; при общем домене практически не используется |
| `PORT`, `NODE_ENV` | ConfigMap | нет | `3001`, `production` |

Полный список с комментариями: `apps/api/.env.example` и `.env.production.example`.

Исходящий трафик API: PostgreSQL (5432), Azure DevOps, Microsoft Entra ID (проверка токенов), LLM-провайдер (443). Входящий от Azure DevOps: service hooks на `POST /api/v1/roadmap/webhooks/azure-devops` (проверка по секретному заголовку), этот путь Ingress должен пропускать из внешней сети.

## Проверка Trivy

Конфиг лежит в [`trivy.yaml`](../trivy.yaml): `HIGH` и `CRITICAL`, уязвимости без исправления игнорируются, сканеры `vuln`, `secret`, `misconfig`. Всё сразу:

```bash
bash scripts/trivy-scan.sh            # репозиторий и манифесты
```

```bash
bash scripts/trivy-scan.sh --images   # плюс сборка и скан трёх образов
```

Что сделано, чтобы проверка проходила:

- Dockerfile: закреплённые мажорные теги (не `latest`), непривилегированный пользователь, `HEALTHCHECK`, секреты только через BuildKit, `apk upgrade` для патчей ОС, в рантайме нет dev-зависимостей и компилятора;
- манифесты: `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `drop: [ALL]`, `seccompProfile: RuntimeDefault`, requests и limits по CPU и памяти, явный namespace, токен ServiceAccount не монтируется, образы без `latest`;
- зависимости: в `package-lock.json` обновлены `@nestjs/platform-express`, `body-parser`, `multer`, `proxy-addr` (была критическая), `undici` и `qs` до исправленных версий, а также zod 3 → 4 и Prisma 6 → 7 (см. ниже).

### Обновлённые зависимости

`zod` обновлён до 4.6.7 (схемы в `packages/shared` переведены на zod 4). Для `@vercel/cli-config`, который жёстко закрепляет старый `zod` 4.1.11, в корневом `package.json` стоит `overrides`; из-за этого `npm ls zod` пишет `invalid`, на `npm ci` и сборку это не влияет.

Prisma обновлён до 7.10.1 (клиент работает через драйвер-адаптер `@prisma/adapter-pg`, подключение описано в `apps/api/src/shared/infrastructure/prisma/prisma-adapter.ts`). После этого `npm audit --omit=dev` чист: уровней high и critical не осталось.

Исключения добавляйте в [`.trivyignore`](../.trivyignore) только с причиной, владельцем и сроком пересмотра.

## Масштабирование и ограничения

- **API: одна реплика.** Фоновые задачи (синхронизация с Azure DevOps раз в минуту, импорт проектов раз в 5 минут, проверка здоровья синхронизации) запускаются на каждой реплике без выбора лидера. Алерты и запись в Azure рассчитаны на несколько экземпляров, а импорт проектов нет: вторая реплика удвоит запросы в Azure DevOps. Горизонтально масштабировать API можно после выноса задач в отдельный под или добавления блокировки.
- **Web: две реплики**, масштабируется свободно (статика).
- Данных на диске нет: оба пода работают с `readOnlyRootFilesystem`, писать им нужно только в `/tmp` (`emptyDir`).
- Ресурсы подобраны по оценке (api: 100m/256Mi запрос, 1 CPU/512Mi лимит; куча Node 384 МБ). Скорректируйте по метрикам после первых дней работы.

## Что нужно решить на вашей стороне

- реестр образов и схема тегов (в манифестах заглушка `registry.example.com/tracker/*`);
- Ingress-класс, имя namespace контроллера для NetworkPolicy (по умолчанию `ingress-nginx`), TLS (cert-manager или готовый Secret `tracker-tls`);
- где хранятся секреты (External Secrets, Sealed Secrets, Key Vault) и кто создаёт `tracker-api-secrets`;
- управляемый PostgreSQL, бэкапы, CIDR БД для сужения egress в NetworkPolicy;
- способ входа: `local` или `entra` (для `entra` нужны tenant, client id и audience приложений Entra);
- CI-пайплайн: сборка, `scripts/trivy-scan.sh`, публикация образов, `kubectl apply -k`.
