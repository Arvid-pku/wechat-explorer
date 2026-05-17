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

# ── 3. rebuild better-sqlite3 against Electron's Node ABI ──────────────
# Tricky bit: the standalone copy at .next/standalone/node_modules ships
# inside the .app, but Next.js strips binding.gyp + src/ from it, so
# @electron/rebuild can't compile against the standalone copy directly.
# Workaround: rebuild in-place against the project's full node_modules,
# copy the resulting .node binary into the standalone tree, then restore
# the system-Node binding so `npm test` / `npm run dev` continue to work.
step "Rebuilding better-sqlite3 against Electron Node ABI"
ELECTRON_VERSION=$(node -p "require('electron/package.json').version")
NODE_BACKUP=$(mktemp -t better_sqlite3_node_backup.XXXXXX.node)
cp node_modules/better-sqlite3/build/Release/better_sqlite3.node "$NODE_BACKUP"
trap 'rm -f "$NODE_BACKUP"' EXIT

npx @electron/rebuild \
  --version "$ELECTRON_VERSION" \
  --only better-sqlite3 \
  --force

cp node_modules/better-sqlite3/build/Release/better_sqlite3.node \
   .next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node
ok "  → copied Electron $ELECTRON_VERSION binding into standalone"

# Restore the system-Node binding so dev / test workflows keep working
# without a separate `npm rebuild better-sqlite3` step.
cp "$NODE_BACKUP" node_modules/better-sqlite3/build/Release/better_sqlite3.node
ok "  → restored system Node binding in node_modules"

# ── 4. pack with electron-builder ──────────────────────────────────────
step "Packaging .app with electron-builder"
TARGETS=("--mac" "dir")
if (( BUILD_DMG )); then
  TARGETS=("--mac" "dir" "dmg")
fi
npx electron-builder --config electron-builder.yml "${TARGETS[@]}"

# ── 5. inject the Next.js standalone bundle into the .app ──────────────
# electron-builder's extraResources copy strips `node_modules/` no matter
# what filter we use, so we ship it ourselves after the pack. The runtime
# (electron/main.ts) reads from `<resourcesPath>/app/.next/standalone/`.
step "Copying Next.js standalone bundle into the .app"
for app_dir in release/mac-*/'WeChat Explorer.app'; do
  [[ -d "$app_dir" ]] || continue
  target="$app_dir/Contents/Resources/app"
  mkdir -p "$target/.next/standalone"
  # Use rsync so re-runs are idempotent and dotfiles are preserved.
  rsync -a --delete .next/standalone/ "$target/.next/standalone/"
  rsync -a --delete .next/static/ "$target/.next/standalone/.next/static/"
  rsync -a --delete public/ "$target/.next/standalone/public/"
  ok "  → $app_dir"
done

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
