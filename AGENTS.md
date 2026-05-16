<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project-specific notes (read before writing code)

This is a local-only Next.js 16 app that turns the user's decrypted WeChat history into an explorer. Everything stays on the machine — no LLM, no API features, no network calls except `wx` CLI to read the local DB. Dev URL is `http://localhost:3719` and the dev server is usually already running.

## Critical pitfalls (relearned the hard way)

- **`bun --bun next dev` leaks postcss workers** (saw 2,000+ orphans once). Use plain `next dev` for the web tier. Indexer scripts run with `tsx`, never `bun run` — better-sqlite3's native binding isn't compatible with Bun (`oven-sh/bun#4290`).
- **shadcn primitives use `@base-ui/react`, not Radix**. `asChild` doesn't propagate; the prop leaks to the DOM. Put children directly inside triggers.
- **Next 16 dynamic route `params` are `Promise<…>`** — must `await`.
- **Tailwind v4** — no `tailwind.config.js`. Theme tokens live in `app/globals.css` under `@theme inline`.
- **next-themes' `<script>` injection triggered a Next 16 warning**. Replaced with an in-house `components/theme-provider.tsx` plus a `next/script` `beforeInteractive` tag in `app/layout.tsx`. Don't reintroduce `next-themes`.
- **Grammarly causes a hydration mismatch on `<body>`** — already suppressed via `suppressHydrationWarning`. Don't touch.
- **DB has real user data** — migrations must be additive only (`ALTER TABLE ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`, `CREATE VIEW`). Never `DROP COLUMN`.
- **If the dev server stops responding**, run:
  ```
  pkill -9 -f "postcss.js"; pkill -9 -f "next dev"; npm run dev
  ```

## SQL / data conventions

- The shared store is at `~/.wechat-explorer/index.db` (better-sqlite3, WAL).
- **Stats / search / link queries exclude archived sessions and `chat_type IN ('official','folded')` by default.** Use `EXCLUDED_SUBQUERY` (constant) or, for code that wants to honour an "include archived" toggle, `excludedSubquery({ includeArchived })`.
- **Always read links via the `urls_dedup` view, not the `urls` table.** The same conceptual shared URL can be inserted twice by two indexer paths (`wx search --type link` bulk + per-chat `wx history`) with different `messages.content_hash` values, bypassing the URL row's unique index. The view collapses `(url, ts, sender, COALESCE(chat_username, chat_display))` → one row.
- **Parameterise SQL.** Use `?` placeholders, never string-interpolate user input. The only allowed inline interpolation is `${EXCLUDED_SUBQUERY}` / `${scope.excl}` and similar constant fragments built in code.
- **Identify the user** with `getMeHandles()` (reads `meta.me_handles`, JSON array). Don't roll your own detection.
- **FTS5 trigram min length is 3.** For shorter queries (very common for 2-char CJK words like 庆祝 / 生日), `searchMessages` falls back to LIKE — don't break that path when refactoring.
- **Don't repeatedly full-scan `messages`** (614k rows). Useful indexes: `idx_messages_chat (chat_username, timestamp DESC)`, `idx_messages_chat_display`, `idx_messages_ts`, `idx_messages_sender`, `idx_messages_type`. Include a `timestamp >= ? AND timestamp < ?` range whenever possible.

## UX patterns to keep consistent

- Pages are server components with `export const dynamic = "force-dynamic";` unless there's a reason otherwise.
- Per-page "Include archived" pill uses `components/archived-toggle.tsx` with `?archived=1` searchParam.
- CSV / JSON exports go through `/api/export/[kind]`.
- Cross-link from everywhere: every chat → `/contacts/[username]`, every sender → `/search?q=<sender>` (or `/links/<group>?sender=…` in the link context), every timestamp → `/calendar?year=&day=`, every keyword token → `/search?q=`.
- Keyboard shortcuts: `g h/c/l/k/r/s/g/y` to navigate, `j/k` between rows, `/` to open the palette. Mark navigable rows with `data-jk-row` if the default selector (table rows, `<a>` inside main) misses them.
- Light theme default. New HTML / report outputs should be light-theme-first.

## Performance budget

- Every page < 2s on warm load. The expensive single page is `/recap/<latest year>` cold (~6s on the largest year); it has a 5-minute in-process cache so repeat hits land in < 0.5s.
- Bulk operations chunk and stream — never block a render on the full 614k-row scan.
- Pre-aggregate into `sessions` columns where reasonable (`message_count`, `my_msg_count`, `distinct_senders`, `member_count`, `first_msg_timestamp`, `history_indexed_through`).

## Commit hygiene

- Conventional commits with descriptive bodies (`feat(stats): …`, `fix(links): …`, `perf(recap): …`).
- No `Co-Authored-By` lines and no AI markers in source files.
- Don't push to GitHub unless the user asks.

## Files worth knowing

- `lib/queries.ts` — `EXCLUDED_SUBQUERY`, `excludedSubquery()`, `getMeHandles()`, `getOverview()`, list/session helpers, archive ops, member-count backfill, `searchMessages` (with the < 3-char LIKE fallback).
- `lib/db.ts` — schema + additive migrations + the `urls_dedup` VIEW. New views/columns go here.
- `lib/recap.ts` — `getYearRecap()` (cache key includes the archived toggle) + `getYearBaseline()` (for YoY diff strip).
- `lib/stats.ts` — per-topic drilldown reads (`/stats/<topic>`).
- `lib/surprises.ts` — Overview anomaly cards.
- `lib/text.ts` / `lib/latency.ts` — TF-IDF + reply-latency math.
- `components/charts/stats/charts.tsx` — Recharts kit used by `/stats/*` (Donut, VerticalBars, StackedArea, LineWithBars, HourRadial, DomainTreemap).
- `components/archived-toggle.tsx` — the shared pill + `buildArchivedToggleHref()` helper.
- `components/keyboard-shortcuts.tsx` — global hotkeys.

## Workflow notes

- The user prefers Chinese for clarification questions and short status updates if mid-conversation; English for commit messages and source code.
- Verify UI changes by hitting the dev server with curl (warm-load timing) and visually via the Chrome MCP — don't accept "returns 200" as proof the page renders.
- Working notes (`task_plan.md`, `findings.md`, `progress.md`) are gitignored. Re-create them if you want to track a multi-step task.
