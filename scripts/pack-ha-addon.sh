#!/usr/bin/env bash
# Zip de add-on, zonder de Linux-bundle. De app gaat later via deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/addons/ff_portfolio-ha.zip}"

rm -f "$OUT"
(
  cd "$ROOT/addons"
  zip -r "$OUT" ff_portfolio \
    -x 'ff_portfolio/.standalone/*' \
    -x 'ff_portfolio/.standalone/**' \
    -x 'ff_portfolio/.DS_Store' \
    -x 'ff_portfolio/build.Dockerfile'
)
echo "Ingepakt: $OUT"
echo "Op HA uitpakken naar /addons, zodat /addons/ff_portfolio/config.yaml er staat."
