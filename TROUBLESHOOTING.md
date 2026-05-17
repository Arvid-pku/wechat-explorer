# Troubleshooting

Common failure modes, in roughly the order new users hit them.

If your symptom isn't here, the dev server's console + `wx-cli`'s stderr usually have the real answer. The app never silently swallows an error.

---

## The dev server stops responding

**Symptom:** pages take forever to load, or the browser just hangs after a hot-reload. `ps aux | grep postcss` shows hundreds (or thousands) of `postcss.js` processes piled up.

**Cause:** `bun --bun next dev` leaks postcss workers on Next 16 + Turbopack. Even after switching back to plain `npm run dev`, a stuck Turbopack process can keep new postcss workers from being killed normally.

**Fix:**
```bash
pkill -9 -f "postcss.js"
pkill -9 -f "next dev"
npm run dev
```

The `-9` matters — plain `pkill -f "next dev"` is too gentle to take down a wedged Turbopack process. **Always run the web server with `npm run dev`, never `bun --bun next dev`**.

---

## `better-sqlite3` "Cannot find module"

**Symptom:** the dev server crashes on startup, or an indexer script errors with something like:

```
Error: Cannot find module '...better_sqlite3.node'
```

or:

```
Error: The module '...' was compiled against a different Node.js version using NODE_MODULE_VERSION ...
```

**Cause:** the native C++ addon hasn't been compiled for your Node version, or you switched between `bun install` and `npm install` and the install hooks didn't re-fire.

**Fix:**
```bash
npm rebuild better-sqlite3
```

If that errors with `node-gyp` complaints about missing tools, install Xcode Command Line Tools:
```bash
xcode-select --install
```

Then re-run `npm rebuild better-sqlite3`. If you originally installed with bun, you can also try `bun pm trust better-sqlite3` — same idea, different invocation.

If you've upgraded Node (e.g. `brew upgrade node`), you need to rebuild again because the binding is locked to one ABI version.

---

## `0 sessions after indexing`

**Symptom:** `npm run index:quick` runs without errors, but the app shows zero sessions and zero contacts. The Overview is blank.

**Cause:** `wx-cli` itself isn't returning data. The app trusts whatever `wx-cli` gives it, so if `wx-cli` returns an empty list, this app stores an empty index.

**Fix:** test `wx-cli` standalone:

```bash
wx sessions --limit 5
```

Expected: five rows of session JSON. If you see:

