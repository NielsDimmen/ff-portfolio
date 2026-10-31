#!/usr/bin/env bash
# Linux-bundle voor de Home Assistant-add-on. Draait npm ci in Docker,
# zodat better-sqlite3 en sharp voor Linux gebouwd worden.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="${HA_ARCH:-amd64}"
case "$ARCH" in
  amd64|x64|x86_64) PLATFORM="linux/amd64" ;;
  arm64|aarch64) PLATFORM="linux/arm64" ;;
  *)
    echo "ERROR: onbekende HA_ARCH=$ARCH (gebruik amd64 of arm64)"
    exit 1
    ;;
esac
OUT="$ROOT/addons/ff_portfolio/.standalone"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is nodig. De Mac-modules werken niet op Home Assistant."
  exit 1
fi

echo "== Portfolio-bundle voor $PLATFORM =="
rm -rf "$OUT"
mkdir -p "$OUT"
export DOCKER_BUILDKIT=1
docker build \
  --platform "$PLATFORM" \
  -f "$ROOT/addons/ff_portfolio/build.Dockerfile" \
  --output "type=local,dest=$OUT" \
  "$ROOT"

if [[ ! -f "$OUT/app/server/index.ts" ]]; then
  echo "ERROR: $OUT/app/server/index.ts ontbreekt"
  exit 1
fi
echo "Klaar: $OUT"
echo "Daarna: ./scripts/deploy-ha.sh"
