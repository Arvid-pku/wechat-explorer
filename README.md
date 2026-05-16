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

- **Overview** (`/`) — totals (each card links to a `/stats/<topic>` drilldown), 365-day activity with 7-day rolling average, message-type breakdown, top link sources, surprises panel (the slowest panel is split into its own Suspense boundary so the rest streams in immediately).
- **You** (`/me`) — personal-perspective dashboard: hero (your sends / active days / peak hour / median reply), `Week / Month / Year` aggregation line chart of you vs them over time, per-weekday + 24-hour activity, voice fingerprint (avg chars / emoji / link rate / voice / image / sticker / top emoji), top-5 multi-line series for private chats + groups (+ collapsed full top-10 list), your topic TF-IDF, reply-latency histograms, links you share, "shouting into the void" chats, longest essays, busiest single minute.
- **Contacts** (`/contacts`) — Notion-style table: each column header is a popover with sort + per-column filters (name search, type filter, active/archived/all view). All filters carry in the URL as searchParams. Counts that hit the indexer cap show an amber ⚠ with a "rerun deep index" tooltip.
- **Contact detail** (`/contacts/[username]`) — monthly bars, hourly grid, reply latency histograms, style fingerprint, topic word cloud, vocab diff, top senders (groups), shared content, recent 50 messages. **Every sub-link carries `?chat=<username>`** so Calendar / Search / Links / message permalinks open scoped to this chat.
- **Links** (`/links`) — domain-group grid; per-group page has faceted view + CSV/JSON export + sender/chat filters. Honours `?chat=<username>` for chat-scoped link drill-downs.
- **Search** (`/search`) — FTS5 trigram tokeniser; 2-char CJK queries fall back to LIKE; multi-token AND-LIKE for queries where any token is short. HTML in snippets is escaped (no FTS5 `snippet()` raw passthrough). Reads `?chat=` to scope to one session and renders a "Filtered to chat" pill.
- **Calendar** (`/calendar`) — year heatmap; day-detail with hourly heatmap, TF-IDF keyword cloud, on-this-day, per-chat collapsible groups. Honours `?chat=` to scope every panel (heatmap, day detail, on-this-day, year keywords) to a single conversation.
- **Reading queue** (`/reading`) — long-form links (公众号 / 小红书 / 知乎 / Medium / Substack) latest first, with persisted read state (checkbox; stored in the `read_urls` table) and an All / Unread / Read filter.
- **Message permalink** (`/messages/[id]`) — single message with ±20 lines of surrounding context. Search results' timestamps link here.
- **Recap** (`/recap/[year]` and `/recap/[year]/[chat_username]`) — Spotify-Wrapped-style year-in-review with monthly bars, hourly grid, top contacts/groups/domains, records, word cloud, latency, new contacts, first/last message, year-over-year diff, top emoji. `/api/recap/[year]/export` produces a self-contained HTML download.
- **Graph** (`/graph`) — force-directed relationship graph (groups + people + you) with min-group-size / min-co-occurrence / max-groups filters, show-names toggle, and include-archived toggle.
- **Stats drilldowns** (`/stats/sessions|messages|links|contacts`) — Recharts donuts, treemap, radial hour chart, stacked area, etc. Reached from the Overview StatCards.
- **Settings** (`/settings`) — index status with SSE live progress (`/api/index/stream`), manual reindex, chat hygiene (stale + one-sided + size-based archive in bulk), me-handle detection / editing, member-count + group-membership backfill, persistent **Query cache** panel (rows / size / hits / current epochs / clear-all).

## Layout

