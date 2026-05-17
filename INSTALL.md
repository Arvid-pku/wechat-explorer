# Installing WeChat Explorer

This is the long version. If you'd rather move fast, the [README Quickstart](README.md#quickstart) is two commands and a setup script.

## TL;DR

```bash
npm install -g @jackwener/wx-cli && sudo wx init     # the macOS-resign / key-extraction prerequisite
git clone <your-fork> wechat-explorer && cd wechat-explorer
./scripts/setup.sh --dev                              # platform/Node checks, deps, native compile, first index, dev server
```

The setup script (`scripts/setup.sh`) is idempotent — re-running it is safe, and it picks `bun` vs `npm` based on what you have. Flags:

| Flag | Effect |
|---|---|
| _(none)_ | Install deps + native compile + first index. Don't start the server. |
| `--dev` | After setup, start `npm run dev` and serve on `localhost:3719`. |
| `--no-index` | Skip the initial `index:quick`. Useful if `wx-cli` isn't set up yet. |
| `--skip-wx` | Don't fail if `wx-cli` is missing (e.g. CI builds, doc previews). |

If the script can't run on your machine (different shell, CI sandbox, custom Node manager), the rest of this file is the manual walkthrough.

## Platform: macOS only (for now)

WeChat Explorer is a thin UI over [`wx-cli`](https://github.com/jackwener/wx-cli), and `wx-cli` is currently macOS-only — it reads WeChat for Mac's local SQLite databases and decrypts them in-memory using keys it extracts from the running process.

Windows / Linux WeChat clients store their databases differently. If you have a working setup for those, opening a PR against `wx-cli` upstream is the right place to start.

## 1. Install `wx-cli`

`wx-cli` lives at <https://github.com/jackwener/wx-cli> and ships as the npm package [`@jackwener/wx-cli`](https://www.npmjs.com/package/@jackwener/wx-cli). You'll need Node.js + npm for this step — install Node first (see §2 below) if you don't have it.

### a. Install the binary

```bash
npm install -g @jackwener/wx-cli
```

No `sudo` if your npm prefix is user-writable (the default for Homebrew Node, fnm, nvm, etc.). If you get `EACCES`, either fix your npm prefix (`npm config set prefix ~/.npm-global` and add it to `PATH`) or prepend `sudo`.

Verify:
```bash
which wx
wx --version
```

### b. Ad-hoc resign WeChat for Mac

`wx init` needs to attach to a running WeChat process to extract its decryption keys, and the system-signed binary from the App Store doesn't allow that. So you re-sign it once with your own ad-hoc developer signature.

The upstream `wx-cli` README has the canonical instructions. The shape of it:

1. Quit WeChat completely (`⌘Q`, not just close the window).
2. Re-sign the bundle: `sudo codesign --force --deep --sign - /Applications/WeChat.app`.
3. Re-launch WeChat from `/Applications` and log in normally.

**Do this in Terminal**, not via the standalone `.app`'s onboarding wizard. On macOS Sequoia, Apple's *App Management* privacy gate blocks non-notarized apps from modifying other installed apps in `/Applications/`, even when they escalate to root via `osascript`. Terminal can do it (you may be prompted once to grant Terminal "App Management" permission — click Allow); our `.app` can't. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#wizards-re-sign-wechat-step-fails-with-operation-not-permitted) for the gory details.

### c. Initialize key extraction

```bash
sudo wx init
```

`sudo` is required because `wx-cli` needs to read another process's memory. It will save the extracted keys to `~/.wx-cli/`. Once that succeeds, every subsequent `wx` call (including the ones this app makes) uses the cached keys — you don't need `sudo` again unless you log into a different WeChat account or your keys get invalidated.

Smoke-test it:
```bash
wx sessions --limit 5
```

If that prints five rows, you're done with this step. If it prints nothing or errors, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#0-sessions-after-indexing).

## 2. Install Node.js (≥ 21)

The web server runs on Node. Pick any one of:

- **Homebrew**: `brew install node` — simple, system-wide.
- **fnm**: `brew install fnm && fnm install 22 && fnm use 22` — per-project version pinning, fast.
- **n**: `brew install n && sudo n stable` — also fine.
- **Volta** or **nvm** — both work; pick whichever feels familiar.

Verify:
```bash
node --version       # should print v21 or higher
npm --version
```

This project is tested through Node 25. Node 21+ is required because Next.js 16 needs it.

## 3. (Optional) Install Bun

Bun is faster at installing JavaScript dependencies than npm, but it can't replace Node for this project — the web server has to run on Node because of a [postcss worker leak](AGENTS.md#critical-pitfalls-relearned-the-hard-way) we hit on Next 16 + Turbopack, and the indexer scripts use a native SQLite binding (`better-sqlite3`) that doesn't yet work under Bun ([oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290)).

So the trade-off:

| | bun | npm |
|---|---|---|
| `install` speed | ~3× faster | slower |
| `next dev` | runs on Node either way | runs on Node either way |
| indexer scripts | uses tsx + Node either way | uses tsx + Node either way |

Bun is purely a "speed up the install step" thing here. If you don't already use Bun, skipping it is fine.

```bash
curl -fsSL https://bun.sh/install | bash
```

## 4. Clone and install dependencies

```bash
git clone <your-fork-of-this-repo> wechat-explorer
cd wechat-explorer
```

Then either:
```bash
bun install
```
or:
```bash
npm install
```

You don't need both.

## 5. Compile the native SQLite binding

`better-sqlite3` ships a C++ addon. On install, npm/bun will try to download a prebuilt binary, but the prebuild often misses for new Node / macOS combos. Run one of:

```bash
# if you installed with bun:
bun pm trust better-sqlite3

# if you installed with npm:
npm rebuild better-sqlite3
```

This invokes `node-gyp` to build the addon locally. It needs Xcode Command Line Tools:

```bash
xcode-select --install
```

If the build still fails, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#better-sqlite3-cannot-find-module).

## 6. First index

Build the cheap (~20 s) index first:

```bash
npm run index:quick
```

This pulls every session, every contact, and every link message into `~/.wechat-explorer/index.db`. You can already explore most of the app at this point — open `http://localhost:3719` after step 7.

Once you've poked around and decided you want full-text search, do a deep index. This pulls per-chat message history for active chats over the last 365 days; it's the expensive one:

```bash
npm run index:deep
```

20–40 minutes the first time, faster on later runs (incremental). Each chat has a 50k-message cap per pass, so heavy chats need multiple `index:deep` runs — re-run it until no chats are flagged with an amber ⚠ in the contacts table.

You can also trigger both modes from inside the app (Settings → Reindex) once it's running, with a live progress bar over SSE.

## 7. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3719>. The server binds to `localhost` only — nothing on your network can reach it.

If you want a production build:
```bash
npm run build
npm start
```

## 8. Set your me-handles

The first time you open the app, head to **Settings → Me-handles** and click **Re-detect**. The app needs to know which WeChat handle is *yours* to compute "your share", reply latency, and the You dashboard.

The auto-detect works well for most setups. If it doesn't, you can edit the list manually — they're WeChat usernames like `YXJ`, not display names. **Do not add the empty string `""`** as a me-handle (the app strips it defensively, but knowing why: `""` means "the other person in a 1:1" in `wx-cli`'s schema).

## Troubleshooting

If anything in this guide failed, [TROUBLESHOOTING.md](TROUBLESHOOTING.md) covers the common failure modes.

## What next

- Hit `/recap/<previous-year>` for your Spotify-Wrapped-style year in review.
- Try the keyboard shortcuts: `g h` (home), `g m` (you), `g c` (contacts), `g k` (calendar), `g y` (current-year recap), `/` (search palette).
- Download an HTML export of any page — the icon next to the theme toggle in the header.
- Read [AGENTS.md](AGENTS.md) if you want to add a new view or metric.
