import Link from "next/link";
import { getDb, getMeta } from "@/lib/db";
import { getCacheStats } from "@/lib/cache";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ArrowLeft, Database, Gauge } from "lucide-react";

export const dynamic = "force-dynamic";

interface TableRow {
  name: string;
  type: "table" | "index" | "view";
}

interface DbStatRow {
  name: string;
  mb: number;
}

interface QueryPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

interface ProbeResult {
  label: string;
  sql: string;
  rows: QueryPlanRow[];
  elapsedMs: number;
}

// A handful of representative queries that mirror the hot paths in production
// (overview, search, contact analytics). Surface their plans so a maintainer
// can spot a regression without firing up sqlite3 manually.
//
// `time` is whether to also exec the query. Set false for probes whose execs
// would be slow (e.g. a full-table LIKE on a 1M-row corpus) — the planner's
// output alone is sufficient signal there.
const PROBES: { label: string; sql: string; params?: unknown[]; time?: boolean }[] = [
  {
    label: "Overview totals (daily_counts)",
    sql: "SELECT SUM(n), SUM(mine) FROM daily_counts",
    time: true,
  },
  {
    label: "byMonth via daily_counts",
    sql: "SELECT substr(day,1,7) AS ym, SUM(n), SUM(mine) FROM daily_counts GROUP BY ym ORDER BY ym",
    time: true,
  },
  {
    label: "Per-chat hourly (covering idx)",
    sql: "SELECT strftime('%H', timestamp,'unixepoch','localtime') AS h, COUNT(*) FROM messages WHERE chat_username = ? GROUP BY h",
    params: ["__nonexistent__"],
    time: true,
  },
  {
    label: "FTS5 search (single token)",
    sql: "SELECT m.id FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid WHERE messages_fts MATCH ? ORDER BY m.timestamp DESC LIMIT 50",
    params: [`"___nonexistent_token___"`],
    time: true,
  },
  {
    label: "LIKE fallback (full scan — plan only)",
    sql: "SELECT m.id FROM messages m WHERE m.content LIKE ? ORDER BY m.timestamp DESC LIMIT 50",
    params: ["%生日%"],
    time: false,
  },
];

