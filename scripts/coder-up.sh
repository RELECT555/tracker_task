#!/usr/bin/env bash
# Поднимает (или обновляет) Roadmap на Coder-воркспейсе одной командой.
#
#   bash scripts/coder-up.sh          # поднять после перезапуска воркспейса
#   bash scripts/coder-up.sh --pull   # сначала забрать свежий код из Git
#   bash scripts/coder-up.sh --prod   # лёгкий режим: сборка + node dist (в разы меньше RAM)
#   (флаги можно сочетать: --pull --prod)
#
# Подробности: docs/coder.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${ROADMAP_LOG:-$HOME/roadmap.log}"
API_READY_URL="http://localhost:3001/api/v1/health/ready"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mОшибка: %s\033[0m\n' "$*" >&2; exit 1; }

cd "$ROOT"

PULL=false
PROD=false
for arg in "$@"; do
  case "$arg" in
    --pull) PULL=true ;;
    --prod) PROD=true ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) fail "неизвестный аргумент: $arg" ;;
  esac
done

[ -f apps/api/.env ] || fail "нет apps/api/.env. Скопируйте apps/api/.env.example и заполните LOCAL_ADMIN_PASSWORD и JWT_SECRET (см. docs/coder.md)."

if $PULL; then
  step "Обновляю код из Git"
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    fail "есть незакоммиченные изменения. Сохраните их (git stash) и запустите снова."
  fi
  git fetch origin
  git pull --ff-only
fi
echo "Ветка: $(git branch --show-current), коммит: $(git log --oneline -1)"

step "Запускаю PostgreSQL"
docker info >/dev/null 2>&1 || fail "Docker не отвечает. Попробуйте: sudo service docker start"
docker compose up -d postgres
for i in $(seq 1 60); do
  if docker exec tracker-postgres pg_isready -U tracker -d tracker >/dev/null 2>&1; then
    echo "PostgreSQL готов."
    break
  fi
  [ "$i" -eq 60 ] && fail "PostgreSQL не поднялся за 2 минуты. Смотрите: docker compose logs postgres"
  sleep 2
done

step "Ставлю зависимости и применяю миграции"
npm install --no-audit --no-fund
npm run db:generate
npm run db:migrate:deploy

pkill -f "turbo dev" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "nest start" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "dist/src/main" 2>/dev/null || true
sleep 2

if $PROD; then
  step "Собираю production-версию"
  # Относительный путь: Vite preview проксирует /api/v1 на API (см. apps/web/vite.config.ts).
  grep -qs '^VITE_API_URL=' apps/web/.env.local || echo 'VITE_API_URL=/api/v1' >> apps/web/.env.local
  # Сборка — пик по памяти: ограничиваем кучу и собираем по одному пакету за раз.
  NODE_OPTIONS="--max-old-space-size=1024" npx turbo build --concurrency=1

  step "Запускаю API и веб в production-режиме (лог: $LOG)"
  : >"$LOG"
  (cd apps/api && NODE_ENV=production nohup node --max-old-space-size=256 dist/src/main >>"$LOG" 2>&1 &)
  VITE_BIN=""
  for candidate in "$ROOT/apps/web/node_modules/.bin/vite" "$ROOT/node_modules/.bin/vite"; do
    if [ -e "$candidate" ]; then VITE_BIN="$(readlink -f "$candidate")"; break; fi
  done
  [ -n "$VITE_BIN" ] || fail "не найден vite в node_modules/.bin. Запустите npm install."
  (cd apps/web && nohup node --max-old-space-size=128 "$VITE_BIN" preview >>"$LOG" 2>&1 &)
  echo "Запущено."
else
  step "Перезапускаю приложение в dev-режиме (лог: $LOG)"
  nohup npm run dev:clean >"$LOG" 2>&1 &
  echo "Запущено, PID $!"
fi

step "Жду, пока API ответит"
for i in $(seq 1 60); do
  if curl -fsS "$API_READY_URL" 2>/dev/null | grep -q '"db":true'; then
    printf '\n\033[1;32mГотово.\033[0m API и база работают.\n'
    echo "Откройте порт 3000 через «Open ports» в Coder и перейдите на /roadmap."
    $PROD || echo "Первая загрузка страницы компилируется 20–30 секунд. Лог: tail -f $LOG"
    exit 0
  fi
  sleep 3
done
fail "API не ответил за 3 минуты. Смотрите лог: tail -n 100 $LOG"
