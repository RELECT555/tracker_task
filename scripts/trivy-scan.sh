#!/usr/bin/env bash
# Прогоняет Trivy так же, как это делает проверка в CI.
#
#   bash scripts/trivy-scan.sh              # репозиторий: зависимости, секреты, Dockerfile и k8s-манифесты
#   bash scripts/trivy-scan.sh --images     # то же + сборка и скан образов api, api-migrate, web
#
# Нужны: trivy (https://trivy.dev), для --images ещё docker и ~/.npmrc с токеном Azure Artifacts.
# Настройки (severity, ignore-unfixed, скан-пути) — в trivy.yaml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v trivy >/dev/null || { echo "trivy не найден: https://trivy.dev/latest/getting-started/installation/" >&2; exit 1; }

IMAGES=false
[ "${1:-}" = "--images" ] && IMAGES=true

status=0
run() { echo; echo "==> $*"; "$@" || status=1; }

# Зависимости (package-lock.json), секреты в коде, ошибки конфигурации Dockerfile/k8s.
run trivy fs --config trivy.yaml .

# Манифесты Kubernetes в том виде, в котором они уйдут в кластер.
run trivy config --config trivy.yaml deploy/k8s

if $IMAGES; then
  command -v docker >/dev/null || { echo "для --images нужен docker" >&2; exit 1; }
  NPMRC="${NPMRC:-$HOME/.npmrc}"
  [ -f "$NPMRC" ] || { echo "нет $NPMRC: нужен токен приватного реестра @mtkit" >&2; exit 1; }

  echo; echo "==> Собираю образы"
  docker build -f deploy/docker/api.Dockerfile --target api --secret id=npmrc,src="$NPMRC" -t tracker-api:scan .
  docker build -f deploy/docker/api.Dockerfile --target migrate --secret id=npmrc,src="$NPMRC" -t tracker-api-migrate:scan .
  docker build -f deploy/docker/web.Dockerfile -t tracker-web:scan .

  for image in tracker-api:scan tracker-api-migrate:scan tracker-web:scan; do
    run trivy image --config trivy.yaml "$image"
  done
fi

if [ "$status" -eq 0 ]; then
  echo; echo "Trivy: замечаний нет."
else
  echo; echo "Trivy: есть замечания (см. выше)." >&2
fi
exit "$status"