function formatBytes(b: number): string {
  if (b > 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`;
  if (b > 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export default async function DebugPage() {
  const db = getDb();
  const schemaRows = db
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table','index','view') AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all() as TableRow[];

  // Per-table / per-index storage from dbstat. dbstat is a built-in virtual
  // table on macOS sqlite3 builds; if it ever fails, fall back to a flag.
  let dbstats: DbStatRow[] = [];
  let dbstatAvailable = true;
  try {
    dbstats = db
      .prepare(
        `SELECT name, SUM(pgsize) / 1024.0 / 1024.0 AS mb
         FROM dbstat
         WHERE name NOT LIKE 'sqlite_%'
         GROUP BY name
         ORDER BY mb DESC`,
      )
      .all() as DbStatRow[];
  } catch {
    dbstatAvailable = false;
  }

  const pageStats = db
    .prepare(
      `SELECT
         (SELECT page_count FROM pragma_page_count) AS pages,
         (SELECT page_size FROM pragma_page_size) AS page_size,
         (SELECT freelist_count FROM pragma_freelist_count) AS freelist`,
    )
    .get() as { pages: number; page_size: number; freelist: number };

  // Run EXPLAIN QUERY PLAN + a timed exec for each probe. The exec is a
  // sanity check — we discard the rows, just measure wall-clock.
  const probes: ProbeResult[] = PROBES.map((p) => {
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${p.sql}`)
      .all(...((p.params ?? []) as never[])) as QueryPlanRow[];
    let elapsedMs = -1;
    if (p.time !== false) {
      const start = Date.now();
      try {
        db.prepare(p.sql).all(...((p.params ?? []) as never[]));
      } catch {
        // some probes may not run cleanly on every DB shape; the plan is still
        // useful even if the exec fails.
      }
      elapsedMs = Date.now() - start;
    }
    return { label: p.label, sql: p.sql, rows: plan, elapsedMs };
  });

  const cacheStats = getCacheStats();
  const lastQuick = getMeta("last_quick_index_at");
  const lastDeep = getMeta("last_deep_index_at");
  const dailyRefreshed = getMeta("daily_counts_refreshed_at");

  const tables = schemaRows.filter((r) => r.type === "table");
  const indexes = schemaRows.filter((r) => r.type === "index");
  const views = schemaRows.filter((r) => r.type === "view");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-6">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 mr-1" /> Overview
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Debug</p>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Gauge className="size-6 text-primary" /> SQL plans + cache state
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Internal-only — surface for spotting regressions while developing. Not linked from the
          sidebar; reach via <code className="font-mono">/debug</code>.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="DB size"
          value={formatBytes(pageStats.pages * pageStats.page_size)}
          sub={`${pageStats.pages.toLocaleString()} pages × ${pageStats.page_size}B (free: ${pageStats.freelist.toLocaleString()})`}
        />
        <StatTile
          label="Schema"
          value={`${tables.length} tables`}
          sub={`${indexes.length} indexes · ${views.length} view${views.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Cache rows"
          value={cacheStats.rows.toLocaleString()}
          sub={`${formatBytes(cacheStats.totalBytes)} · ${cacheStats.totalHits.toLocaleString()} hits`}
        />
        <StatTile
          label="Epochs"
          value={`idx ${cacheStats.epochs.index} · arc ${cacheStats.epochs.archive}`}
          sub={`Last quick: ${lastQuick ? format(new Date(Number(lastQuick)), "PP HH:mm") : "—"}`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" /> EXPLAIN QUERY PLAN — hot paths
          </CardTitle>
          <CardDescription>
            What the planner does on each canonical query. Watch for &quot;SCAN messages&quot; on
            any path that should be using an index.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {probes.map((p) => (
            <div key={p.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-medium">{p.label}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {p.elapsedMs >= 0 ? `${p.elapsedMs}ms` : "plan only"}
                </span>
              </div>
              <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
                {p.sql}
              </pre>
              <ul className="text-xs space-y-0.5 ml-4">
                {p.rows.map((r, i) => (
                  <li key={i} className="font-mono text-muted-foreground">
                    <span className="text-foreground/70">{`id=${r.id} parent=${r.parent}`}</span>{" "}
                    {r.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage by table / index</CardTitle>
          <CardDescription>
            {dbstatAvailable
              ? "Pulled from sqlite_dbstat — handy for spotting unexpected growth."
              : "sqlite_dbstat is not available in this build."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dbstats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stats.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {dbstats.slice(0, 30).map((d) => (
                <li key={d.name} className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-mono text-xs">{d.name}</span>
                  <span className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                    {d.mb < 1 ? `${(d.mb * 1024).toFixed(0)} KB` : `${d.mb.toFixed(1)} MB`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cache top entries</CardTitle>
          <CardDescription>
            By hits and by size. A row that&apos;s never been hit + is large is a candidate for
            removal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Top by hits</p>
            <ul className="space-y-1 text-xs font-mono">
              {cacheStats.topByHits.map((r) => (
                <li key={r.cache_key} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{r.cache_key}</span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {r.hits}× · {formatBytes(r.size_bytes)}
                  </span>
                </li>
              ))}
              {cacheStats.topByHits.length === 0 && (
                <li className="text-muted-foreground">No cached rows yet.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Top by size</p>
            <ul className="space-y-1 text-xs font-mono">
              {cacheStats.topBySize.map((r) => (
                <li key={r.cache_key} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{r.cache_key}</span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatBytes(r.size_bytes)} · {r.hits}×
                  </span>
                </li>
              ))}
              {cacheStats.topBySize.length === 0 && (
                <li className="text-muted-foreground">No cached rows yet.</li>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Index status</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Last quick index</dt>
            <dd className="tabular-nums">
              {lastQuick ? format(new Date(Number(lastQuick)), "PPpp") : "Never"}
            </dd>
            <dt className="text-muted-foreground">Last deep index</dt>
            <dd className="tabular-nums">
              {lastDeep ? format(new Date(Number(lastDeep)), "PPpp") : "Never"}
            </dd>
            <dt className="text-muted-foreground">Daily counts refreshed</dt>
            <dd className="tabular-nums">
              {dailyRefreshed ? format(new Date(Number(dailyRefreshed)), "PPpp") : "Never"}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 text-xs font-mono">
            <div>
              <p className="text-muted-foreground mb-1">Tables ({tables.length})</p>
              <ul className="space-y-0.5">
                {tables.map((t) => (
                  <li key={t.name}>{t.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Indexes ({indexes.length})</p>
              <ul className="space-y-0.5">
                {indexes.map((t) => (
                  <li key={t.name}>{t.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Views ({views.length})</p>
              <ul className="space-y-0.5">
                {views.map((t) => (
                  <li key={t.name}>{t.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
