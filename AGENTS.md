<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project-specific notes (read before writing code)

This is a local-only Next.js 16 app that turns the user's decrypted WeChat history into an explorer. Everything stays on the machine — no LLM, no API features, no network calls except the `wx` CLI to read the local DB. Dev URL is `http://localhost:3719` and the dev server is usually already running.

## Critical pitfalls (relearned the hard way)

- **`bun --bun next dev` leaks postcss workers** (saw 2,000+ orphans once). Use plain `next dev` for the web tier. Indexer scripts run with `tsx`, never `bun run` — better-sqlite3's native binding isn't compatible with Bun (`oven-sh/bun#4290`).
- **shadcn primitives use `@base-ui/react`, not Radix**. `asChild` doesn't propagate; the prop leaks to the DOM. Put children directly inside triggers.
- **Next 16 dynamic route `params` are `Promise<…>`** — must `await`.
- **Tailwind v4** — no `tailwind.config.js`. Theme tokens live in `app/globals.css` under `@theme inline`.
- **next-themes' `<script>` injection triggered a Next 16 warning**. Replaced with an in-house `components/theme-provider.tsx` plus a `next/script` `beforeInteractive` tag in `app/layout.tsx`. Don't reintroduce `next-themes`.
- **Grammarly causes a hydration mismatch on `<body>`** — already suppressed via `suppressHydrationWarning`. Don't touch.
- **DB has real user data** — migrations must be additive only (`ALTER TABLE ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`, `CREATE VIEW`). Never `DROP COLUMN`.
- **Backticks inside SQL comments break JS template literals.** When writing SQL inside `db.exec(\`…\`)` or `db.prepare(\`…\`)`, never use backticks inside `-- comments` (e.g. ``-- `column_name` is …``). The first backtick closes the template literal early and turbopack reports a useless "Expected ','" error on a different line.
- **wx CLI's sender semantics in 1:1 chats**: outgoing messages have `sender = <your wechat handle>` (e.g. `YXJ`); incoming messages have `sender = ""`. NEVER add the empty string to `me_handles` — `detectMeHandles` / `getMeHandles` / `setMeHandles` defensively strip it, and an old DB might still have it stored. Treating "" as me classifies the OTHER person's messages as yours and roughly doubles "your share" in every panel.
- **Indexer single-run cap is 50k messages per chat** (`HISTORY_PAGES_PER_CHAT × HISTORY_BATCH_LIMIT = 50 × 1000`). Heavy chats need multiple `Deep index` passes — each subsequent run passes `--until <day before first_msg_timestamp>` to extend backward. Chats that hit the cap are marked with `sessions.last_history_error = "hit 50,000-msg cap, rerun deep index…"`; the contacts table renders that as an amber ⚠ next to the count. The marker self-clears when the next pass returns no more older history.
- **If the dev server stops responding**, run:
  ```
  pkill -9 -f "postcss.js"; pkill -9 -f "next dev"; npm run dev
  ```
  Plain `pkill -f "next dev"` is sometimes too gentle to take down a stuck turbopack process — use `-9`.

## SQL / data conventions

- The shared store is at `~/.wechat-explorer/index.db` (better-sqlite3, WAL).
- **Stats / search / link queries exclude archived sessions and `chat_type IN ('official','folded')` by default.** Two helpers:
  - `EXCLUDED_SUBQUERY` / `excludedSubquery({ includeArchived })` — raw `(SELECT username FROM sessions WHERE …)` subquery for `IN (…)` / `NOT IN (…)` / `EXISTS (…)` joins where the filtered column is known non-NULL.
  - `EXCLUDED_CHAT_CLAUSE` / `excludedChatClause({ alias, includeArchived })` — full predicate `(chat_username IS NULL OR chat_username NOT IN (…))`. **Prefer this when filtering `messages.chat_username` / `urls.chat_username`** — SQL `NULL NOT IN (…)` is `NULL` (i.e. row dropped), and ~18 messages have NULL `chat_username` that would otherwise vanish from every total.
