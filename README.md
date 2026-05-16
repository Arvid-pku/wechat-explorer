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

- **Overview** (`/`) — totals (each card links to a `/stats/<topic>` drilldown), 365-day activity with 7-day rolling average, message-type breakdown, top link sources, surprises panel.
- **Contacts** (`/contacts`) — every session ranked by recent / messages / links / name, filterable by chat type and by active / archived / all view.
- **Contact detail** (`/contacts/[username]`) — monthly bars, hourly grid, reply latency histograms, style fingerprint, topic word cloud, vocab diff, top senders (groups), shared content, recent 50 messages.
- **Links** (`/links`) — domain-group grid; per-group page has faceted view + CSV/JSON export + sender/chat filters.
- **Search** (`/search`) — FTS5 trigram tokeniser; 2-char CJK queries fall back to LIKE.
- **Calendar** (`/calendar`) — year heatmap; day-detail with hourly heatmap, TF-IDF keyword cloud, on-this-day, per-chat collapsible groups.
- **Reading queue** (`/reading`) — long-form links (公众号 / 小红书 / 知乎 / Medium / Substack) latest first.
- **Recap** (`/recap/[year]` and `/recap/[year]/[chat_username]`) — Spotify-Wrapped-style year-in-review with monthly bars, hourly grid, top contacts/groups/domains, records, word cloud, latency, new contacts, first/last message, year-over-year diff, top emoji. `/api/recap/[year]/export` produces a self-contained HTML download.
- **Graph** (`/graph`) — force-directed relationship graph (groups + people + you) with min-group-size / min-co-occurrence / max-groups filters, show-names toggle, and include-archived toggle.
- **Stats drilldowns** (`/stats/sessions|messages|links|contacts`) — Recharts donuts, treemap, radial hour chart, stacked area, etc. Reached from the Overview StatCards.
- **Settings** (`/settings`) — index status, manual reindex, chat hygiene (stale + one-sided + size-based archive), me-handle detection, member-count + group-membership backfill.

## Layout

```
app/
  layout.tsx                       root layout (Providers + AppShell + theme init script)
  page.tsx                         Overview (links to /stats/<topic>)
  contacts/                        list + [username]/detail (analytics dashboard)
  links/                           index + [group]/drill-down + export buttons
  search/                          FTS5 + LIKE fallback (client view)
  calendar/                        year heatmap + day-detail (keywords, on-this-day, hourly, per-chat)
  reading/                         curated long-form link list
  settings/                        index status + reindex + hygiene + me-handles + members
  graph/                           d3-force relationship graph
  recap/[year]/                    year-in-review (+ [chat_username]/ per-chat variant)
  stats/                           sessions/messages/links/contacts Recharts drilldowns
  api/
    search/route.ts                GET ?q=...&archived=1
    index/route.ts                 POST ?mode=quick|deep
    archive/route.ts               archive/restore session bulk-ops
    me-handles/route.ts            GET/POST current me-handle list
    member-counts/route.ts         POST ?limit= → fetches members for N more groups
    export/[kind]/route.ts         CSV/JSON dump for sessions/links/messages/contacts/domains
    recap/[year]/export/route.ts   self-contained HTML download

components/
  app-shell.tsx                    sidebar + header + cmdk wrapper + keyboard shortcuts
  app-sidebar.tsx
  command-palette.tsx              ⌘K (navigate + jump-to-search) + shortcut hint strip
  keyboard-shortcuts.tsx           j/k row nav, g-prefix go-to-page, / opens palette
  archived-toggle.tsx              shared "Include archived" pill + buildArchivedToggleHref()
  archive-toggle.tsx               per-session archive/restore button (contact detail header)
  theme-provider.tsx               in-house ThemeProvider (replaces next-themes; Next 16 hated its <script>)
  theme-toggle.tsx
  providers.tsx                    Theme + React Query + Tooltip
  search-view.tsx                  client component for /search (with archived toggle)
  charts/
    activity-chart.tsx             365-day area + 7-day rolling line
    top-domains-bar.tsx, msg-type-list.tsx, year-heatmap.tsx
    sparkline.tsx                  pure-SVG inline sparkline
    hourly-grid.tsx, hourly-heatmap.tsx
    keyword-cloud.tsx, word-cloud.tsx
    latency-histogram.tsx, monthly-activity-chart.tsx
    recap/                         monthly-bars, hourly-grid, latency-hist, keyword-cloud, horizontal-bars
    stats/charts.tsx               Donut, VerticalBars, StackedArea, LineWithBars, HourRadial, DomainTreemap

lib/
  wx.ts                            typed wrappers around `wx` CLI
  db.ts                            better-sqlite3 + schema + additive migrations + `urls_dedup` view
  url-parser.ts                    URL extraction + domain grouping
  indexer.ts                       sessions/contacts/links/history indexers
  queries.ts                       core read-side helpers + EXCLUDED_SUBQUERY + excludedSubquery()
  queries.calendar.ts              calendar day/year detail queries
  queries.contact.ts               contact analytics queries + global token baseline cache
  queries.graph.ts                 graph data assembly + group/people/me node + co-occurrence edges
  recap.ts                         year-recap aggregation (5-min in-process cache) + YoY baseline
  recap-html.ts                    inline-CSS + inline-SVG renderer for the HTML export
  stats.ts                         per-topic /stats/ drilldown queries
  surprises.ts                     overview anomaly cards (spike, dry-streak, fresh contact, etc.)
  text.ts                          Intl.Segmenter + CJK/EN stopwords + TF-IDF + emoji counting
  latency.ts                       reply-latency math (bucketing, percentiles, formatting)
  utils.ts                         shadcn cn() helper

scripts/
  index.ts                         CLI: bun run scripts/index.ts [--deep|--full]
  probe-onesided.ts, probe-sizes.ts
```

## Adding a new view (cookbook)

Want a per-sender deep-dive page, or a "papers shared in 2025" view? The skeleton:

1. Add a new SQL query helper to `lib/queries.ts` (or a topic-specific module like `lib/queries.contact.ts`). Always parameterise — never string-interpolate user input.
2. Apply `excludedSubquery({ includeArchived })` to filter sessions in stats / search / link contexts. Most pages take an `?archived=1` searchParam.
3. Use `urls_dedup` (a view in `lib/db.ts`) instead of `urls` for any link read query — `urls` has duplicates from the two ingestion paths.
4. Add a page at `app/<feature>/page.tsx` calling the helper (server component, `export const dynamic = "force-dynamic"`).
5. If interactive, factor the client bits into a separate `"use client"` component.
6. Add the route to `components/app-sidebar.tsx` and to the cmdk palette in `command-palette.tsx`.
7. For tables and lists with rows you want the `j/k` keyboard nav to recognise, add `data-jk-row` to each row element.

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