- **Nothing / empty array** — WeChat for Mac isn't running, or `wx init` failed silently. Quit WeChat, relaunch it, log in, then re-run `sudo wx init`. Check that `~/.wx-cli/` has key files in it.
- **Permission denied** — `wx-cli` couldn't read another process's memory. macOS may have asked for accessibility / developer permission in a dialog you missed. Open System Settings → Privacy & Security → Developer Tools and make sure your terminal app (Terminal, iTerm, etc) is allowed.
- **`failed to find WeChat process`** — WeChat isn't running. Launch it and wait until you've logged in.
- **`failed to decrypt`** — your ad-hoc resign expired or the WeChat binary got auto-updated. Re-run the resign step from [INSTALL.md § 1b](INSTALL.md#b-ad-hoc-resign-wechat-for-mac).

Once `wx sessions --limit 5` works, re-run `npm run index:quick`.

---

## A heavy chat shows "rerun deep index"

**Symptom:** the Contacts table has an amber ⚠ next to a chat with a tooltip like "hit 50,000-msg cap, rerun deep index".

**Cause:** the indexer caps each `index:deep` pass at 50,000 messages per chat (`HISTORY_PAGES_PER_CHAT × HISTORY_BATCH_LIMIT = 50 × 1000`). Chats with > 50k history need multiple passes.

**Fix:** just run it again.

```bash
npm run index:deep
```

Each subsequent pass extends backward (the indexer remembers the earliest timestamp it has and asks `wx-cli` for messages older than that). Repeat until the ⚠ goes away on every chat you care about.

You can also kick off a pass from inside the app: **Settings → Reindex → Deep**, which shows live progress over SSE.

---

## Reply latency / your share is unavailable, or your share looks doubled

**Symptom 1:** the You dashboard says "set me-handles in Settings" or shows blank latency histograms.

**Symptom 2:** "your share" is roughly 2× what it should be — like the app thinks you wrote twice as many messages as you remember.

**Cause:** the app needs to know which WeChat handle is *you* to compute these. In WeChat 1:1 chats, outgoing messages have `sender = <your handle>` and incoming messages have `sender = ""` (the empty string). If `""` somehow ended up in your me-handles list (e.g. from an old indexer version), the app classifies the *other* person's messages as yours — hence the doubling.

**Fix:**

1. Open **Settings → Me-handles**.
2. Click **Re-detect**.
3. If `""` is in the list, remove it. The current code strips it defensively, but stale data from an older binary can persist.

If auto-detect picks the wrong handles, you can edit them manually — they're WeChat usernames like `YXJ`, not display names.

---

## Chinese text renders as boxes / wrong font

**Symptom:** CJK characters show up as `□` or in a clearly-wrong font (e.g. Latin glyphs forced into the CJK slot).

**Cause:** your system doesn't have a CJK font installed, or the browser is picking up a partial font that lacks the glyph range.

**Fix:** on macOS, you should have PingFang SC out of the box. If not, install Source Han Sans (Noto Sans CJK) — it's free and ships every CJK glyph:

```bash
brew install --cask font-source-han-sans
```

Then quit and relaunch the browser. The `<html>` element's `lang` attribute is set to `zh-Hans` when the locale is Chinese, so font fallback should kick in correctly.

---

## "Schema version mismatch" / migration failed

**Symptom:** the app refuses to start with an error like:

```
DB schema version X newer than this binary supports; max=Y
```

or `better-sqlite3` errors when opening `~/.wechat-explorer/index.db`.

**Cause:** you downgraded the app (e.g. `git checkout` to an older commit) and now an older binary is trying to open a newer-schema DB. All schema migrations in this app are **additive only**, so the upgrade path is safe — but the downgrade path is not.

**Fix:**

- **Preferred:** upgrade the app back to a commit that knows about the schema.
  ```bash
  git checkout main
  npm install
  npm rebuild better-sqlite3
  npm run dev
  ```
- **If you really need to downgrade:** back up the DB, then start over:
  ```bash
  cp ~/.wechat-explorer/index.db ~/wechat-explorer.db.backup
  rm -rf ~/.wechat-explorer/
  npm run index:quick
  ```
  You lose the cache, archive state, and me-handles; you don't lose any source data — it all comes back from `wx-cli` on reindex.

---

## "Hydration mismatch" warning in the browser console

**Symptom:** the browser console logs something like:

```
Warning: Extra attributes from the server: data-gr-ext-installed, data-new-gr-c-s-check-loaded
```

**Cause:** the Grammarly browser extension injects attributes onto the `<body>` element after Next.js renders the page, but before React hydrates. React notices the DOM doesn't match what it rendered server-side and warns.

**Fix:** this is harmless — the app already sets `suppressHydrationWarning` on the body to swallow this specific case. The warning will still appear in dev mode (React shows it before the suppression flag takes effect). It does not appear in production (`npm run build && npm start`).

If you really want it gone, disable the Grammarly extension on `localhost`.

---

## Cache shows stale data after I changed something

**Symptom:** you changed a me-handle / archived a chat / added some data, but a page is still showing the old numbers.

**Cause:** the app has a persistent query cache (`getCachedJSON`) keyed by two epochs — an index epoch (bumped on every reindex) and an archive epoch (bumped on archive ops + me-handle changes). Most state changes bump the right epoch automatically. Schema changes, manual `lib/queries.ts` edits, and other developer-side changes don't.

**Fix:** clear the cache.

- In the app: **Settings → Query cache → Clear all**.
- From the command line:
  ```bash
  curl -X DELETE http://localhost:3719/api/cache
  ```

You can also clear by prefix: `?prefix=recap` will only drop year-recap entries.

---

## `npm run index:deep` runs forever / appears stuck

**Symptom:** the deep-index pass has been running for an hour with no obvious progress.

**Cause:** `wx-cli` is slow on chats with tens of thousands of messages, and one slow chat doesn't show progress until it finishes the page (1000 messages at a time). The script does print per-session progress lines — they may just be coming out slowly.

**Fix:**

- Run it from inside the app: **Settings → Reindex → Deep**. The SSE stream shows live per-session progress, which makes "stuck" vs "slow" obvious.
- If a single chat genuinely hangs, kill the script (`Ctrl-C`), then re-run `npm run index:deep`. The indexer is idempotent — completed chats won't re-pull, and the offending chat will get a fresh attempt with its own timeout.

---

## Last resort: reset everything

If the index is in a state you can't reason about and you'd rather just start over:

```bash
# stop the dev server first (Ctrl-C)
rm -rf ~/.wechat-explorer/
npm run index:quick
npm run dev
```

Worst case you re-run `index:deep` for full-text search. You will not lose any source data — every byte in `~/.wechat-explorer/` is derived from `wx-cli` reading WeChat's own DBs.

---

If you hit a failure mode that isn't in this list, open an issue with the exact error message and a `wx --version` + `node --version`. The dev server console + `wx-cli` stderr almost always have the information needed to diagnose it.