- **Links: read via the `urls_dedup` view.** Originally the view collapsed duplicates produced by two indexer paths. We've since added a real `urls.dedup_key` column with a `UNIQUE` index, so the view is now a trivial `SELECT * FROM urls` kept for call-site compatibility. The `dedup_key` is `url || \\x1f || timestamp || \\x1f || sender || \\x1f || COALESCE(chat_username, chat_display)` and is enforced at INSERT time — duplicate rows can no longer accumulate.
- **`daily_counts` materialized table** (per-day `n`, `mine`, `n_with_archived`, `mine_with_archived`) powers Overview / Calendar heatmap / Surprises / `/me` totals / `/stats/messages` byMonth+byDow without scanning the 1M-row `messages` table. Refreshed via `refreshDailyCounts()` at the end of every indexing run AND when me-handles change (because `mine` depends on them). When in doubt, prefer this rollup over a re-scan; it's where every "spread across all messages" query should land.
- **Parameterise SQL.** Use `?` placeholders, never string-interpolate user input. The only allowed inline interpolation is `${EXCLUDED_SUBQUERY}` / `${scope.excl}` / `${aggPattern[agg]}` and similar constant fragments built in code.
- **Identify the user** with `getMeHandles()` (reads `meta.me_handles`, JSON array). Don't roll your own detection. See the wx CLI sender pitfall above re: `""`.
- **FTS5 trigram min length is 3.** For shorter queries (very common for 2-char CJK like 庆祝 / 生日), `searchMessages` falls back to LIKE — don't break that path when refactoring. Multi-token queries with ANY short token use AND-LIKE; otherwise it wraps each token as a quoted FTS phrase (so operators like `:`, `-`, `*`, `NEAR` inside user input never trigger FTS syntax errors).
- **Snippet HTML is built in JS, not via `snippet(messages_fts, …)`.** The FTS5 function emits raw column content between `<mark>` tags; forwarded WeChat messages can contain literal HTML / `<script>`. `buildSnippet()` in `lib/queries.ts` escapes everything except the `<mark>` it inserts itself.
- **Don't repeatedly full-scan `messages`** (~1M rows on a typical corpus — exact size varies; see `SELECT COUNT(*) FROM messages`). Useful indexes: `idx_messages_chat (chat_username, timestamp DESC)`, `idx_messages_chat_display`, `idx_messages_ts`, `idx_messages_sender`, `idx_messages_type`. Include a `timestamp >= ? AND timestamp < ?` range whenever possible. The redundant `idx_messages_chat_username` partial index was dropped in favor of the wider `idx_messages_chat` — same for `idx_urls_chat` (display) which lost to the partial `idx_urls_chat_username`.

## Persistent query cache (epoch-invalidated)

Heavy aggregates (recap / me-stats / year keywords / `/stats/*` / overview / surprises) are wrapped with `getCachedJSON(key, factory)` from `lib/cache.ts`. Stored in the `query_cache` SQLite table; each row stamps the `cache_epoch_index` and `cache_epoch_archive` it was computed under. A read serves the cached value when both epochs match; otherwise the factory runs and the row is upserted.

- **Index epoch** — bumped by `bumpIndexEpoch()` at the end of every `runQuickIndex` / `runDeepIndex`. Any cached aggregate that touched `messages` / `urls` is now stale.
- **Archive epoch** — bumped by `bumpArchiveEpoch()` from `/api/archive` and `/api/me-handles`. Any cached aggregate respecting the exclusion clause OR me-handles is now stale.
- **No TTL.** Past-year recaps stay cached forever until one of the epochs bumps.
- An in-process LRU (64 entries) sits in front of SQLite to skip the JSON parse on hot repeats.
- Stats + clear-all UI lives on the Settings page (`CachePanel`); the API is `GET /api/cache` and `DELETE /api/cache[?prefix=…]`.

## UX patterns to keep consistent

