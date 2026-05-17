#!/usr/bin/env bash
# Build a standalone WeChat Explorer.app for macOS.
#
#   ./scripts/build-app.sh           # → release/mac{-arm64,-x64}/WeChat Explorer.app
#   ./scripts/build-app.sh --dmg     # … also build a distributable .dmg
#
# Run from the repo root. Re-runs are idempotent (rebuilds the standalone +
# refreshes the native binding + repacks).
set -euo pipefail

BUILD_DMG=0
for arg in "$@"; do
  case "$arg" in
    --dmg) BUILD_DMG=1 ;;
    -h|--help)
      sed -n '2,8p' "$0" | sed 's/^# //; s/^#//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -t 1 ]]; then
  B="\033[1m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; N="\033[0m"
else
  B=""; G=""; Y=""; R=""; N=""
fi
step() { printf "${B}==>${N} %s\n" "$1"; }
ok()   { printf "${G}  ✓${N} %s\n" "$1"; }
warn() { printf "${Y}  !${N} %s\n" "$1"; }
err()  { printf "${R}  ✗${N} %s\n" "$1" >&2; }

cd "$(dirname "$0")/.."   # repo root

# ── 0. icon (regenerate if SVG is newer than the .icns) ────────────────
if [[ -f build/icon.svg && ( ! -f build/icon.icns || build/icon.svg -nt build/icon.icns ) ]]; then
  step "Rebuilding icon (build/icon.svg → build/icon.icns)"
  bash scripts/build-icon.sh
fi

# ── 1. compile electron/main.ts → electron/dist/main.js ────────────────
step "Compiling Electron main"
npx tsc -p electron
ok "electron/dist/main.js"

# ── 2. build Next.js in standalone mode ────────────────────────────────
step "Building Next.js (next build --output=standalone)"
# `next.config.ts` already sets `output: 'standalone'` so a regular build
# produces .next/standalone/{server.js,node_modules}.
npx next build
ok ".next/standalone built"

# ── 3. rebuild better-sqlite3 against Electron's Node ABI (universal) ─
# Standalone strips binding.gyp + src/ from the shipped node_modules, so
# we rebuild against the project's full tree and copy the result into the
# standalone bundle. We do this twice — once per arch — and `lipo` the two
# .node binaries together into a fat universal slice. Finally restore the
# system-Node binding so dev / test workflows keep working untouched.
step "Rebuilding better-sqlite3 against Electron Node ABI (arm64 + x64)"
ELECTRON_VERSION=$(node -p "require('electron/package.json').version")
NODE_BACKUP=$(mktemp -t better_sqlite3_node_backup.XXXXXX.node)
cp node_modules/better-sqlite3/build/Release/better_sqlite3.node "$NODE_BACKUP"
# Cleanup AND restore the system-Node binding on exit. electron-builder's own
# pack step also runs @electron/rebuild for each arch and leaves the binding
# in the wrong ABI for `npm test` / `npm run dev`, so the restore has to
# happen *after* everything else has finished.
restore_node_binding() {
  if [[ -f "$NODE_BACKUP" ]]; then
    cp "$NODE_BACKUP" node_modules/better-sqlite3/build/Release/better_sqlite3.node 2>/dev/null || true
  fi
  rm -f "$NODE_BACKUP" "$BSQL_ARM64" "$BSQL_X64" "$BSQL_UNIVERSAL"
}
trap restore_node_binding EXIT

BSQL_ARM64=$(mktemp -t bsql-arm64.XXXXXX.node)
BSQL_X64=$(mktemp -t bsql-x64.XXXXXX.node)
BSQL_UNIVERSAL=$(mktemp -t bsql-universal.XXXXXX.node)

# arm64 slice
npx @electron/rebuild \
  --version "$ELECTRON_VERSION" \
  --only better-sqlite3 \
  --arch arm64 \
  --force
cp node_modules/better-sqlite3/build/Release/better_sqlite3.node "$BSQL_ARM64"
ok "  → arm64 slice"

# x64 slice
npx @electron/rebuild \
  --version "$ELECTRON_VERSION" \
  --only better-sqlite3 \
  --arch x64 \
  --force
cp node_modules/better-sqlite3/build/Release/better_sqlite3.node "$BSQL_X64"
ok "  → x64 slice"

# Fat universal binary
lipo -create "$BSQL_ARM64" "$BSQL_X64" -output "$BSQL_UNIVERSAL"
ok "  → universal .node ($(file "$BSQL_UNIVERSAL" | sed 's/.*: //'))"

# Next.js's standalone tracer leaves out `build/Release/` for native
# modules — the .node file isn't statically imported so the tracer
# doesn't see it. Create the directory and drop our universal binding
# in. It'll be found at runtime via the bindings shim that better-
# sqlite3 ships in lib/database.js.
mkdir -p .next/standalone/node_modules/better-sqlite3/build/Release
cp "$BSQL_UNIVERSAL" .next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node
ok "  → copied universal binding into standalone"

# ── 4. pack with electron-builder ──────────────────────────────────────
step "Packaging .app with electron-builder"
# `--mac` alone uses the YAML's target list, which now includes both
# `dir` (the raw .app) and `dmg`. Building both takes only ~30 s extra
# over dir-only, and dmg is what most users actually click. The legacy
# --dmg flag on this script is kept as a no-op so older invocations
# don't break (it's now the default behaviour either way).
npx electron-builder --config electron-builder.yml --mac

# Standalone copy + xattr cleanup happen inside scripts/after-pack.js, which
# electron-builder invokes as its `afterPack` hook — early enough that the
# inserted files survive the universal merge.

# Restore the system-Node binding so the next `npm test` / `npm run dev`
# doesn't fail with NODE_MODULE_VERSION mismatch.
restore_node_binding
ok "Restored system Node binding in node_modules"

# ── 6. ad-hoc sign the universal .app ──────────────────────────────────
# Two macOS Sequoia gotchas that broke us repeatedly here:
#
#   1. The universal-merged .app inherits `com.apple.provenance` and
#      `com.apple.FinderInfo` xattrs that codesign refuses to overwrite
#      ("resource fork, Finder information, or similar detritus not
#      allowed"). And `xattr -cr` can't strip them — they're kernel-set
#      on macOS 15+. The reliable workaround is a `tar --no-mac-metadata`
#      roundtrip: tar archives without xattrs, extract recreates the
#      bundle as a fresh tree without any provenance baggage.
#
#   2. @electron/osx-sign defaults pass `--options runtime` to codesign,
#      which enables Sequoia's strict team-ID consistency check. Even
#      with everything ad-hoc-signed (no team), the runtime flag makes
#      Sequoia refuse to map the framework into the ad-hoc main binary
#      ("non-platform mapped file have different Team IDs"). The fix
#      is `optionsForFile: () => ({ signatureFlags: [] })` in
#      scripts/sign-app.js — pure ad-hoc with no runtime hardening.
step "Ad-hoc signing the universal .app"
APP="release/mac-universal/WeChat Explorer.app"
APP_PARENT=$(dirname "$APP")
APP_NAME=$(basename "$APP")

# tar-roundtrip via /tmp to strip kernel-set xattrs. Critical detail:
# we extract into /tmp (not back into release/), because Sequoia auto-
# re-applies com.apple.provenance to executables landed in user paths.
# Signing happens in /tmp where xattrs stay clean, then we move the
# signed .app back to release/ in one shot (a move within the same
# filesystem doesn't re-trigger the provenance hook).
TAR_TMP=$(mktemp -t wechat-explorer-app.XXXXXX.tar)
SIGN_TMP=$(mktemp -d -t wechat-explorer-sign.XXXXXX)
trap 'rm -f "$TAR_TMP"; rm -rf "$SIGN_TMP"; restore_node_binding; rm -f "$NODE_BACKUP" "$BSQL_ARM64" "$BSQL_X64" "$BSQL_UNIVERSAL"' EXIT
tar --no-mac-metadata -cf "$TAR_TMP" -C "$APP_PARENT" "$APP_NAME"
rm -rf "$APP"
tar -xf "$TAR_TMP" -C "$SIGN_TMP"
ok "  → tar-roundtripped to $SIGN_TMP"

# Sign in /tmp where xattrs stay clean.
APP_TMP="$SIGN_TMP/$APP_NAME" APP="$APP_TMP" node scripts/sign-app.js

# Move signed .app back. `mv` within the same filesystem (both /tmp and
# release/ are on the same APFS volume) is metadata-only and doesn't
# re-trigger provenance; if it ever did, the signature is already
# embedded and won't break.
mv "$SIGN_TMP/$APP_NAME" "$APP"
ok "  → moved signed .app back to release/mac-universal/"

codesign -dv "$APP" 2>&1 | head -2 || true
ok "  → ad-hoc signed (no hardened runtime → loads on Sequoia)"

# ── 7. assemble the .dmg from the signed .app ──────────────────────────
step "Creating .dmg"
VERSION=$(node -p "require('./package.json').version")
DMG_PATH="release/WeChat Explorer-${VERSION}-universal.dmg"
rm -f "$DMG_PATH"
hdiutil create \
  -volname "WeChat Explorer" \
  -srcfolder "$APP" \
  -ov \
  -format UDZO \
  -fs HFS+ \
  "$DMG_PATH" >/dev/null
ok "  → $DMG_PATH ($(du -h "$DMG_PATH" | awk '{print $1}'))"

# ── 5. summary ─────────────────────────────────────────────────────────
echo
ok "Build complete."
echo
APP_PATHS=$(ls -d release/mac*/'WeChat Explorer.app' 2>/dev/null || true)
if [[ -n "$APP_PATHS" ]]; then
  while IFS= read -r p; do
    size=$(du -sh "$p" | awk '{print $1}')
    printf "  %s  ${B}(%s)${N}\n" "$p" "$size"
  done <<< "$APP_PATHS"
fi
if (( BUILD_DMG )); then
  DMG_PATHS=$(ls release/*.dmg 2>/dev/null || true)
  if [[ -n "$DMG_PATHS" ]]; then
    echo
    printf "  ${B}DMG:${N}\n"
    while IFS= read -r p; do
      size=$(du -sh "$p" | awk '{print $1}')
      printf "    %s  (%s)\n" "$p" "$size"
    done <<< "$DMG_PATHS"
  fi
fi
echo
echo "Launch:  open \"release/mac-arm64/WeChat Explorer.app\""
echo "Install: drag the .app into /Applications, then double-click."
