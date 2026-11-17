# syntax=docker/dockerfile:1.7
#
# Образы API (NestJS + Prisma). Контекст сборки — корень репозитория.
#
#   target `api`      — сам сервис (порт 3001, пользователь 10001, read-only rootfs)
#   target `migrate`  — одноразовый образ с prisma CLI: `prisma migrate deploy`
#
# Приватный npm-реестр (@mtkit/*, Azure Artifacts) требует токен. Он передаётся как
# BuildKit-секрет и НЕ попадает ни в слои, ни в историю образа:
#
#   docker build -f deploy/docker/api.Dockerfile --target api \
#     --secret id=npmrc,src=$HOME/.npmrc -t tracker-api:local .
#
# Подробности и CI-примеры: docs/deploy.md

ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
WORKDIR /app
# openssl нужен движку миграций Prisma (schema-engine); apk upgrade подтягивает патчи ОС, чтобы Trivy не ругался на них.
RUN apk upgrade --no-cache && apk add --no-cache openssl

# ---------------------------------------------------------------------------
# Все зависимости (с dev) для сборки. Ставим только api + shared: web тут не нужен.
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --ignore-scripts --no-audit --no-fund \
      --workspace=@tracker/api --workspace=@tracker/shared

# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# prisma.config.ts требует DATABASE_URL даже для generate (к базе при этом не подключается),
# поэтому подставляем заглушку только на время этой команды: в образ она не попадает.
RUN npm run build --workspace=@tracker/shared \
 && cd apps/api \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" npx --no-install prisma generate \
 && npm run build

# ---------------------------------------------------------------------------
# Только production-зависимости (без dev, без prisma CLI).
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
      --workspace=@tracker/api --workspace=@tracker/shared \
 && npm cache clean --force
# Сгенерированный Prisma Client (на той же ОС/openssl, что и рантайм).
COPY --from=build /app/node_modules/.prisma node_modules/.prisma

# ---------------------------------------------------------------------------
# Утилита миграций: prisma CLI ровно той версии, что в package-lock.json.
FROM base AS migrate-tools
COPY --from=deps /app/node_modules/prisma/package.json /tmp/prisma-package.json
RUN PRISMA_VERSION="$(node -p "require('/tmp/prisma-package.json').version")" \
 && mkdir -p /opt/prisma \
 && cd /opt/prisma \
 && npm init -y >/dev/null \
 && npm install --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
 && npm cache clean --force

# ---------------------------------------------------------------------------
FROM base AS migrate
ENV NODE_ENV=production \
    HOME=/tmp \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
# Конфиг и схема лежат рядом с node_modules утилиты: prisma.config.ts импортирует `prisma/config`.
COPY --from=migrate-tools /opt/prisma /opt/prisma
COPY apps/api/prisma /opt/prisma/prisma
COPY apps/api/prisma.config.ts /opt/prisma/prisma.config.ts
WORKDIR /opt/prisma
USER 10001:10001
# Разовая задача, а не сервис: проверка здоровья не нужна.
HEALTHCHECK NONE
ENTRYPOINT ["/opt/prisma/node_modules/.bin/prisma"]
# DATABASE_URL берётся из окружения; схема и миграции — из prisma.config.ts.
CMD ["migrate", "deploy"]

# ---------------------------------------------------------------------------
# Целевой образ по умолчанию (должен быть последним в файле).
FROM base AS api
ENV NODE_ENV=production \
    PORT=3001
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app -H -s /sbin/nologin app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER 10001:10001
EXPOSE 3001
# Liveness без зависимости от БД: /health не ходит в PostgreSQL.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Node — PID 1: Nest сам ловит SIGTERM (enableShutdownHooks) и закрывает Prisma.
CMD ["node", "dist/src/main.js"]
