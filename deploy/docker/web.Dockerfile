# syntax=docker/dockerfile:1.7
#
# Образ веба: статика Vite (React SPA) за nginx без root-прав. Порт 8080.
# Контекст сборки — корень репозитория.
#
#   docker build -f deploy/docker/web.Dockerfile -t tracker-web:local .
#
# VITE_API_URL вшивается при сборке. По умолчанию — относительный путь /api/v1:
# Ingress отдаёт фронт и API с одного домена, CORS не нужен, образ один на все стенды.
# Приватный реестр здесь не нужен: ставятся только пакеты web и shared.

ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund \
      --workspace=@tracker/web --workspace=@tracker/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_URL=/api/v1
ARG VITE_ROADMAP_DEMO=false
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_ROADMAP_DEMO=${VITE_ROADMAP_DEMO}
RUN npm run build --workspace=@tracker/shared \
 && npm run build --workspace=@tracker/web

# ---------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS web
USER root
# Патчи ОС базового образа (иначе Trivy находит исправленные CVE в alpine-пакетах).
RUN apk upgrade --no-cache
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# 10001 — тот же uid, что задаёт securityContext в Kubernetes; писать нужно только в /tmp.
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
