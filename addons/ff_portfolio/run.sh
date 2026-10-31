#!/bin/sh
set -eu

DATA="${HA_DATA:-/data}"
PID_FILE=/tmp/ff-portfolio.pid
APP_PORT=8081

export HA_DATA="$DATA"
export APP_PORT
export APP_PID_FILE="$PID_FILE"
export PUBLIC_PORT=8080
export CONTROL_PORT=9099
export NODE_ENV=production
export TZ=Europe/Amsterdam

mkdir -p "$DATA/media" "$DATA/app" "$DATA/models"

eval "$(node /opt/ha/read-options.mjs)"
export ADMIN_TOKEN PUBLIC_BASE SITE_URL

node /opt/ha/ha-gateway.mjs &

app_root() {
  if [ -f "$DATA/app/app/server/index.ts" ]; then
    echo "$DATA/app"
  else
    echo ""
  fi
}

echo "Waiting for an app bundle in $DATA/app"
while true; do
  ROOT="$(app_root)"
  if [ -n "$ROOT" ]; then
    echo "Starting portfolio from $ROOT"
    cd "$ROOT"
    DATA_DIR="$DATA" \
      PUBLIC_PORT="$APP_PORT" \
      ADMIN_PORT=8099 \
      SITE_SCOPE=landing \
      SITE_URL="${SITE_URL:-}" \
      NODE_ENV=production \
      node --import tsx app/server/index.ts &
    echo $! > "$PID_FILE"
    wait $! || true
    echo "Portfolio stopped, restarting in 2s"
  fi
  sleep 2
done
