#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
BUILD="$PWD/build"
SDK="$(xcrun --show-sdk-path)"
TARGET="arm64-apple-macosx14.0"
BUNDLE="$BUILD/FF Dimmen.saver"
RES="$BUNDLE/Contents/Resources"
BIN="$BUNDLE/Contents/MacOS/FF Dimmen"

rm -rf "$BUNDLE"
mkdir -p "$RES" "$BUNDLE/Contents/MacOS"
cp Info.plist "$BUNDLE/Contents/Info.plist"
cp "$ROOT/brand/logo/ff-dimmen-woordmerk.svg" "$RES/ff-dimmen-woordmerk.svg"
cp "$ROOT/brand/fonts/montserrat-latin-300.woff2" "$RES/montserrat-latin-300.woff2"
cp "$ROOT/brand/fonts/montserrat-latin-800.woff2" "$RES/montserrat-latin-800.woff2"
cp "$ROOT/brand/fonts/OFL.txt" "$RES/OFL.txt"

python3 - "$ROOT" "$RES" <<'PY'
import sys
from pathlib import Path
from fontTools.ttLib import TTFont

root, res = Path(sys.argv[1]), Path(sys.argv[2])
pairs = {
    "montserrat-latin-300.woff2": "Montserrat-Light.ttf",
    "montserrat-latin-800.woff2": "Montserrat-ExtraBold.ttf",
}
for source, dest in pairs.items():
    font = TTFont(root / "brand" / "fonts" / source)
    font.flavor = None
    font.save(res / dest)
PY

swiftc \
  -target "$TARGET" \
  -sdk "$SDK" \
  -swift-version 5 \
  -O \
  -whole-module-optimization \
  -emit-library \
  -module-name FFDimmenScreensaver \
  -framework ScreenSaver \
  -framework AppKit \
  -framework QuartzCore \
  -framework CoreText \
  -framework ImageIO \
  -framework CoreGraphics \
  -lsqlite3 \
  -Xlinker -bundle \
  -o "$BIN" \
  Sources/Dim.swift \
  Sources/Shuffle.swift \
  Sources/Catalog.swift \
  Sources/Wordmark.swift \
  Sources/FFDimmenView.swift

swiftc \
  -target "$TARGET" \
  -sdk "$SDK" \
  -swift-version 5 \
  -O \
  -framework Foundation \
  -lsqlite3 \
  -o "$BUILD/shuffle-check" \
  Sources/Dim.swift \
  Sources/Shuffle.swift \
  Sources/Catalog.swift \
  ShuffleCheck/main.swift

swiftc \
  -target "$TARGET" \
  -sdk "$SDK" \
  -swift-version 5 \
  -framework AppKit \
  -framework ScreenSaver \
  -o "$BUILD/preview" \
  Preview/main.swift

file "$BIN" | grep -q "bundle"
plutil -extract NSPrincipalClass raw -o - "$BUNDLE/Contents/Info.plist" | grep -qx "FFDimmenView"
plutil -extract CFBundleIdentifier raw -o - "$BUNDLE/Contents/Info.plist" | grep -qx "nl.ffdimmen.screensaver"
otool -ov "$BIN" > "$BUILD/otool.txt"
grep -q "FFDimmenView" "$BUILD/otool.txt"

"$BUILD/shuffle-check"
"$BUILD/shuffle-check" --dump-pool > "$BUILD/pool.json"
for seed in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  node tools/mix-slides.mjs "$seed" "$BUILD/pool.json" > "$BUILD/node.txt"
  "$BUILD/shuffle-check" --seed "$seed" > "$BUILD/swift.txt"
  diff -q "$BUILD/node.txt" "$BUILD/swift.txt"
done

codesign --force --sign - --identifier nl.ffdimmen.screensaver "$BUNDLE"
codesign --verify --strict "$BUNDLE"

"$BUILD/preview" "$BUNDLE" "$BUILD/preview.png"

DEST="$HOME/Library/Screen Savers/FF Dimmen.saver"
mkdir -p "$HOME/Library/Screen Savers"
rm -rf "$DEST"
ditto "$BUNDLE" "$DEST"
codesign --verify --strict "$DEST"

# macOS 14+ starts the idle saver from the wallpaper store. The legacy
# moduleDict is what ScreenSaverEngine still reads, and it was stuck on Shell.
defaults -currentHost write com.apple.screensaver moduleDict -dict \
  moduleName "FF Dimmen" \
  path "$DEST" \
  type -int 0

# legacyScreenSaver keeps the previous binary mapped until it is quit.
# Replacing the bundle on disk does not update a host that is already running.
killall legacyScreenSaver 2>/dev/null || true

echo "Geïnstalleerd: $DEST"
