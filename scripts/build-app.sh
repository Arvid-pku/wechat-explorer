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
  B="\033[1m"; G="\033[32m"; N="\033[0m"
else
  B=""; G=""; N=""
fi
step() { printf "${B}==>${N} %s\n" "$1"; }
ok()   { printf "${G}  ✓${N} %s\n" "$1"; }

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

# ── 5. inject the Next.js standalone bundle into the .app ──────────────
# electron-builder's extraResources copy strips `node_modules/` no matter
# what filter we use, so we ship it ourselves after the pack. The runtime
# (electron/main.ts) reads from `<resourcesPath>/app/.next/standalone/`.
# Universal builds land at release/mac-universal/.
step "Copying Next.js standalone bundle into the .app"
for app_dir in release/mac*/'WeChat Explorer.app'; do
  [[ -d "$app_dir" ]] || continue
  target="$app_dir/Contents/Resources/app"
  mkdir -p "$target/.next/standalone"
  # Use rsync so re-runs are idempotent and dotfiles are preserved.
  rsync -a --delete .next/standalone/ "$target/.next/standalone/"
  rsync -a --delete .next/static/ "$target/.next/standalone/.next/static/"
  rsync -a --delete public/ "$target/.next/standalone/public/"
  ok "  → $app_dir"
done

# Finally, restore the system-Node binding so the next `npm test` / `npm
# run dev` doesn't fail with NODE_MODULE_VERSION mismatch. (The trap also
# does this on early exit; this call is the happy-path version.)
restore_node_binding
ok "Restored system Node binding in node_modules"

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
