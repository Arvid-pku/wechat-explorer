#!/usr/bin/env bash
# Render build/icon.svg into a macOS .icns icon set.
#
# Output: build/icon.icns (electron-builder picks it up automatically).
# Intermediate: build/icon.iconset/ (deleted after the build).
#
# Requires macOS' built-in `sips` + `iconutil`, both ship with the OS. No
# Homebrew package needed.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

SRC="build/icon.svg"
OUT_ICONSET="build/icon.iconset"
OUT_ICNS="build/icon.icns"

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC" >&2
  exit 1
fi

# `sips` won't read SVG directly — we render to a high-resolution PNG first.
# Easiest portable path: use `rsvg-convert` if available, else fall back to
# Chromium / WebKit via `qlmanage` (always present on macOS).
PNG_MASTER=$(mktemp -t icon-master.XXXXXX.png)
trap 'rm -f "$PNG_MASTER"; rm -rf "$OUT_ICONSET"' EXIT

if command -v rsvg-convert >/dev/null; then
  rsvg-convert -w 1024 -h 1024 "$SRC" -o "$PNG_MASTER"
elif command -v magick >/dev/null; then
  magick -background none -density 384 "$SRC" -resize 1024x1024 "$PNG_MASTER"
else
  # WebKit fallback via qlmanage (always available on macOS).
  # qlmanage renders an SVG thumbnail at a target size; capture the largest.
  TMP_DIR=$(mktemp -d -t icon-qlmanage.XXXXXX)
  qlmanage -t -s 1024 -o "$TMP_DIR" "$SRC" >/dev/null 2>&1
  mv "$TMP_DIR"/*.png "$PNG_MASTER"
  rm -rf "$TMP_DIR"
fi

mkdir -p "$OUT_ICONSET"

# Apple's .iconset spec: each size as both @1x and @2x, named precisely.
declare -a SIZES=(16 32 64 128 256 512 1024)
for SIZE in "${SIZES[@]}"; do
  case "$SIZE" in
    16)   NAMES=("icon_16x16.png") ;;
    32)   NAMES=("icon_16x16@2x.png" "icon_32x32.png") ;;
    64)   NAMES=("icon_32x32@2x.png") ;;
    128)  NAMES=("icon_128x128.png") ;;
    256)  NAMES=("icon_128x128@2x.png" "icon_256x256.png") ;;
    512)  NAMES=("icon_256x256@2x.png" "icon_512x512.png") ;;
    1024) NAMES=("icon_512x512@2x.png") ;;
  esac
  TMP=$(mktemp -t icon-$SIZE.XXXXXX.png)
  sips -z "$SIZE" "$SIZE" "$PNG_MASTER" --out "$TMP" >/dev/null
  for NAME in "${NAMES[@]}"; do
    cp "$TMP" "$OUT_ICONSET/$NAME"
  done
  rm -f "$TMP"
done

iconutil -c icns "$OUT_ICONSET" -o "$OUT_ICNS"
echo "✓ wrote $OUT_ICNS ($(du -h "$OUT_ICNS" | awk '{print $1}'))"
