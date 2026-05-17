#!/usr/bin/env bash
# WeChat Explorer one-shot setup.
#
# Run from a fresh clone:
#     ./scripts/setup.sh             # install + native compile + first index
#     ./scripts/setup.sh --dev       # ... then start the dev server too
#     ./scripts/setup.sh --no-index  # skip the initial quick index
#     ./scripts/setup.sh --skip-wx   # ignore missing wx-cli (set up the web tier only)
#
# Idempotent — safe to re-run.
set -euo pipefail

# ── flags ──────────────────────────────────────────────────────────────
DO_DEV=0
DO_INDEX=1
REQUIRE_WX=1
for arg in "$@"; do
  case "$arg" in
    --dev) DO_DEV=1 ;;
    --no-index) DO_INDEX=0 ;;
    --skip-wx) REQUIRE_WX=0 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# //; s/^#//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

# ── pretty output ──────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B="\033[1m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; D="\033[2m"; N="\033[0m"
else
  B=""; G=""; Y=""; R=""; D=""; N=""
fi
step() { printf "${B}==>${N} %s\n" "$1"; }
ok()   { printf "${G}  ✓${N} %s\n" "$1"; }
warn() { printf "${Y}  !${N} %s\n" "$1"; }
err()  { printf "${R}  ✗${N} %s\n" "$1" >&2; }
hint() { printf "${D}    %s${N}\n" "$1"; }

cd "$(dirname "$0")/.."   # repo root

# ── 1. platform ────────────────────────────────────────────────────────
step "Checking platform"
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "wx-cli is macOS-only — this app needs macOS."
  err "You're on $(uname -s). Stopping."
  exit 1
fi
ok "macOS $(sw_vers -productVersion 2>/dev/null || echo)"

# ── 2. node ────────────────────────────────────────────────────────────
step "Checking Node.js (>= 21)"
if ! command -v node >/dev/null; then
  err "Node.js not found."
  hint "Install with:  brew install node    (or fnm / n / nodenv)"
  exit 1
fi
node_major=$(node -v | sed 's/^v//' | cut -d. -f1)
if (( node_major < 21 )); then
  err "Node $(node -v) is too old — need v21 or newer."
  hint "Try:  brew upgrade node    # or 'fnm install 21 && fnm use 21'"
  exit 1
fi
ok "Node $(node -v)"

# ── 3. wx-cli ──────────────────────────────────────────────────────────
step "Checking wx-cli"
WX_OK=0
WX_INITIALIZED=0
if command -v wx >/dev/null; then
  ok "wx-cli at $(command -v wx)"
  WX_OK=1
  # initialized = ~/.wx-cli/all_keys.json or any *.key exists
  if [[ -f "$HOME/.wx-cli/all_keys.json" ]] || ls "$HOME/.wx-cli"/*.key >/dev/null 2>&1; then
    WX_INITIALIZED=1
    ok "wx-cli is initialized (keys cached in ~/.wx-cli/)"
  else
    warn "wx-cli is installed but not initialized."
    hint "Run, after ad-hoc-resigning WeChat.app:  sudo wx init"
    hint "See INSTALL.md → '1. Install wx-cli' for the resign steps."
  fi
else
  warn "wx-cli not found."
  hint "Install with:  brew install jackwener/tap/wx-cli"
  hint "After install, ad-hoc-resign WeChat.app and run:  sudo wx init"
  hint "Walkthrough:  INSTALL.md → '1. Install wx-cli'"
  if (( REQUIRE_WX )); then
    echo
    read -r -p "$(printf '%bContinue without wx-cli%b? Indexing will fail until it is installed. [y/N] ' "$B" "$N")" ans
    if [[ ! "$ans" =~ ^[Yy]$ ]]; then
      err "Stopping. Re-run after installing wx-cli, or use --skip-wx."
      exit 1
    fi
  fi
fi

# ── 4. install deps + native rebuild ───────────────────────────────────
step "Installing dependencies"
if command -v bun >/dev/null && [[ -f bun.lock ]]; then
  bun install
  # `bun pm trust` prints an error to stderr when the package is already
  # trusted (or has nothing to run) — that's a no-op for us, swallow it.
  bun pm trust better-sqlite3 >/dev/null 2>&1 || true
  ok "deps installed via bun + better-sqlite3 trusted"
elif [[ -f package-lock.json ]]; then
  npm install
  # The native addon may have been skipped by ignoreScripts; rebuild to be safe.
  npm rebuild better-sqlite3 || {
    err "npm rebuild better-sqlite3 failed."
    hint "Most often the fix is:  xcode-select --install"
    hint "Then re-run this script."
    exit 1
  }
  ok "deps installed via npm + better-sqlite3 compiled"
else
  # No lock file (fresh-cloned, neither tool ran yet) — prefer bun if present.
  if command -v bun >/dev/null; then
    bun install
    bun pm trust better-sqlite3 || true
    ok "deps installed via bun (no lockfile yet)"
  else
    npm install
    npm rebuild better-sqlite3
    ok "deps installed via npm (no lockfile yet)"
  fi
fi

# ── 5. quick smoke (require the native addon to load) ──────────────────
step "Verifying better-sqlite3 native binding"
if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  err "better-sqlite3 native binding failed to load."
  hint "Try:  npm rebuild better-sqlite3"
  hint "If that errors:  xcode-select --install ; then retry."
  exit 1
fi
ok "binding loads"

# ── 6. first index (if wx-cli is set up) ───────────────────────────────
if (( DO_INDEX )) && (( WX_OK )) && (( WX_INITIALIZED )); then
  step "Building first index (quick mode, ~20s)"
  if npm run --silent index:quick; then
    ok "quick index complete"
  else
    err "Quick index failed. See output above."
    hint "Common cause: wx-cli keys aren't valid for the running WeChat process."
    hint "Re-run:  sudo wx init    then ./scripts/setup.sh --no-index"
    exit 1
  fi
elif (( DO_INDEX )); then
  warn "Skipping initial index — wx-cli not ready."
  hint "When ready, run:  npm run index:quick"
fi

# ── 7. done / dev server ───────────────────────────────────────────────
echo
ok "Setup complete."
echo
if (( DO_DEV )); then
  step "Starting dev server"
  echo
  hint "Open  ${B}http://localhost:3719${N}"
  echo
  exec npm run dev
else
  printf "Next:\n"
  printf "  Start the app:   ${B}npm run dev${N}\n"
  printf "  Open:            ${B}http://localhost:3719${N}\n"
  if (( WX_OK )) && (( ! WX_INITIALIZED )); then
    printf "\n${Y}Reminder:${N} wx-cli still needs ${B}sudo wx init${N} before indexing will work.\n"
  fi
fi
