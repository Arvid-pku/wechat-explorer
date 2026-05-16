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
- Per-page "Include archived" pill uses `components/archived-filter-pill.tsx` (exports `ArchivedFilterPill` + `buildArchivedFilterHref`) with `?archived=1` searchParam.
- Per-session archive/restore action button (used on contact detail) is `components/archive-session-button.tsx` (exports `ArchiveSessionButton`). Different from the filter pill above — name was deliberately disambiguated.
- CSV / JSON exports go through `/api/export/[kind]`.
- **Chat-scope propagation**: any page entered via a contact detail link carries `?chat=<username>` and renders a "Filtered to chat: X · clear ✕" pill. Pages that honour the scope: `/calendar`, `/search`, `/links/[group]`, `/messages/[id]`. Outbound links from `/contacts/[username]` (sender / vocab / keyword cloud / domain / calendar / message timestamp) all set `?chat=` automatically. Honour this pattern when adding new sub-links so the user can drill down without losing context.
- Cross-link from everywhere: every chat → `/contacts/[username]`, every sender → `/search?q=<sender>` (or `/links/<group>?sender=…` in the link context), every timestamp → `/messages/<id>` (preferred) or `/calendar?year=&day=`, every keyword token → `/search?q=`.
- Keyboard shortcuts: `g h/m/c/l/k/r/s/g/y` to navigate (m = `/me`), `j/k` between rows, `/` opens the palette (same as `⌘K`). Mark navigable rows with `data-jk-row` if the default selector (table rows, `<a>` inside main) misses them.
- Light theme default. New HTML / report outputs should be light-theme-first.
- Notion-style column headers in the contacts table — see `components/contacts/column-header.tsx`. Sort indicator + filter dot inline with the label, popover holds sort options + per-column filters. The popover content is composed of `ColumnOption` / `ColumnSection` / `ColumnDivider` / `ColumnSearchInput` (search uses a native form GET so server-only `searchParams` don't need a function prop).

## Performance budget

- Every page < 2s on warm load (mostly < 500ms thanks to `query_cache`).
- Cold-load targets (post-`DELETE /api/cache`, on a corpus of ~1M messages):
  - `/` (Overview): ~1s — `getOverview` + `getSurprises` (Suspense-streamed) + `getRecapYears`
  - `/me`: ~1–2s — `getMeStats({agg})` reads totals + YoY from `daily_counts`
  - `/contacts/<username>`: ~3–5s first visit / ~150ms warm via `getCachedJSON`
  - `/recap/<year>`: ~3–8s the very first time per year; second visit ~150ms via `query_cache`. The keyword-baseline TF map is independently cached under `recap-baseline-tf:y=…` so two chat-scoped recaps on the same year share it.
  - `/calendar`: ~1s — every panel (heatmap, day detail, year keywords, on-this-day) is wrapped in `getCachedJSON`
  - `/stats/<topic>`: ~1–3s, all cached. `/stats/messages` drives byMonth/byDow off `daily_counts`; only byHour still scans (covering index).
  - `/settings`: hero card + index status stream first; the chat-hygiene panel is wrapped in `<Suspense>` and loads only the default preset server-side. Other presets fetch from `/api/archive-candidates` on demand.
- Bulk operations chunk and stream — never block a render on a 1M-row scan.
- Pre-aggregate into `sessions` columns where reasonable (`message_count`, `my_msg_count`, `distinct_senders`, `member_count`, `first_msg_timestamp`, `history_indexed_through`, `last_history_attempt_at`, `last_history_error`).
- When you add a new heavy aggregate, wrap it in `getCachedJSON("…", () => compute())` so the second visit is free. Re-measure cold + warm via `curl -o /dev/null -w "%{time_starttransfer}\n"` after a `DELETE /api/cache`.

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
- `lib/me-stats.ts` — `getMeStats({ agg })` for `/me`. Multi-line top-5 series, voice fingerprint, latency, etc.
- `lib/queries.calendar.ts` — day/year detail queries. All accept `chatUsername` for chat-scoped calendar.
- `lib/queries.contact.ts` — contact analytics. `pickMeHandles` no longer treats `""` as me fallback (was incorrect — see pitfall). `getContactAnalytics` is wrapped in `getCachedJSON("contact-analytics:<username>")`.
- `lib/style.ts` — shared `computeStyle` + `StyleFingerprint`. Both `/me` and the contact-detail page consume from here; the previous duplicated implementations are gone.
- `lib/queries.graph.ts` — relationship graph assembly.
- `lib/surprises.ts` — overview anomaly cards (cached per-day).
- `lib/text.ts` / `lib/latency.ts` — TF-IDF + reply-latency math.
- `lib/recap-html.ts` — standalone HTML export.

### UI
- `components/charts/stats/charts.tsx` — Recharts kit: `Donut`, `VerticalBars`, `StackedArea`, `TwoSeriesLine`, `LineWithBars`, `HourRadial`, `DomainTreemap`, `MultiLine`.
- `components/charts/word-cloud.tsx` — accepts `chatUsername` to scope word→`/search` links.
- `components/archived-filter-pill.tsx` — shared `ArchivedFilterPill` + `buildArchivedFilterHref()` URL helper. (Was `archived-toggle.tsx` pre-rename.)
- `components/archive-session-button.tsx` — `ArchiveSessionButton`, the action button. (Was `archive-toggle.tsx`.)
- `components/contacts/column-header.tsx` — Notion-style table column header (`ColumnHeader`, `ColumnOption`, `ColumnDivider`, `ColumnSection`, `ColumnSearchInput`).
- `components/search-view.tsx` — `/search` client component. Accepts `scopeUsername` / `scopeDisplay` (resolved server-side in `app/search/page.tsx`), renders pill, propagates scope to result-row sender links.
- `components/keyboard-shortcuts.tsx` — global hotkeys.

### Pages
- `app/me/page.tsx` — personal stats dashboard (line chart with week/month/year switcher, top-5 multi-line for private/groups, voice fingerprint, etc.).
- `app/messages/[id]/page.tsx` — single-message permalink with ±20 context messages. Linked from search results.
- `app/reading/page.tsx` + `app/reading/reading-list.tsx` — long-form link queue with persisted read state (checkbox).
- `app/settings/page.tsx` + `app/settings/cache-panel.tsx` + `app/settings/reindex-buttons.tsx` (SSE progress) + `app/settings/hygiene-panel.tsx`.
- `app/api/index/stream/route.ts` — SSE-streaming indexer endpoint (`POST ?mode=quick|deep`); preferred over the original `/api/index` for the Settings UI because the user sees live stage progress.
- `app/api/reading/route.ts` — POST `{urlId, read}`.
- `app/api/cache/route.ts` — GET stats, DELETE `?prefix=` clear.

### Tests
- `vitest.config.ts` at root. Run `npm test`.
- `tests/text.test.ts`, `tests/latency.test.ts`, `tests/url-parser.test.ts`, `tests/search-tokens.test.ts` — pure-function tests, no DB.

## Workflow notes

- The user prefers Chinese for clarification questions and short status updates if mid-conversation; English for commit messages and source code.
- Verify UI changes by hitting the dev server with curl (warm-load timing) and visually via Playwright / Chrome MCP — don't accept "returns 200" as proof the page renders. A 500 page also returns full HTML with `<html id="__next_error__">`.
- When schema or interface shape changes, clear the persistent cache afterwards (`DELETE /api/cache` or the Settings button) — cached JSON values from before the change won't have new fields and will crash at the page level. Indexer / archive / me-handles routes already bump epochs automatically; manual changes need a manual clear.
- Working notes (`task_plan.md`, `findings.md`, `progress.md`) are gitignored. Re-create them if you want to track a multi-step task.
