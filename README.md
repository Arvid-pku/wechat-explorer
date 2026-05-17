# WeChat Explorer

**A private, local-only window into your own WeChat history.** Search, count, chart, and re-read a decade of chats — without any of it leaving your laptop.

<!-- TODO: capture screenshots with anonymized data, drop them into public/screenshots/ -->

<p>
  <img src="public/screenshots/overview.png" width="800" alt="Overview dashboard — totals, 365-day activity, top link sources">
  <img src="public/screenshots/me.png" width="800" alt="You dashboard — YoY card, voice fingerprint, top chats, Did-you-know panel">
  <img src="public/screenshots/contact-detail.png" width="800" alt="Contact detail — monthly bars, reply-latency histogram, vocab diff, style fingerprint">
  <img src="public/screenshots/calendar.png" width="800" alt="Calendar — year heatmap with day detail and on-this-day">
  <img src="public/screenshots/recap.png" width="800" alt="Year-in-review recap, Spotify-Wrapped style">
</p>

## Why this exists

WeChat Explorer is **local-only by design**. There are no LLM calls, no telemetry, no analytics pixels, no cloud sync, no auto-update pinger. The dev server binds to `localhost:3719` and never talks to anything outside your machine. The only network it touches is your own filesystem — via the [`wx-cli`](https://github.com/jackwener/wx-cli) tool, which reads WeChat's decrypted SQLite databases on disk.

Even the offline mode is offline: when you click **Download** on any page, charts re-render as inline SVG (no JavaScript needed to open the export later), styles are inlined, and the file is a self-contained `.html` you can email, archive, or open with WiFi disabled.

If you've ever wanted to read your own chat history without trusting a third party with it, this is for you.

## What you can do

- **Full-text search** across years of messages, with a trigram tokenizer that handles 中文 properly (and a graceful LIKE fallback for 2-char CJK queries that FTS5 can't index).
- **Year in Review** — a Spotify-Wrapped-style `/recap/<year>` page for every full year you have data for, plus a per-chat variant.
- **Contact deep-dive** — for any person or group: monthly volume, hour-of-day heatmap, reply-latency distribution, vocabulary diff vs your average, style fingerprint, top senders, all in one scroll.
- **Force-directed relationship graph** — who-talks-to-whom, plus you in the middle, with filters for min group size and co-occurrence weight.
- **Calendar heatmap** with day-detail, "on this day in previous years", and per-day TF-IDF keywords.
- **"Did you know" personality cards** — ~20 records computed across all your chats: busiest day, most lopsided 1:1, longest reunion gap, distinct people seen, most-balanced friendship.
- **Reading queue** — long-form links (公众号, 知乎, Substack, …) deduped across chats so the same article forwarded by 5 friends shows up once.
- **Topic tracker** — type a word, see its monthly occurrence over years, plus the top chats and senders for it.
- **EN / 中文 toggle** with persisted preference, and a light / dark / system theme.
- **One-click HTML export** for every page — standalone, JS-free, archivable.
- **Keyboard-first navigation** — `g h/m/c/l/k/r/s/g/t/y` to jump between pages, `j/k` between rows, `/` opens a command palette.

## Quickstart

Two commands after a clone — the setup script handles dependencies, the native SQLite compile, and the first index:

```bash
git clone <your-fork> wechat-explorer && cd wechat-explorer
./scripts/setup.sh --dev
```

That runs platform / Node / wx-cli checks, picks `bun` or `npm` based on what's installed, rebuilds the native `better-sqlite3` addon, runs a quick index if `wx-cli` is initialised, and starts the dev server. Open <http://localhost:3719>. Re-running the script is safe — every step is idempotent.

Other flags:

```bash
./scripts/setup.sh                # install + first index, no dev server
./scripts/setup.sh --no-index     # install only (skip the initial index)
./scripts/setup.sh --skip-wx      # set up the web tier without wx-cli (CI / docs preview)
npm run setup                     # same as ./scripts/setup.sh, for users who prefer npm scripts
npm run setup:dev                 # same as --dev
```

### One prerequisite the script can't do for you

`wx-cli` is the bridge that reads WeChat's local SQLite. Install it once:

```bash
brew install jackwener/tap/wx-cli
sudo wx init                      # caches WeChat DB keys to ~/.wx-cli/
```

`wx init` requires WeChat for Mac to be **ad-hoc resigned** and running — that's a one-time macOS quirk. The setup script detects whether `wx-cli` is installed and initialised, and prints clear next steps if it isn't. [INSTALL.md](INSTALL.md#1-install-wx-cli) walks through the resign flow.

### Manual install (if the script can't run)

If you're on Linux, in CI, or just don't want to run a bash script, the long form is in [INSTALL.md](INSTALL.md). Summary:

```bash
bun install && bun pm trust better-sqlite3        # OR: npm install && npm rebuild better-sqlite3
npm run index:quick                               # ~20s — sessions + contacts + bulk link messages
npm run index:deep                                # 20–40 min on first run — full-text history per chat
npm run dev
```

## System requirements

| | |
|---|---|
| **Platform** | macOS only (because `wx-cli` is currently macOS only) |
| **Node.js** | ≥ 21 (tested through 25) |
| **Bun** | optional — speeds up `install`, but the web server runs on Node either way |
| **Disk** | ~1 GB free for a ~1M-message corpus (index DB + WAL) |
| **WeChat for Mac** | ad-hoc resigned, running once for the initial `wx init` |

## Pages reference

One line each. Every page has a Download button in the header for a standalone HTML export.

- [**Overview** (`/`)](app/page.tsx) — totals, 365-day activity with 7-day rolling average, message-type breakdown, top link sources, surprises panel.
- [**You** (`/me`)](app/me/page.tsx) — personal dashboard with YoY card, voice fingerprint, 2×2 top-chats grid (sent / received × private / groups), reply-latency histograms, and a streamed "Did you know" panel.
- [**Contacts** (`/contacts`)](app/contacts/page.tsx) — Notion-style table with per-column sort + filter popovers.
- [**Contact detail** (`/contacts/[username]`)](app/contacts/[username]/page.tsx) — monthly bars, hourly grid, reply latency, style fingerprint, vocab diff, top senders, recent 50.
- [**Links** (`/links`)](app/links/page.tsx) — domain-grouped link explorer with CSV/JSON export per group.
- [**Search** (`/search`)](app/search/page.tsx) — FTS5 + trigram tokenizer, LIKE fallback for 2-char CJK, snippet HTML escaped.
- [**Calendar** (`/calendar`)](app/calendar/page.tsx) — year heatmap with day detail, on-this-day, and per-day keywords.
- [**Reading** (`/reading`)](app/reading/page.tsx) — long-form link queue, deduped across chats, with read-state checkboxes.
- [**Topics** (`/topics`, `/topics/[word]`)](app/topics/page.tsx) — longitudinal word tracker (monthly count + top chats + top senders + samples).
- [**Recap** (`/recap/[year]`)](app/recap/[year]/page.tsx) — year-in-review, plus `/recap/[year]/[chat_username]` per-chat variant.
- [**Graph** (`/graph`)](app/graph/page.tsx) — force-directed relationship graph.
- [**Stats drilldowns** (`/stats/{sessions|messages|links|contacts}`)](app/stats) — Recharts donuts, treemaps, radial-hour, stacked area.
- [**Settings** (`/settings`)](app/settings/page.tsx) — language, theme, reindex (live SSE progress), chat hygiene (bulk archive), me-handle detection, cache panel.

## HTML export

Every page has a download icon in the header. Click it and you get a standalone `.html` you can open in any browser, on any machine, with WiFi disabled.

How it works: the export endpoint (`/api/export/page?path=<current>`) fetches the page in-process, inlines its linked CSS, strips `<script>` tags and the sidebar/header chrome, and returns a `Content-Disposition: attachment` response. Charts that use Recharts (which renders client-side only) swap to pure SVG primitives in [`lib/server-charts.tsx`](lib/server-charts.tsx) — so the offline file has full-fidelity charts without needing JavaScript to render them.

For structured data dumps (messages, sessions, links, domains, contacts), `/api/export/[kind]` returns CSV or JSON directly.

Try it: download `/recap/2024.html`, turn off your WiFi, open the file. It should look identical.

## Customising

- **Domain grouping** — edit [`lib/url-parser.ts`](lib/url-parser.ts) and add to `DOMAIN_GROUPS`. The bucket key is user-facing (`"arxiv"`, `"github"`, `"小红书"`), so pick something readable.
- **UI translations** — strings live in [`lib/i18n.ts`](lib/i18n.ts) as flat `{ key: { en, zh } }`. Missing keys fall back to English. Chat content is user data and is not translated.
- **New view / metric** — see the cookbook in [AGENTS.md](AGENTS.md#adding-a-new-module-cookbook).

## Data location

| Path | Owned by | Purpose |
|---|---|---|
| `~/.wx-cli/` | `wx-cli` | WeChat decryption keys + cache |
| `~/.wechat-explorer/index.db` | this app | Derived index (the only file this app writes) |
| `/Applications/WeChat.app` | Tencent | Source database; ad-hoc resigned for `wx init` |

To use a different location, set `WE_DATA_DIR=/path/to/dir` before running anything (indexer scripts, dev server, etc).

To nuke and start over:
```bash
rm -rf ~/.wechat-explorer/
npm run index:quick
```
You'll lose your cache and any custom me-handle / archive settings, but no source data — `wx-cli` will repopulate everything from WeChat's own DBs.

## Upgrading

The index DB stamps a schema version in its `meta` table. When you `git pull` a newer version and run `npm run dev`, the app will run any new additive migrations (`ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`) automatically on first connection — your data is preserved.

But if you ever try to open a *newer* DB with an *older* binary (e.g. after a `git checkout` to an old commit), `better-sqlite3` will refuse to load the file and the error will reference `~/.wechat-explorer/index.db`. Don't try to fight the migration — just upgrade the app to a commit that knows about that schema. If you really need to downgrade, back up the DB and reindex from scratch.

## Limitations

- **`wx contacts` cap** — fetches up to 500k entries. If your address book is larger, bump the cap in [`lib/indexer.ts`](lib/indexer.ts).
- **50k-msg history cap per pass** — chats with > 50k history need multiple `index:deep` runs. Each pass extends backward; chats still in flight show an amber ⚠ in the contacts table with the message "rerun deep index". The marker self-clears when no more history comes back.
- **WeChat 1:1 sender semantics** — outgoing messages have `sender = <your handle>` (e.g. `YXJ`); incoming messages have `sender = ""`. The app strips `""` from me-handles defensively, but if you imported with an older indexer, run **Settings → Re-detect** once to get correct "your share" percentages.
- **Graph export** — `/graph` uses a live d3-force simulation that can't be statically rendered; its HTML export shows the empty SVG shell only. Every other page exports fully.
- **i18n coverage** — sidebar, page titles, primary actions, hero stats are translated. Long-form copy on smaller panels is still EN-only. Adding `t()` calls is incremental — open a PR for any string you want translated.
- **No AI features** — intentional. Style learning, draft replies, topic clustering would all be useful, but they would require sending your chat data to a model. That's the line this project doesn't cross.

## Development

This README is written for users. If you're reading the source to extend the app, start with [AGENTS.md](AGENTS.md) — it documents the conventions, pitfalls, performance budget, and a "add a new view" cookbook.

Tests:
```bash
npm test
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common failure modes (stuck dev server, native binding errors, `0 sessions after indexing`, schema mismatches, …).

## License

No license picked yet — © the author. **Pick a license before publishing or sharing this repo**, otherwise it's "all rights reserved" by default and contributors won't know what they can do with it. The MIT or Apache-2.0 licenses are common defaults for a project like this.
