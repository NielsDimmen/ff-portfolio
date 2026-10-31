#!/usr/bin/env bash
# Zet de database en de foto's op Home Assistant.
# Modellen gaan niet mee; die haalt de add-on zelf op in /data/models.
#
#   ADMIN_TOKEN=... ./scripts/deploy-content.sh
#   PORTFOLIO_URL=http://10.0.30.114:9099 ./scripts/deploy-content.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.data"
BASE="${PORTFOLIO_URL:-http://10.0.30.114:8080}"
TOKEN="${ADMIN_TOKEN:-}"

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

if [[ ! -f "$DATA/db.sqlite" ]]; then
  echo "ERROR: $DATA/db.sqlite ontbreekt"
  exit 1
fi

echo "Database afsluiten naar één bestand…"
node --input-type=module -e "
import Database from 'better-sqlite3';
const db = new Database(process.argv[1]);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
" "$DATA/db.sqlite"

BUNDLE="$(mktemp -t ff-portfolio-content.XXXXXX.tgz)"
cleanup() { rm -f "$BUNDLE"; }
trap cleanup EXIT

echo "== Inhoud → $BASE =="
tar -czf "$BUNDLE" -C "$DATA" db.sqlite media
echo "  Bundel: $(du -h "$BUNDLE" | awk '{print $1}')"

upload() {
  local resp http target
  target="$1"
  resp="$(mktemp)"
  http="$(curl -sS -o "$resp" -w "%{http_code}" \
    --http1.1 \
    --max-time 1800 \
    -X POST "$target/v1/admin/content" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/gzip" \
    --data-binary "@$BUNDLE" || true)"
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

if ! upload "$BASE"; then
  if [[ "$BASE" == *:9099 ]]; then
    echo "ERROR: upload te groot."
    exit 1
  fi
  LAN="${BASE%:*}:9099"
  echo "Cloudflare weigert het bestand. Opnieuw via $LAN"
  BASE="$LAN"
  upload "$BASE" || {
    echo "ERROR: upload te groot."
    exit 1
  }
fi

echo
echo "Database en foto's staan in /data. De code is niet aangeraakt."
