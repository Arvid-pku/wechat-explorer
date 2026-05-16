import Link from "next/link";
import { getDb } from "@/lib/db";
import { excludedSubquery, getReadUrlIds } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";
import { ReadingList, type ReadingItem } from "./reading-list";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const READING_GROUPS = ["wechat-article", "xiaohongshu", "zhihu", "medium", "substack"];

const PAGE_SIZE = 100;

type FilterKey = "all" | "unread" | "read";

function filterOptions(locale: "en" | "zh"): { key: FilterKey; label: string }[] {
  return [
    { key: "all", label: t("common.all", locale) },
    { key: "unread", label: t("common.unread", locale) },
    { key: "read", label: t("common.read", locale) },
  ];
}

function parseFilter(v: string | undefined): FilterKey {
  if (v === "unread" || v === "read") return v;
  return "all";
}

function buildHref(
  base: string,
  sp: Record<string, string | undefined>,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  // Carry every current param except the ones we're patching.
  for (const [k, v] of Object.entries(sp)) {
    if (!(k in patch) && v) next.set(k, v);
  }
  // Apply patches; `null` deletes.
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) continue;
    next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const includeArchived = sp.archived === "1";
  const filter = parseFilter(sp.filter);
  const pageNum = Math.max(1, Math.floor(Number(sp.page ?? "1")) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const excl = excludedSubquery({ includeArchived });
  const db = getDb();
  const placeholders = READING_GROUPS.map(() => "?").join(",");
  // Dedup by URL — the same article forwarded twenty times shouldn't burn
  // twenty rows in the reading queue. Keep the most-recent occurrence (its id
  // is what `read_urls` references) and surface the share count alongside.
  //
  // `mp.weixin.qq.com/mp/waerrpage` is WeChat's "this content is unavailable"
  // placeholder — it dominates the long tail (1235× for one URL on this
  // corpus) and gives zero reading value. Filter it out.
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1
         FROM urls_dedup
         WHERE domain_group IN (${placeholders})
           AND (chat_username IS NULL OR chat_username NOT IN ${excl})
           AND url NOT LIKE 'https://mp.weixin.qq.com/mp/waerrpage%'
         GROUP BY url
       )`,
    )
    .get(...READING_GROUPS) as { n: number };
  const totalItems = totalRow.n;
  const rows = db
    .prepare(
      `WITH ranked AS (
         SELECT id, url, domain_group, chat_display, chat_username, sender, timestamp, preview,
                ROW_NUMBER() OVER (PARTITION BY url ORDER BY timestamp DESC, id DESC) AS rn,
                COUNT(*) OVER (PARTITION BY url) AS share_count
         FROM urls_dedup
         WHERE domain_group IN (${placeholders})
           AND (chat_username IS NULL OR chat_username NOT IN ${excl})
           AND url NOT LIKE 'https://mp.weixin.qq.com/mp/waerrpage%'
       )
       SELECT id, url, domain_group, chat_display, chat_username, sender, timestamp, preview, share_count
       FROM ranked
       WHERE rn = 1
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...READING_GROUPS, PAGE_SIZE, offset) as ReadingItem[];
  const items = rows;
  const readIds = Array.from(getReadUrlIds());
  const readSetForCount = new Set(readIds);
  const readCount = items.reduce((a, it) => (readSetForCount.has(it.id) ? a + 1 : a), 0);
  const unreadCount = items.length - readCount;
  const hasNext = offset + items.length < totalItems;
  const hasPrev = pageNum > 1;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr("reading.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("reading.desc")}
            {includeArchived ? (locale === "zh" ? "（含已归档）" : " (including archived)") : ""}
            .
          </p>
        </div>
        <ArchivedFilterPill
          on={includeArchived}
          href={buildArchivedFilterHref("/reading", sp, includeArchived)}
          locale={locale}
        />
      </header>

      <div className="flex items-center gap-1.5 flex-wrap">
        {filterOptions(locale).map((opt) => {
          const active = filter === opt.key;
          // Counts here reflect the visible page only — they're a quick "how
          // much of this page have I read" signal, not totals.
          const count =
            opt.key === "unread" ? unreadCount : opt.key === "read" ? readCount : items.length;
          return (
            <Link
              key={opt.key}
              href={buildHref("/reading", sp, {
                filter: opt.key === "all" ? null : opt.key,
                page: null,
              })}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
              <span className="tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-primary" />
            {totalItems.toLocaleString()} {tr("reading.unique")}
            {totalItems > PAGE_SIZE && (
              <span className="text-muted-foreground text-sm font-normal">
                · {tr("reading.page")} {pageNum} {tr("reading.pageOf")}{" "}
                {Math.ceil(totalItems / PAGE_SIZE)}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {tr("reading.aggregatedFrom")}{" "}
            {READING_GROUPS.map((g, i) => (
              <span key={g}>
                <Link href={`/links/${encodeURIComponent(g)}`} className="hover:underline">
                  {g}
                </Link>
                {i < READING_GROUPS.length - 1 ? ", " : ""}
              </span>
            ))}
            . {tr("reading.dedupNote")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ReadingList items={items} readIds={readIds} filter={filter} />
        </CardContent>
      </Card>

      {(hasPrev || hasNext) && (
        <nav className="flex items-center justify-between gap-3 pt-2">
          {hasPrev ? (
            <Link
              href={buildHref("/reading", sp, {
                page: pageNum - 1 === 1 ? null : String(pageNum - 1),
              })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              {tr("common.newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {offset + 1}–{offset + items.length}
            {locale === "zh" ? " 条 / 共 " : " of "}
            {totalItems.toLocaleString()}
          </span>
          {hasNext ? (
            <Link
              href={buildHref("/reading", sp, { page: String(pageNum + 1) })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              {tr("common.older")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
