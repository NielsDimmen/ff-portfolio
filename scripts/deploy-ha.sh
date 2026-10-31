#!/usr/bin/env bash
# Zet een nieuwe app-bundle op Home Assistant. De foto's blijven staan.
#
#   ADMIN_TOKEN=... ./scripts/deploy-ha.sh
#   ./scripts/deploy-ha.sh --build
#   PORTFOLIO_URL=http://10.0.30.114:9199 ./scripts/deploy-ha.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STANDALONE="$ROOT/addons/ff_portfolio/.standalone"
BASE="${PORTFOLIO_URL:-http://10.0.30.114:8180}"
TOKEN="${ADMIN_TOKEN:-}"
DO_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    *)
      echo "Onbekend argument: $arg"
      exit 1
      ;;
  esac
done

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
  TOKEN="${ADMIN_TOKEN:-$TOKEN}"
  BASE="${PORTFOLIO_URL:-$BASE}"
fi

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: zet ADMIN_TOKEN, gelijk aan de add-on optie admin_token."
  exit 1
fi

if [[ "$DO_BUILD" == "1" || ! -f "$STANDALONE/app/server/index.ts" ]]; then
  "$ROOT/scripts/prepare-ha-addon.sh"
fi

if [[ ! -f "$STANDALONE/app/server/index.ts" ]]; then
  echo "ERROR: $STANDALONE/app/server/index.ts ontbreekt. Draai ./scripts/prepare-ha-addon.sh"
  exit 1
fi

BUNDLE="$(mktemp -t ff-portfolio-deploy.XXXXXX.tgz)"
cleanup() { rm -f "$BUNDLE"; }
trap cleanup EXIT

echo "== Portfolio-app → $BASE =="
tar -czf "$BUNDLE" -C "$STANDALONE" .
echo "  Bundel: $(du -h "$BUNDLE" | awk '{print $1}')"

verify_admin_token() {
  local code body
  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w "%{http_code}" \
    "$BASE/v1/admin/status" \
    -H "Authorization: Bearer $TOKEN" || true)"
  if [[ "$code" == "403" || "$code" == "400" ]]; then
    echo "ERROR: ADMIN_TOKEN geweigerd door $BASE (HTTP $code): $(cat "$body")"
    rm -f "$body"
    exit 1
  fi
  if [[ "$code" != "200" ]]; then
    echo "ERROR: admin-API niet bereikbaar (HTTP $code): $(cat "$body")"
    echo "  Draait de add-on? Probeer PORTFOLIO_URL=http://10.0.30.114:9199"
    rm -f "$body"
    exit 1
  fi
  rm -f "$body"
}

upload_bundle() {
  local resp http target
  target="$1"
  resp="$(mktemp)"
  http="$(curl -sS -o "$resp" -w "%{http_code}" \
    --http1.1 \
    --max-time 1800 \
    -X POST "$target/v1/admin/deploy" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/gzip" \
    --data-binary "@$BUNDLE" || true)"
  if [[ "$http" == "404" ]]; then
    echo "ERROR: /v1/admin/deploy bestaat nog niet."
    echo "  Kopieer de add-on naar /addons en bouw hem één keer."
    rm -f "$resp"
    exit 1
  fi
  if [[ "$http" == "413" ]]; then
    rm -f "$resp"
    return 2
  fi
  if [[ "$http" != "200" ]]; then
    echo "ERROR: upload mislukt (HTTP $http): $(cat "$resp")"
    rm -f "$resp"
    exit 1
  fi
  cat "$resp"
  echo
  rm -f "$resp"
}

wait_for_app() {
  local i code
  for i in $(seq 1 90); do
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/healthz" || true)"
    if [[ "$code" == "200" ]]; then
      echo "  Site antwoordt (na ${i}s)"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: de site kwam niet terug. De gateway zelf staat op /v1/health."
  exit 1
}

verify_admin_token
echo "Uploaden…"
if ! upload_bundle "$BASE"; then
  if [[ "$BASE" == *:9199 ]]; then
    echo "ERROR: upload te groot."
    exit 1
  fi
  LAN="${BASE%:*}:9199"
  echo "Cloudflare weigert het bestand. Opnieuw via $LAN"
  BASE="$LAN"
  verify_admin_token
  upload_bundle "$BASE" || {
    echo "ERROR: upload te groot."
    exit 1
  }
fi

echo "Wachten tot de site terug is…"
wait_for_app
echo
echo "App staat op $BASE. Foto's en database zijn niet aangeraakt."
echo "Inhoud meesturen: ./scripts/deploy-content.sh"
