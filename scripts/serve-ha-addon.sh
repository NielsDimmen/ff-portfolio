#!/usr/bin/env bash
# Pak de add-on en zet hem op HTTP, zodat de HA-CLI hem kan ophalen.
# scp naar de SSH-add-on werkt vanaf macOS niet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${HA_SERVE_PORT:-8765}"

"$ROOT/scripts/pack-ha-addon.sh"

echo
echo "Laat dit venster open. Op de Home Assistant CLI:"
echo
ips="$(ipconfig getifaddr en0 2>/dev/null || true)"
ips="${ips}"$'\n'"$(ipconfig getifaddr en1 2>/dev/null || true)"
while IFS= read -r dev; do
  addr="$(ipconfig getifaddr "$dev" 2>/dev/null || true)"
  [[ -n "$addr" ]] && ips="${ips}"$'\n'"$addr"
done < <(networksetup -listallhardwareports 2>/dev/null | awk '/Device:/ {print $2}' || true)

printed=
while IFS= read -r ip; do
  [[ -z "$ip" ]] && continue
  echo "  mkdir -p /addons"
  echo "  curl -L -o /tmp/ff_portfolio-ha.zip http://${ip}:${PORT}/ff_portfolio-ha.zip"
  echo "  unzip -o /tmp/ff_portfolio-ha.zip -d /addons"
  echo "  ls /addons/ff_portfolio/config.yaml"
  echo
  printed=1
done < <(printf '%s\n' "$ips" | awk 'NF && !seen[$0]++')

if [[ -z "$printed" ]]; then
  echo "  curl -L -o /tmp/ff_portfolio-ha.zip http://<JOUW-MAC-IP>:${PORT}/ff_portfolio-ha.zip"
  echo "  unzip -o /tmp/ff_portfolio-ha.zip -d /addons"
  echo
fi

echo "Daarna in HA: Instellingen → Add-ons → Add-onwinkel → Zoeken naar updates."
echo "Lokaal: FF Dimmen. Zet een admin_token, start de add-on, en draai daarna deploy-ha.sh."
echo "Stoppen: Ctrl+C"
echo
cd "$ROOT/addons"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