```
app/
  layout.tsx                       root layout (Providers + AppShell + theme init script)
  page.tsx                         Overview (links to /stats/<topic>; Surprises streamed via Suspense)
  me/page.tsx                      personal "You" dashboard (line chart + agg switcher + top-5 multi-line)
  contacts/                        list (Notion-style column-header filters) + [username]/detail
  messages/[id]/                   single message permalink with ±20 context lines
  links/                           index + [group]/drill-down (honours ?chat=<username>) + export buttons
  search/                          FTS5 + LIKE fallback; scope pill from ?chat=
  calendar/                        year heatmap + day-detail; ?chat= scopes every panel
  reading/                         long-form link queue with persisted read state (page + reading-list.tsx)
  settings/                        index (SSE) + reindex + hygiene + me-handles + members + cache panel
  graph/                           d3-force relationship graph
  recap/[year]/                    year-in-review (+ [chat_username]/ per-chat variant)
  stats/                           sessions/messages/links/contacts Recharts drilldowns
  api/
    search/route.ts                GET ?q=...&archived=1&chat=<username|display>
    index/route.ts                 POST ?mode=quick|deep (one-shot, returns when done)
    index/stream/route.ts          POST ?mode=quick|deep (SSE — per-stage progress events)
    archive/route.ts               archive/restore session bulk-ops; bumps cache_epoch_archive
    me-handles/route.ts            GET/POST current me-handle list; on POST also refreshes daily_counts + bumps archive epoch
    member-counts/route.ts         POST ?limit= → fetches members for N more groups
    reading/route.ts               POST {urlId, read} → toggles /reading read state
    cache/route.ts                 GET cache stats; DELETE [?prefix=…] clears entries
    export/[kind]/route.ts         CSV/JSON dump for sessions/links/messages/contacts/domains
    recap/[year]/export/route.ts   self-contained HTML download

components/
  app-shell.tsx                    sidebar + header + cmdk wrapper + keyboard shortcuts
  app-sidebar.tsx                  "You" sits between Overview and Contacts
  command-palette.tsx              ⌘K (navigate + jump-to-search) + shortcut hint strip
  keyboard-shortcuts.tsx           j/k row nav, g-prefix go-to-page (g m → /me), / opens palette
  archived-filter-pill.tsx         shared "Include archived" pill + buildArchivedFilterHref()
  archive-session-button.tsx       per-session archive/restore button (contact detail header)
  theme-provider.tsx               in-house ThemeProvider (replaces next-themes; Next 16 hated its <script>)
  theme-toggle.tsx
  providers.tsx                    Theme + React Query + Tooltip
  search-view.tsx                  client component for /search; accepts scopeUsername/Display from server page
  contacts/column-header.tsx       Notion-style table header (ColumnHeader + ColumnOption + ColumnSearchInput)
  charts/
    activity-chart.tsx             365-day area + 7-day rolling line
    top-domains-bar.tsx, msg-type-list.tsx, year-heatmap.tsx
    sparkline.tsx                  pure-SVG inline sparkline
    hourly-grid.tsx, hourly-heatmap.tsx
    keyword-cloud.tsx, word-cloud.tsx (accepts chatUsername to scope word→search links)
    latency-histogram.tsx, monthly-activity-chart.tsx
    recap/                         monthly-bars, hourly-grid, latency-hist, keyword-cloud, horizontal-bars
    stats/charts.tsx               Donut, VerticalBars, StackedArea, TwoSeriesLine, LineWithBars, HourRadial, DomainTreemap, MultiLine

lib/
  wx.ts                            typed wrappers around `wx` CLI
  db.ts                            better-sqlite3 + schema + additive migrations (urls.dedup_key, daily_counts, read_urls, query_cache, sessions.last_history_*)
  url-parser.ts                    URL extraction + domain grouping
  indexer.ts                       sessions/contacts/links/history indexers; 50k single-run cap with incremental --until backfill; ANALYZE + bumpIndexEpoch on completion
  cache.ts                         persistent epoch-invalidated query cache (getCachedJSON, bumpIndexEpoch/bumpArchiveEpoch, getCacheStats, clearAllCaches)
  queries.ts                       core read-side helpers; EXCLUDED_SUBQUERY + EXCLUDED_CHAT_CLAUSE + excludedChatClause() (NULL-safe); me-handle helpers that strip ""; searchMessages with parseSearchTokens + chatUsername scope; refreshDailyCounts
  queries.calendar.ts              calendar day/year detail queries; all accept chatUsername
  queries.contact.ts               contact analytics queries + global token baseline cache
  queries.graph.ts                 graph data assembly + group/people/me node + co-occurrence edges
  recap.ts                         year-recap aggregation (wrapped in getCachedJSON) + YoY baseline
  recap-html.ts                    inline-CSS + inline-SVG renderer for the HTML export
  stats.ts                         per-topic /stats/ drilldown queries (all cached)
  me-stats.ts                      /me dashboard data layer (cached; agg-aware)
  surprises.ts                     overview anomaly cards (cached per-day key)
  text.ts                          Intl.Segmenter + CJK/EN stopwords + TF-IDF + emoji counting
  latency.ts                       reply-latency math (bucketing, percentiles, formatting)
  utils.ts                         shadcn cn() helper

tests/                             vitest pure-function tests (run with `npm test`)
  text.test.ts, latency.test.ts, url-parser.test.ts, search-tokens.test.ts

scripts/
  index.ts                         CLI: bun run scripts/index.ts [--deep|--full]
  probe-onesided.ts, probe-sizes.ts
```