- Pages are server components with `export const dynamic = "force-dynamic";` unless there's a reason otherwise.
- The **left sidebar is sticky** (`sticky top-0 h-screen self-start overflow-y-auto`). Settings sits in the footer and must stay reachable from any scroll position. If you flatten that or stretch the aside via the flex parent, sticky breaks — keep `self-start` on the aside.
- Per-page "Include archived" pill uses `components/archived-filter-pill.tsx` (exports `ArchivedFilterPill` + `buildArchivedFilterHref`) with `?archived=1` searchParam. Pass `locale` so the label localises.
- Per-session archive/restore action button (used on contact detail) is `components/archive-session-button.tsx` (exports `ArchiveSessionButton`). Different from the filter pill above — name was deliberately disambiguated.
- **HTML export**: every page has a Download button in the header (`components/export-html-button.tsx`). It links to `/api/export/page?path=<current>` which fetches the page server-side, inlines CSS, strips scripts + sidebar + header, and returns a standalone `.html`. CSV / JSON exports of structured data still go through `/api/export/[kind]`. The bespoke recap renderer at `/api/recap/[year]/export` is left in place for highest-fidelity year-in-review exports.
- **Chat-scope propagation**: any page entered via a contact detail link carries `?chat=<username>` and renders a "Filtered to chat: X · clear ✕" pill. Pages that honour the scope: `/calendar`, `/search`, `/links/[group]`, `/messages/[id]`. Outbound links from `/contacts/[username]` (sender / vocab / keyword cloud / domain / calendar / message timestamp) all set `?chat=` automatically. Honour this pattern when adding new sub-links so the user can drill down without losing context.
- Cross-link from everywhere: every chat → `/contacts/[username]`, every sender → `/search?q=<sender>` (or `/links/<group>?sender=…` in the link context), every timestamp → `/messages/<id>` (preferred) or `/calendar?year=&day=`, every keyword token → `/search?q=` (or `/topics/<word>` for the longitudinal view).
- Keyboard shortcuts: `g h/m/c/l/k/r/s/g/t/y` to navigate (m = `/me`, t = `/topics`, y = current-year recap), `j/k` between rows, `/` opens the palette (same as `⌘K`). Mark navigable rows with `data-jk-row` if the default selector (table rows, `<a>` inside main) misses them.
- Light theme default. New HTML / report outputs should be light-theme-first.
- Notion-style column headers in the contacts table — see `components/contacts/column-header.tsx`. Sort indicator + filter dot inline with the label, popover holds sort options + per-column filters. The popover content is composed of `ColumnOption` / `ColumnSection` / `ColumnDivider` / `ColumnSearchInput` (search uses a native form GET so server-only `searchParams` don't need a function prop).

## i18n (EN / 中文)

- Dictionary in `lib/i18n.ts` — flat `{ key: { en, zh } }`. `t(key, locale)` resolver; missing translations fall back to English.
- Locale persisted via a `we-locale` cookie. Server components read it via `await getServerLocale()` (`lib/i18n-server.ts`); client components consume via `useLocale()` from `components/i18n-provider.tsx`. The provider is wired into `app/layout.tsx` so first SSR already uses the right dictionary — no flash.
- Header `LanguageToggle` (`components/language-toggle.tsx`) sits next to the theme toggle. Settings has its own `LanguagePanel` as a labelled segmented control. Both write the cookie and force a reload so every server-rendered page swaps its dictionary.
- `<html lang>` follows the locale (`zh-Hans` vs `en`) so screen readers and CJK fonts pick the right path.
- New strings go in the dictionary by key. Translate the high-traffic surfaces (nav, page titles, primary actions, hero stats); chat content is user data and stays untranslated.

## Server-side rendering for the HTML export

- Recharts gates its SVG behind a client-side `useEffect`, so the live `ResponsiveContainer` ships an empty wrapper during SSR. The HTML exporter sees that empty wrapper and the export would otherwise have blank chart slots.
- Fix: in export mode, swap Recharts for pure-SVG primitives in `lib/server-charts.tsx` (`ServerBars` / `ServerLines` / `ServerPie` / `ServerHorizontalBars` / `ServerHourStrip`).
- The `ExportMode` context (`components/export-mode.tsx`) is set in `app/layout.tsx` from the `x-export-mode: 1` header, which `/api/export/page` sets when it fetches the page. Each chart wrapper in `components/charts/**` reads `useExportMode()` and branches.

## Streaming + Suspense

- Heavy `<Suspense>`-able panels (e.g. `/me` "Did you know", `/contacts/<u>` analytics body) live inside async server components.
- **The wrinkle**: better-sqlite3 is synchronous. An `async` server component that immediately calls a sync DB function doesn't yield, so React renders the entire tree before flushing — TTFB == total. Add a single `await new Promise((r) => setImmediate(r));` before the sync call so React can flush the parent + the Suspense fallback first.
- `/contacts/<u>` example: cold TTFB dropped 7.4s → 0.34s after the yield. The header + back link + archive button paint immediately; the body streams in once the analytics compute resolves.

## Performance budget

- Every page < 2s on warm load (mostly < 500ms thanks to `query_cache`).
- Cold-load targets (post-`DELETE /api/cache`, on a corpus of ~1M messages):
  - `/` (Overview): ~1s — `getOverview` + `getSurprises` (Suspense-streamed) + `getRecapYears`. The "Indexed messages" stat card shows a 30d vs prior-30d delta from `daily_counts`.
  - `/me`: header + hero + activity charts paint in ~250ms TTFB; the fun-facts "Did you know" panel and (where applicable) the contact body stream in later via Suspense. `getMeStats({ agg, topN, topRange })` reads totals + YoY from `daily_counts`; `getMeFunFacts()` lives in its own cache (`me-fun-facts`) so it's reused across every (agg, topN, topRange) variant.
  - `/contacts/<username>`: ~340ms TTFB (header + back link + archive button); body streams in via `<Suspense>` after `getContactAnalytics(username)` resolves (~3–5s cold, ~150ms warm via `getCachedJSON`).
  - `/recap/<year>`: ~3–8s the very first time per year; second visit ~150ms via `query_cache`. The keyword-baseline TF map is independently cached under `recap-baseline-tf:y=…` so two chat-scoped recaps on the same year share it.
  - `/calendar`: ~1s — every panel (heatmap, day detail, year keywords, on-this-day) is wrapped in `getCachedJSON`.
  - `/stats/<topic>`: ~1–3s, all cached. `/stats/messages` drives byMonth/byDow off `daily_counts`; only byHour still scans (covering index).
  - `/settings`: hero card + index status stream first; the chat-hygiene panel is wrapped in `<Suspense>` and loads only the default preset server-side. Other presets fetch from `/api/archive-candidates` on demand.
  - `/topics/<word>`: ~1.5s cold (FTS5 path) / ~0.1s warm. Cache key `topic:<word>`.
- Bulk operations chunk and stream — never block a render on a 1M-row scan.
- Pre-aggregate into `sessions` columns where reasonable (`message_count`, `my_msg_count`, `distinct_senders`, `member_count`, `first_msg_timestamp`, `history_indexed_through`, `last_history_attempt_at`, `last_history_error`).
- When you add a new heavy aggregate, wrap it in `getCachedJSON("…", () => compute())` so the second visit is free. Re-measure cold + warm via `curl -o /dev/null -w "%{time_starttransfer}\n"` after a `DELETE /api/cache`. If the panel can take > 1s and is below the fold, also wrap it in `<Suspense>` and remember the `setImmediate` yield trick (see Streaming section).

## Commit hygiene

- Conventional commits with descriptive bodies (`feat(stats): …`, `fix(links): …`, `perf(recap): …`).
- No `Co-Authored-By` lines and no AI markers in source files.
- Don't push to GitHub unless the user asks.

## Files worth knowing

### Data layer
- `lib/queries.ts` — `EXCLUDED_SUBQUERY` / `EXCLUDED_CHAT_CLAUSE` / `excludedChatClause()`, `getMeHandles` / `setMeHandles` / `detectMeHandles` (all filter `""`), `getOverview`, `listSessions` (extended sort `name`/`name-desc`/`messages`/`messages-asc`/`urls`/`urls-asc`/`recent`/`recent-asc`), `searchMessages` (FTS+LIKE fallback, `chatUsername` scope, `parseSearchTokens` exported), `getLinksInGroup` / `getLinkGroupFacets` (with `chatUsername`), archive ops, member-count helpers, `refreshDailyCounts` / `ensureDailyCountsFresh`.
- `lib/db.ts` — schema + additive migrations. Tables: `sessions`, `contacts`, `messages` (+ `messages_fts` FTS5), `urls` (+ `dedup_key` column + unique index; `urls_dedup` view kept as trivial alias), `meta`, `group_members`, `daily_counts`, `read_urls`, `query_cache`.
- `lib/cache.ts` — `getCachedJSON`, `bumpIndexEpoch` / `bumpArchiveEpoch`, `getCacheEpochs`, `getCacheStats`, `clearAllCaches` / `clearCacheByPrefix`. In-process LRU in front of the persistent SQLite layer.
- `lib/indexer.ts` — `runQuickIndex` / `runDeepIndex` / `indexHistoryForSession`. The latter does incremental backward backfill via `--until <day-1>` when `first_msg_timestamp` exists. End-of-run: `refreshDailyCounts` + `ANALYZE` + `invalidateAllCaches` (bumps `cache_epoch_index`).
- `lib/wx.ts` — typed wrappers around the `wx` CLI.
- `lib/recap.ts` — `getYearRecap` / `getYearBaseline` (both wrapped in `getCachedJSON`), `getRecapYears`.
- `lib/stats.ts` — per-topic drilldown reads (all wrapped in cache).
- `lib/me-stats.ts` — `getMeStats({ agg, topN, topRange })` for `/me`. Multi-line top-N series for sent + received, YoY strip from `daily_counts`, voice fingerprint, latency, msg-type breakdown, etc. `MeTopMode = "sent" | "received"` + `MeTopRange = "all" | "1y" | "6m" | "3m"` drive a 2×2 top-chats grid.
- `lib/me-fun.ts` — `/me`'s "Did you know" panel. ~20 personality records (busiest day overall + your busiest send-day + most lopsided 1:1 + most-balanced + oldest contact + longest reunion gap + …). Independent cache key `me-fun-facts` so it's reused across every (agg, topN, topRange) combination on /me.
- `lib/topics.ts` — `/topics/<word>` longitudinal word tracker. Monthly bucket counts + top chats + top senders + first/recent samples. FTS5 path for ≥ 3-char queries, LIKE fallback for 2-char CJK. Cache key `topic:<word>`.
- `lib/queries.calendar.ts` — day/year detail queries. All accept `chatUsername` for chat-scoped calendar. `getHeatmap`, `getDayHourly`, `getDayKeywords`, `getDayMessagesGrouped`, `getOnThisDay`, `getYearKeywords` all wrapped in `getCachedJSON`.
- `lib/queries.contact.ts` — contact analytics. `pickMeHandles` no longer treats `""` as me fallback (was incorrect — see pitfall). `getContactAnalytics` is wrapped in `getCachedJSON("contact-analytics:<username>")`.
- `lib/style.ts` — shared `computeStyle` + `StyleFingerprint`. Both `/me` and the contact-detail page consume from here; the previous duplicated implementations are gone.
- `lib/queries.graph.ts` — relationship graph assembly.
- `lib/surprises.ts` — overview anomaly cards (cached per-day).
- `lib/text.ts` / `lib/latency.ts` — TF-IDF + reply-latency math. `computeLatencies` takes an optional `{ partition, onReply }` so `/me` and `/recap` can stream-bucket per-month from a single chat-partitioned walk.
- `lib/recap-html.ts` — bespoke standalone HTML render for the year recap (kept around even though the generic `/api/export/page` covers every other page).
- `lib/server-charts.tsx` — pure-SVG `ServerBars` / `ServerLines` / `ServerPie` / `ServerHorizontalBars` / `ServerHourStrip`. Used in export mode where Recharts ships an empty wrapper.
- `lib/i18n.ts` — `{ en, zh }` dictionary + `t(key, locale)` resolver. `LOCALE_COOKIE = "we-locale"`.
- `lib/i18n-server.ts` — `getServerLocale()` async helper for RSC pages.

### UI
- `components/charts/stats/charts.tsx` — barrel re-export for backward compat. The eight Recharts wrappers (`Donut`, `VerticalBars`, `StackedArea`, `TwoSeriesLine`, `LineWithBars`, `HourRadial`, `DomainTreemap`, `MultiLine`) now live in per-kind files: `donut.tsx`, `bars.tsx`, `lines.tsx`, `radial.tsx` (+ shared `_shared.ts` for palette / tooltip style). Each branches on `useExportMode()` and renders the matching `lib/server-charts.tsx` primitive in export mode.
- `components/charts/word-cloud.tsx` — accepts `chatUsername` to scope word→`/search` links.
- `components/archived-filter-pill.tsx` — shared `ArchivedFilterPill` + `buildArchivedFilterHref()` URL helper. Accepts optional `locale`.
- `components/archive-session-button.tsx` — `ArchiveSessionButton`, the action button.
- `components/contacts/column-header.tsx` — Notion-style table column header (`ColumnHeader`, `ColumnOption`, `ColumnDivider`, `ColumnSection`, `ColumnSearchInput`).
- `components/search-view.tsx` — `/search` client component. Accepts `scopeUsername` / `scopeDisplay` (resolved server-side in `app/search/page.tsx`), renders pill, propagates scope to result-row sender links.
- `components/keyboard-shortcuts.tsx` — global hotkeys.
- `components/i18n-provider.tsx` — `LocaleProvider` + `useLocale()` hook. Writes the cookie on toggle + forces a reload so SSR re-renders with the new dictionary.
- `components/language-toggle.tsx` — header dropdown (next to theme toggle).
- `components/export-html-button.tsx` — header download icon, links to `/api/export/page?path=<current>` with the current search params preserved.
- `components/export-mode.tsx` — React context (`ExportModeProvider` + `useExportMode()`). Resolved server-side in `app/layout.tsx` from the `x-export-mode: 1` header.
- `components/app-sidebar.tsx` — sticky sidebar (see UX section).

### Pages
- `app/me/page.tsx` — personal stats dashboard. Toolbar dimensions are independent and URL-driven: `agg=week|month|year`, `split=1` (split "them" by chat type), `topN=3|5|10`, `topRange=all|1y|6m|3m`. Renders a 2×2 grid of top-chats panels (sent / received × private / groups), YoY strip, voice fingerprint, latency, and the suspended "Did you know" fun-facts grid.
- `app/messages/[id]/page.tsx` — single-message permalink with ±20 context messages. Linked from search results.
- `app/reading/page.tsx` + `app/reading/reading-list.tsx` — long-form link queue, **deduped by URL** via a `ROW_NUMBER() OVER (PARTITION BY url ORDER BY ts DESC, id DESC)` CTE so the same article forwarded in N chats shows up once. `share_count` badge surfaces the repeat count. 100/page, `?page=` navigation. `mp.weixin.qq.com/mp/waerrpage` (WeChat's "content unavailable" placeholder) is filtered out.
- `app/topics/page.tsx` + `app/topics/[word]/page.tsx` — `/topics` is a lookup landing with suggestion chips from recent year-keywords; `/topics/<word>` is the longitudinal view (monthly bucket counts + top chats + top senders + first/recent samples).
- `app/debug/page.tsx` — internal-only, not in the sidebar. Surfaces `EXPLAIN QUERY PLAN` for hot paths, per-table/index sizes via `dbstat`, top cache keys, current epochs, last quick/deep index times. Reach via `/debug`.
- `app/settings/page.tsx` + sub-components: `cache-panel.tsx`, `reindex-buttons.tsx` (SSE progress), `hygiene-panel.tsx`, `language-panel.tsx`.
- `app/api/index/stream/route.ts` — SSE-streaming indexer endpoint (`POST ?mode=quick|deep`); preferred over the original `/api/index` for the Settings UI because the user sees live stage progress.
- `app/api/reading/route.ts` — POST `{urlId, read}`.
- `app/api/cache/route.ts` — GET stats, DELETE `?prefix=` clear.
- `app/api/archive-candidates/route.ts` — GET `?stale=&type=&oneSided=` lazy archive-candidate fetch. Used by the Settings hygiene panel.
- `app/api/export/page/route.ts` — GET `?path=<route>` fetches the page in-process, inlines linked stylesheets, strips `<script>` + sidebar + sticky header, sets `Content-Disposition: attachment`. Forwards the `we-locale` cookie so the export matches the user's UI language, sets `x-export-mode: 1` so the chart wrappers swap to the server-SVG primitives.

### Tests
- `vitest.config.ts` at root. Run `npm test`.
- `tests/text.test.ts`, `tests/latency.test.ts`, `tests/url-parser.test.ts`, `tests/search-tokens.test.ts` — pure-function tests, no DB.
- `tests/integration/{setup,queries,search,cache}.test.ts` — integration tier against a fresh better-sqlite3 DB at a tmpdir (`setupTestDb()` in `setup.ts` sets `WE_DATA_DIR` before importing `lib/db`). Covers `getOverview` shape + counts, `EXCLUDED_CHAT_CLAUSE` NULL handling, me-handle stripping, FTS+LIKE search, HTML-escape in snippets, `getCachedJSON` memoisation + epoch invalidation + prefix clear.

## Workflow notes

- The user prefers Chinese for clarification questions and short status updates if mid-conversation; English for commit messages and source code.
- Verify UI changes by hitting the dev server with curl (warm-load timing) and visually via Playwright / Chrome MCP — don't accept "returns 200" as proof the page renders. A 500 page also returns full HTML with `<html id="__next_error__">`.
- When schema or interface shape changes, clear the persistent cache afterwards (`DELETE /api/cache` or the Settings button) — cached JSON values from before the change won't have new fields and will crash at the page level. Indexer / archive / me-handles routes already bump epochs automatically; manual changes need a manual clear.
- Dev-server cache trick: when iterating on `lib/cache.ts` consumers, touching `lib/cache.ts` itself (e.g. append a stray comment line you'll later strip) is the only reliable way to flush the in-process LRU between requests. The persistent SQLite cache resets cleanly via `DELETE /api/cache`.
- Working notes (`task_plan.md`, `findings.md`, `progress.md`) are gitignored. Re-create them if you want to track a multi-step task.

## Adding a new module (cookbook)

1. **Data layer** — drop a new function in the relevant `lib/queries.*.ts` (or its own module if the query mix is heterogeneous). Always parameterise SQL; use `EXCLUDED_CHAT_CLAUSE` for `messages.chat_username` / `urls.chat_username` filters, `EXCLUDED_SUBQUERY` only inside `IN (...)` against known non-NULL columns.
2. **Cache** — wrap the producer in `getCachedJSON("module-key:param1=…:param2=…", () => compute())`. Keep the key compact + deterministic. If the result doesn't depend on archived state, pass `{ ignoreArchive: true }` so archive flips don't invalidate it needlessly.
3. **Page** — server component (`export const dynamic = "force-dynamic"`). Call `await getServerLocale()` if you need locale-aware copy; pass it down to child server components as a prop or thread it via `t(key, locale)`.
4. **Suspense the slow bits** — if the module can take > ~1s and isn't first-paint critical, split it into an async sub-component wrapped in `<Suspense fallback={<Skeleton/>}>`. Inside the sub-component, `await new Promise((r) => setImmediate(r))` BEFORE the sync DB call so React flushes the parent + fallback before this blocks the render thread.
5. **Charts** — server-rendered SVG components (year-heatmap, hourly-grid in `components/charts/recap/`) work everywhere. Recharts panels work live but need the `useExportMode()` branch + a `ServerXxx` fallback so the HTML export isn't blank.
6. **Client interactivity** — `"use client"` only for the bits that need it. Server pages can pass primitives / arrays / objects to clients — **NOT functions** (Next 16 throws "Functions cannot be passed directly to Client Components").
7. **Cross-link** — every chat → `/contacts/[username]`, every sender → `/search?q=…` (or `/topics/<word>` for the longitudinal view), every timestamp → `/messages/<id>`, every keyword → `/topics/<word>` or `/search?q=`. Propagate `?chat=<username>` on every outbound link from a chat-scoped page.
8. **Sidebar + cmdk + hotkey** — add the route to `components/app-sidebar.tsx`, the cmdk palette in `command-palette.tsx`, and the `g`-prefix switch in `keyboard-shortcuts.tsx`.
9. **i18n** — add new strings to `lib/i18n.ts` (both `en` + `zh`). Use `t(key, locale)` server-side, `useLocale()` client-side. Don't translate chat content (user data).
10. **Export** — your new page is automatically exportable via the header Download button + `/api/export/page`. If you add Recharts charts, make sure each wrapper has the `useExportMode()` branch.
