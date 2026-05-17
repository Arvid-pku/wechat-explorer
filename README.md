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
| UI | Tailwind CSS v4 + shadcn/ui (over `@base-ui/react`) |
| State | Tanstack Query + Tanstack Table |
| Charts | Recharts on the live page; pure-SVG primitives (`lib/server-charts.tsx`) on the HTML export + per-page server-SVG components (heatmap, sparkline, recap charts) |
| Search | SQLite FTS5 + trigram tokenizer (CJK friendly) |
| Storage | SQLite via `better-sqlite3` at `~/.wechat-explorer/index.db` |
| i18n | EN / 中文 toggle backed by a `we-locale` cookie; flat dictionary in `lib/i18n.ts` |
| Export | One-click HTML export per page via `/api/export/page` + a bespoke recap renderer |

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

- **Overview** (`/`) — totals (each card links to a `/stats/<topic>` drilldown), 365-day activity with 7-day rolling average, message-type breakdown, top link sources, surprises panel (Suspense-streamed). The "Indexed messages" stat card shows a 30-day vs prior-30-day delta from `daily_counts`.
- **You** (`/me`) — personal-perspective dashboard with URL-driven controls (`agg=week|month|year`, `split=1` to break "them" into private vs groups, `topN=3|5|10`, `topRange=all|1y|6m|3m`). Hero strip, YoY-vs-prior-365d card, activity line chart, hour-of-day + weekday, voice fingerprint, **2×2 top-chats grid** (who you message most / who messages you most × private / groups), topic TF-IDF, reply-latency histograms, links you share, "shouting into the void", longest essays, busiest single minute, and a Suspense-streamed **"Did you know"** panel with ~20 personality records (busiest day, most lopsided 1:1, longest reunion gap, distinct people seen, …).
- **Contacts** (`/contacts`) — Notion-style table: each column header is a popover with sort + per-column filters (name search, type filter, active/archived/all view). All filters carry in the URL as searchParams. Counts that hit the indexer cap show an amber ⚠ with a "rerun deep index" tooltip.
- **Contact detail** (`/contacts/[username]`) — header + back link + archive button paint immediately; the analytics body (monthly bars, hourly grid, reply latency, style fingerprint, topic word cloud, vocab diff, top senders, shared content, recent 50 messages) streams in via `<Suspense>`. **Every sub-link carries `?chat=<username>`** so Calendar / Search / Links / message permalinks open scoped to this chat.
- **Links** (`/links`) — domain-group grid; per-group page has faceted view + CSV/JSON export + sender/chat filters. Honours `?chat=<username>` for chat-scoped link drill-downs.
- **Search** (`/search`) — FTS5 trigram tokeniser; 2-char CJK queries fall back to LIKE; multi-token AND-LIKE for queries where any token is short. HTML in snippets is escaped (no FTS5 `snippet()` raw passthrough). Reads `?chat=` to scope to one session and renders a "Filtered to chat" pill.
- **Calendar** (`/calendar`) — year heatmap; day-detail with hourly heatmap, TF-IDF keyword cloud, on-this-day, per-chat collapsible groups. Every panel cached. Honours `?chat=` to scope every panel to a single conversation.
- **Reading queue** (`/reading`) — long-form links (公众号 / 小红书 / 知乎 / Medium / Substack). **Deduped by URL** via a window-function CTE — the same article forwarded in N chats shows once with a "shared N×" badge. 100/page pagination. `mp.weixin.qq.com/mp/waerrpage` (WeChat's "content unavailable" placeholder) is filtered out. Persisted read state via a checkbox stored in the `read_urls` table.
- **Topics** (`/topics`, `/topics/[word]`) — longitudinal word tracker. `/topics` is a lookup form with suggestion chips from recent year-keywords; `/topics/<word>` plots monthly occurrence counts + top chats + top senders + first/recent samples. FTS5 for ≥ 3-char queries, LIKE for 2-char CJK.
- **Message permalink** (`/messages/[id]`) — single message with ±20 lines of surrounding context.
- **Recap** (`/recap/[year]` and `/recap/[year]/[chat_username]`) — Spotify-Wrapped-style year-in-review. Bespoke `/api/recap/[year]/export` ships a hand-crafted standalone HTML download.
- **Graph** (`/graph`) — force-directed relationship graph (groups + people + you) with min-group-size / min-co-occurrence / max-groups filters, show-names toggle, and include-archived toggle.
- **Stats drilldowns** (`/stats/sessions|messages|links|contacts`) — Recharts donuts, treemap, radial hour chart, stacked area, etc. Reached from the Overview StatCards. `/stats/messages` byMonth + byDow are now backed by `daily_counts` for a fast cold path.
- **Settings** (`/settings`) — language toggle, index status with SSE live progress (`/api/index/stream`), manual reindex, chat hygiene (stale + one-sided + size-based archive in bulk; default preset loaded server-side, other presets fetched from `/api/archive-candidates` on demand), me-handle detection / editing, member-count + group-membership backfill, persistent **Query cache** panel (rows / size / hits / current epochs / clear-all).
- **Debug** (`/debug`) — internal-only, not in the sidebar. Surfaces `EXPLAIN QUERY PLAN` for hot paths, per-table/index storage from `dbstat`, top cache keys by hits + size, current epochs, last index times.

## i18n + theme + HTML export

- **EN / 中文** toggle in the header (and a labelled control on Settings). Cookie-backed (`we-locale`), reload after toggling so all SSR re-renders against the new dictionary. Dictionary in `lib/i18n.ts`.
- **Light / dark / system** theme via the in-house `theme-provider.tsx` (replaces `next-themes`, which trips a Next 16 warning).
- **HTML export** per page: download icon in the header → `/api/export/page?path=<current>` fetches the page in-process, inlines CSS, strips scripts + sidebar + sticky header, returns a `.html` attachment. Charts re-render as pure inline SVG via `lib/server-charts.tsx` so the offline file isn't dependent on JavaScript. The bespoke `/api/recap/[year]/export` is left in place for the highest-fidelity year recap.

## Layout

```
app/
  layout.tsx                       root layout (Providers + LocaleProvider + ExportModeProvider + AppShell + theme init script)
  page.tsx                         Overview (links to /stats/<topic>; Surprises streamed via Suspense; period-delta on Indexed-messages card)
  me/page.tsx                      "You" dashboard — agg + split toggles, YoY card, 2×2 top-chats grid (sent/received × private/groups), Suspense-streamed "Did you know" panel
  contacts/                        list (Notion-style column-header filters) + [username]/detail (header up front, analytics body Suspense-streamed)
  messages/[id]/                   single message permalink with ±20 context lines
  links/                           index + [group]/drill-down (honours ?chat=<username>) + export buttons
  search/                          FTS5 + LIKE fallback; scope pill from ?chat=
  calendar/                        year heatmap + day-detail; ?chat= scopes every panel (all panels cached)
  reading/                         long-form link queue, deduped by URL with share-count badge + pagination
  settings/                        language panel + index (SSE) + reindex + hygiene (Suspense, lazy presets) + me-handles + members + cache panel
  graph/                           d3-force relationship graph
  topics/                          lookup form + /[word] longitudinal tracker (FTS5 / LIKE fallback)
  recap/[year]/                    year-in-review (+ [chat_username]/ per-chat variant)
  stats/                           sessions/messages/links/contacts Recharts drilldowns
  debug/                           hidden — EXPLAIN QUERY PLAN + dbstat + cache stats
  api/
    search/route.ts                GET ?q=...&archived=1&chat=<username|display>
    index/route.ts                 POST ?mode=quick|deep (one-shot, returns when done)
    index/stream/route.ts          POST ?mode=quick|deep (SSE — per-stage progress events)
    archive/route.ts               archive/restore session bulk-ops; bumps cache_epoch_archive
    archive-candidates/route.ts    GET ?stale=&type=&oneSided= — lazy preset loader for Settings hygiene panel
    me-handles/route.ts            GET/POST current me-handle list; on POST also refreshes daily_counts + bumps archive epoch
    member-counts/route.ts         POST ?limit= → fetches members for N more groups
    reading/route.ts               POST {urlId, read} → toggles /reading read state
    cache/route.ts                 GET cache stats; DELETE [?prefix=…] clears entries
    export/[kind]/route.ts         CSV/JSON dump for sessions/links/messages/contacts/domains
    export/page/route.ts           GET ?path=<route> → standalone .html download (inline CSS, no JS, server-SVG charts)
    recap/[year]/export/route.ts   bespoke recap HTML download

components/
  app-shell.tsx                    sidebar + header (export/language/theme toggles) + cmdk wrapper + keyboard shortcuts
  app-sidebar.tsx                  sticky-to-viewport sidebar; locale-aware nav labels
  command-palette.tsx              ⌘K (navigate + jump-to-search) + shortcut hint strip
  keyboard-shortcuts.tsx           j/k row nav, g-prefix (g m → /me, g t → /topics, g y → recap), / opens palette
  archived-filter-pill.tsx         shared "Include archived" pill + buildArchivedFilterHref() (locale-aware)
  archive-session-button.tsx       per-session archive/restore button (contact detail header)
  theme-provider.tsx               in-house ThemeProvider (replaces next-themes; Next 16 hated its <script>)
  theme-toggle.tsx
  i18n-provider.tsx                LocaleProvider + useLocale() — writes the `we-locale` cookie + reloads
  language-toggle.tsx              header dropdown (next to theme)
  export-html-button.tsx           header download icon — links to /api/export/page?path=<current>
  export-mode.tsx                  ExportModeProvider + useExportMode() — server-resolved from x-export-mode header
  providers.tsx                    Theme + React Query + Tooltip
  search-view.tsx                  client component for /search; accepts scopeUsername/Display from server page
  contacts/column-header.tsx       Notion-style table header (ColumnHeader + ColumnOption + ColumnSearchInput)
  charts/
    activity-chart.tsx             365-day area + 7-day rolling line (Recharts live; ServerLines on export)
    top-domains-bar.tsx, msg-type-list.tsx, year-heatmap.tsx
    sparkline.tsx                  pure-SVG inline sparkline
    hourly-grid.tsx, hourly-heatmap.tsx
    keyword-cloud.tsx, word-cloud.tsx (accepts chatUsername to scope word→search links)
    latency-histogram.tsx, monthly-activity-chart.tsx
    recap/                         monthly-bars, hourly-grid, latency-hist, keyword-cloud, horizontal-bars
    stats/
      charts.tsx                   barrel re-export for backward compat
      donut.tsx, bars.tsx, lines.tsx, radial.tsx, _shared.ts (per-kind splits)

lib/
  wx.ts                            typed wrappers around `wx` CLI
  db.ts                            better-sqlite3 + schema + additive migrations (urls.dedup_key, daily_counts, read_urls, query_cache, sessions.last_history_*; redundant idx_messages_chat_username + idx_urls_chat dropped)
  url-parser.ts                    URL extraction + domain grouping
  indexer.ts                       sessions/contacts/links/history indexers; 50k single-run cap with incremental --until backfill; ANALYZE + bumpIndexEpoch on completion
  cache.ts                         persistent epoch-invalidated query cache (getCachedJSON, bumpIndexEpoch/bumpArchiveEpoch, getCacheStats, clearAllCaches)
  queries.ts                       core read-side helpers; EXCLUDED_SUBQUERY + EXCLUDED_CHAT_CLAUSE + excludedChatClause() (NULL-safe); me-handle helpers that strip ""; searchMessages with parseSearchTokens + chatUsername scope; refreshDailyCounts; cached getHeatmap
  queries.calendar.ts              calendar day/year detail queries; all accept chatUsername; every read wrapped in getCachedJSON
  queries.contact.ts               contact analytics — getContactAnalytics wrapped in getCachedJSON("contact-analytics:<u>")
  queries.graph.ts                 graph data assembly + group/people/me node + co-occurrence edges
  recap.ts                         year-recap aggregation (cached) + YoY baseline + per-year keyword-baseline cache (recap-baseline-tf:y=…)
  recap-html.ts                    bespoke standalone recap HTML
  stats.ts                         per-topic /stats/ drilldown queries (all cached); /stats/messages byMonth+byDow now read from daily_counts
  me-stats.ts                      /me data layer — cached; agg + topN + topRange aware; sent + received top-chats
  me-fun.ts                        /me "Did you know" data — ~20 personality records; cache key parameter-free
  topics.ts                        /topics/<word> longitudinal — monthly counts + top chats/senders + first/recent samples
  surprises.ts                     overview anomaly cards (cached per-day key)
  text.ts                          Intl.Segmenter + CJK/EN stopwords + TF-IDF + emoji counting
  latency.ts                       reply-latency math — computeLatencies takes optional {partition, onReply}
  style.ts                         shared computeStyle + StyleFingerprint (used by /me + contact detail)
  server-charts.tsx                pure-SVG primitives — used by Recharts wrappers in export mode
  i18n.ts                          {en, zh} dictionary + t() resolver + LOCALE_COOKIE
  i18n-server.ts                   getServerLocale() async helper for RSC pages
  utils.ts                         shadcn cn() helper

tests/                             vitest tests (run with `npm test`)
  text.test.ts, latency.test.ts, url-parser.test.ts, search-tokens.test.ts   — pure-function
  integration/{setup,queries,search,cache}.test.ts                            — integration vs tmpdir SQLite

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
- HTML export reproduces every page including their charts as inline SVG (pages whose charts use Recharts swap to `lib/server-charts.tsx` primitives during the export render). The `/graph` page uses a live d3-force simulation that can't be statically rendered — its export shows the empty SVG shell only. The bespoke `/api/recap/[year]/export` is the highest-fidelity offline report.
- i18n covers the high-traffic UI surface (sidebar, page titles, top-level controls, hero stats, common buttons). Long-form copy on smaller panels is still EN-only; adding `t()` calls is incremental work — new strings go in `lib/i18n.ts` with both `en` and `zh` columns.
- AI features (style learning, draft replies, topic clustering) are intentionally left out
  for the first cut to keep the app token-free. They're the natural Tier 4 follow-up.

## Data location

| Path | Purpose | Owned by |
|---|---|---|
| `~/.wx-cli/` | WeChat DB keys + cache | wx-cli |
| `~/.wechat-explorer/index.db` | Derived index for this app | this app |
| `/Applications/WeChat.app` | The official client (ad-hoc resigned for the initial setup) | Tencent |

Nuke the explorer's index any time with `rm -rf ~/.wechat-explorer/` — it'll rebuild from `wx-cli` on next index.