## Adding a new view (cookbook)

Want a per-sender deep-dive page, or a "papers shared in 2025" view? The skeleton:

1. Add a new SQL query helper to `lib/queries.ts` (or a topic-specific module like `lib/queries.contact.ts` / `lib/me-stats.ts`). Always parameterise — never string-interpolate user input.
2. Apply `EXCLUDED_CHAT_CLAUSE` / `excludedChatClause({ alias, includeArchived })` when filtering `messages.chat_username` or `urls.chat_username` (NULL-safe). Use the raw `EXCLUDED_SUBQUERY` only inside JOIN / IN / EXISTS against non-NULL columns. Most pages take an `?archived=1` searchParam.
3. Use `urls_dedup` (a view that's now a trivial alias of `urls`, backed by the new `dedup_key` unique index) for any link read query — call-sites still reference it for consistency.
4. For aggregates that are expensive AND historical (recap, me-stats, year-keywords, anything covering a finished year or month), wrap the producer in `getCachedJSON("key", () => compute())` from `lib/cache.ts`. Use `?` in the key for parameters (e.g. `me-stats:agg=week`). The cache invalidates on the next index / archive event automatically — don't TTL it.
5. Add a page at `app/<feature>/page.tsx` calling the helper (server component, `export const dynamic = "force-dynamic"`).
6. If interactive, factor the client bits into a separate `"use client"` component. Server pages can pass primitives / arrays / objects to clients — **NOT functions** (Next 16 throws "Functions cannot be passed directly to Client Components").
7. Add the route to `components/app-sidebar.tsx`, to the cmdk palette in `command-palette.tsx`, and to the `g`-prefix shortcut switch in `keyboard-shortcuts.tsx`.
8. For tables and lists with rows you want the `j/k` keyboard nav to recognise, add `data-jk-row` to each row element.
9. If your page navigates *from* a contact detail, propagate `?chat=<username>` in every outbound link so chat-scope sticks — and resolve `chat` → `(scopeUsername, scopeDisplay)` server-side in the destination page so it can render the "Filtered to chat" pill.

## Extending the domain classifier

Edit `lib/url-parser.ts` and add to `DOMAIN_GROUPS`. The bucket key shows up as a
domain group across the Overview, Links, and Reading pages — pick something readable
since it's user-facing (`"arxiv"`, `"github"`, `"小红书"`, …).

## Known limitations

- `wx contacts` is fetched up to 500 k entries; if your address book is larger, bump the cap in `lib/indexer.ts`.
- Per-chat history fetch caps at 50,000 messages per single `Deep index` pass (`HISTORY_PAGES_PER_CHAT × HISTORY_BATCH_LIMIT`). Heavy chats with > 50k history need additional Deep-index passes — each subsequent run pulls older messages via `wx history --until <day before earliest indexed>`, extending the window. Chats that still have more history to fetch are flagged with `sessions.last_history_error = "hit 50,000-msg cap…"` and the contacts table shows an amber ⚠.
- WeChat 1:1 history identifies the OTHER party with `sender = ""` (the empty string); the user's own messages get their real handle (e.g. `YXJ`). `detectMeHandles` / `getMeHandles` / `setMeHandles` strip `""` defensively. If you imported with an older indexer / forgot to re-detect, run **Settings → Re-detect** once to flip the metric.
- AI features (style learning, draft replies, topic clustering) are intentionally left out
  for the first cut to keep the app token-free. They're the natural Tier 4 follow-up.

## Data location

| Path | Purpose | Owned by |
|---|---|---|
| `~/.wx-cli/` | WeChat DB keys + cache | wx-cli |
| `~/.wechat-explorer/index.db` | Derived index for this app | this app |
| `/Applications/WeChat.app` | The official client (ad-hoc resigned for the initial setup) | Tencent |

Nuke the explorer's index any time with `rm -rf ~/.wechat-explorer/` — it'll rebuild from `wx-cli` on next index.
