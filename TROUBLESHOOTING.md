# Troubleshooting

Common failure modes, in roughly the order new users hit them.

If your symptom isn't here, the dev server's console + `wx-cli`'s stderr usually have the real answer. The app never silently swallows an error.

---

## The downloaded `.app` won't open — "Apple could not verify…"

**Symptom:** you dragged `WeChat Explorer.app` from the `.dmg` into `/Applications`, double-clicked, and got either:

- *"Apple could not verify "WeChat Explorer.app" is free of malware…"* (Sequoia, no Open button), or
- *"WeChat Explorer.app can't be opened because it is from an unidentified developer"* (older macOS), or
- Nothing — the icon bounces in the Dock once and disappears.

**Cause:** the bundle is ad-hoc signed (we don't have a paid Apple Developer ID for proper Developer ID signing + notarization), so macOS Gatekeeper blocks it on first launch. The "icon bounces and disappears" variant is older builds where the bundle was unsigned entirely — only seen in pre-v0.1.2; the current release ad-hoc signs.

**Fix (Sequoia 15.x — most common today):** Sequoia removed the "Open Anyway" button from the warning dialog itself. The route is:

1. Dismiss the dialog (click **Done**, not Move to Trash).
2. Open **System Settings → Privacy & Security**.
3. Scroll to the bottom. You'll see *"WeChat Explorer was blocked to protect your Mac."* Click **Open Anyway**.
4. macOS prompts once more; click Open, enter your password. From now on, double-click works normally.

**Fix (Sonoma 14.x and earlier):** right-click the app icon → **Open**, then **Open** in the dialog. One time.

**Last-resort Terminal workaround**: works on any macOS, but only do this if you trust the source (you should — it's your own download from the Releases page):

```bash
xattr -dr com.apple.quarantine "/Applications/WeChat Explorer.app"
```

If even that doesn't make it launch, the ad-hoc signature is broken. Re-sign manually:
```bash
codesign --force --deep --sign - "/Applications/WeChat Explorer.app"
```

---

## Wizard's "Re-sign WeChat" step fails with "Operation not permitted"

**Symptom:** in the in-app onboarding wizard, you click *Run it* on the **Re-sign WeChat** step. The macOS password dialog pops up. You enter your password. The wizard then shows:

```
0:105: execution error: /Applications/WeChat.app: replacing existing signature
/Applications/WeChat.app: Operation not permitted
In subcomponent: /Applications/WeChat.app/Contents/Frameworks/ConfSDKdyn.framework (1)
```

(and incorrectly labels it as "Cancelled" — that's a v0.1.2 bug being fixed in v0.1.3).

**Cause:** macOS Sequoia's **App Management** privacy gate. Even with `sudo` via `osascript`'s `with administrator privileges`, macOS won't let a non-notarized app modify other installed `.app`s in `/Applications/`. The codesign call succeeds at writing the outer bundle but is refused on `ConfSDKdyn.framework` (or another inner framework) and bails out. Apple doesn't reliably even let users toggle App Management permission for unsigned apps, so the GUI path is closed.

**Fix:** quit the wizard, open **Terminal.app**, and do the two privileged steps yourself:

```bash
# 1. Make sure WeChat is fully quit (⌘Q in WeChat, not just closed window).
osascript -e 'tell application "WeChat" to quit'

# 2. Re-sign with your ad-hoc signature. macOS may prompt Terminal for
# "App Management" permission the first time — click Allow.
sudo codesign --force --deep --sign - /Applications/WeChat.app

# 3. Launch WeChat from Finder or `open`, log in normally, leave it running.
open /Applications/WeChat.app

# 4. Once WeChat is logged in: extract the keys.
sudo wx init
```

When `wx init` writes `~/.wx-cli/all_keys.json`, you're done with the prereq chain. Restart **WeChat Explorer** — the wizard detects everything as ready and jumps to *Build first index*.

A proper Apple Developer ID + notarization would let our wizard do all of this without Terminal. That's not in scope until/unless we publish on something other than self-distribution.

---

## All contacts show "0 messages" — dashboards look empty

**Symptom:** the Contacts table populates (hundreds or thousands of rows with real names + last-active times), but every row's *Messages* and *Links* column reads `0`. Clicking into any contact shows no analytics. `/me`, calendar, recap are all empty.

**Cause:** only the **Quick index** has run, which fetches the session list + bulk link messages but **not per-chat history**. The wizard's "Build first index" button runs `index:quick` (~20 s) — that's intentional, because the deep pass takes 20-40 min on first run.

**Fix:** in the app, open **Settings → Reindex → Deep index**. Watch the live progress bar (SSE-streamed). Walk away for half an hour the first time; later runs are incremental and fast. After it finishes:

- Contact rows show real message counts.
- Click any contact → monthly bars, hourly grid, reply latency, vocab diff, style fingerprint all populated.
- Search hits actual message bodies, not just sessions.
- `/me`, `/calendar`, `/recap/<year>` come to life.

If specific heavy chats show an amber ⚠ on their count with a "rerun deep index" tooltip, that's the 50,000-msg-per-pass cap — re-run Deep index a couple more times to backfill older history.

Sidebar note: contact names like `wxid_abc…`, `gh_xxx`, or `12345@chatroom` are how WeChat internally identifies people / 公众号s / groups. After the deep index pulls message metadata, many of those resolve to friendlier names; some don't (because WeChat itself doesn't have a display name for them).

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
