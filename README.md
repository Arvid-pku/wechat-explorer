# WeChat Explorer

A local-first explorer for your WeChat chat history. Reads from your already-decrypted
local SQLite via [`wx-cli`](https://github.com/jackwener/wx-cli), builds a fast search-friendly
index, and renders it as a polished web app — never leaves your machine.

> **Privacy:** No network calls go out. The dev server binds to localhost. Your WeChat
> credentials never touch this app — `wx-cli` reads the local DBs decrypted in memory.

## Stack

| Layer | Choice |
|---|---|
| Web runtime | **Node** (via `next dev` / `next start`) |
| Script runtime | **Bun + tsx** (indexer scripts run on either) |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | Tailwind CSS v4 + shadcn/ui |
| State | Tanstack Query + Tanstack Table |
| Charts | Recharts (line/area) + custom SVG (heatmap) |
| Search | SQLite FTS5 + trigram tokenizer (CJK friendly) |
| Storage | SQLite via `better-sqlite3` at `~/.wechat-explorer/index.db` |

> **Why Node, not Bun, for the web server:** `bun --bun next dev` on Next.js 16 + Turbopack leaks Node postcss workers (seen 2,000+ orphans in a single session). Switching the web tier to Node fixes the leak. Indexer scripts still run via Node + tsx (Bun doesn't yet support better-sqlite3's native bindings — tracked in oven-sh/bun#4290).

## Prerequisites

1. **wx-cli installed and initialized** — `sudo wx init` once, keys cached to `~/.wx-cli/`.
2. **Node ≥ 21** (Node 25 tested).
3. **Bun** (optional, for faster `bun install`) — `curl -fsSL https://bun.sh/install | bash`.
4. WeChat for Mac signed ad-hoc (only needed for the initial `wx init` flow).

## Quickstart

```bash
# install deps (bun is fast; npm install also works)
bun install
bun pm trust better-sqlite3   # one-time: compile the native binding

# build the index (first run): pulls all sessions, contacts, and link messages
npm run index:quick

# OR build the deep index too: history per active chat (slower; ~20–40 min)
npm run index:deep

# start the app on Node
npm run dev
# open http://localhost:3719
```

### Recovery — if dev server hangs

If you ever see thousands of orphan `postcss.js` workers (root cause of unresponsive pages):

```bash
pkill -9 -f "postcss.js"
pkill -9 -f "next dev"
npm run dev
```

## Index modes

| Mode | What it does | Cost | When to run |
|---|---|---|---|
| `index:quick` | sessions + contacts + bulk link messages (`wx search --type link`) | ~20 s | Daily / before opening the app |
| `index:deep`  | per-chat history for active chats in last 365 days | ~20–40 min | Weekly, or whenever you want fresh full-text search |
| `index:full`  | quick + deep in one shot | both | First-time bootstrap |

Each run is **incremental and idempotent** — re-running won't duplicate messages
(uniqueness is enforced via `(chat_username, local_id)` and content hashes).

You can also trigger either mode from **Settings → Reindex** inside the app.

## Pages

- **Overview** — totals, 365-day activity, message-type breakdown, top link sources.
- **Contacts** — every session ranked by recent / messages / links / name, filterable by chat type. Click any row for a deep dive.
- **Contact detail** — session stats, recent messages, top senders, link breakdown.
- **Links** — every shared URL grouped by domain (公众号 / 小红书 / B站 / arxiv / github / …). Each group has a faceted view with sender + chat filters.
- **Search** — FTS5 across all indexed message content with trigram tokenization (Chinese substring matching just works).
- **Calendar** — year heatmap; click any day to see messages from that date.
- **Reading queue** — long-form links (公众号 articles, 小红书, 知乎, Medium, Substack) latest first.
- **Settings** — index status, manual refresh, storage info.

## Layout

```
app/
  layout.tsx                 root layout (providers + shell)
  page.tsx                   Overview
  contacts/                  list + [username]/detail
  links/                     index + [group]/drill-down
  search/                    FTS5 client view
  calendar/                  year heatmap + day detail
  reading/                   curated long-form link list
  settings/                  index status + reindex actions
  api/
    search/route.ts          GET ?q=...
    index/route.ts           POST ?mode=quick|deep

components/
  app-shell.tsx              sidebar + header + cmdk wrapper
  app-sidebar.tsx
  command-palette.tsx        ⌘K (navigate + jump-to-search)
  theme-toggle.tsx           light/dark/system
  providers.tsx              theme + react-query + tooltip
  search-view.tsx            client component for /search
  charts/
    activity-chart.tsx       365-day area chart
    top-domains-bar.tsx      ranked horizontal bars
    msg-type-list.tsx        type breakdown bars
    year-heatmap.tsx         GitHub-style calendar

lib/
  wx.ts                      typed wrappers around `wx` CLI
  db.ts                      bun:sqlite + schema + meta helpers
  url-parser.ts              URL extraction + domain grouping
  indexer.ts                 sessions/contacts/links/history indexers
  queries.ts                 read-side query helpers used by pages
  utils.ts                   shadcn helper

scripts/
  index.ts                   CLI: bun run scripts/index.ts [--deep|--full]
```

## Adding a new view (cookbook)

Want a per-sender deep-dive page, or a "papers shared in 2025" view? The skeleton:

1. Add a new SQL query helper to `lib/queries.ts`.
2. Add a page at `app/<feature>/page.tsx` calling the helper (server component, no API needed).
3. If interactive, factor the client bits into a separate `"use client"` component.
4. Add the route to `components/app-sidebar.tsx` (and to the cmdk palette in `command-palette.tsx`).

## Extending the domain classifier

Edit `lib/url-parser.ts` and add to `DOMAIN_GROUPS`. The bucket key shows up as a
domain group across the Overview, Links, and Reading pages — pick something readable
since it's user-facing (`"arxiv"`, `"github"`, `"小红书"`, …).

## Known limitations

- `wx contacts` is fetched up to 500 k entries; if your address book is larger, bump the cap in `lib/indexer.ts`.
- Reading-queue "read/unread" toggle is not yet persisted (Tier 2 follow-up).
- AI features (style learning, draft replies, topic clustering) are intentionally left out
  for the first cut to keep the app token-free. They're the natural Tier 4 follow-up.

## Data location

| Path | Purpose | Owned by |
|---|---|---|
| `~/.wx-cli/` | WeChat DB keys + cache | wx-cli |
| `~/.wechat-explorer/index.db` | Derived index for this app | this app |
| `/Applications/WeChat.app` | The official client (ad-hoc resigned for the initial setup) | Tencent |

Nuke the explorer's index any time with `rm -rf ~/.wechat-explorer/` — it'll rebuild from `wx-cli` on next index.
