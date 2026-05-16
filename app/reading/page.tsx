import Link from "next/link";
import { getDb } from "@/lib/db";
import { excludedSubquery, getReadUrlIds } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";
import { ReadingList, type ReadingItem } from "./reading-list";

export const dynamic = "force-dynamic";

const READING_GROUPS = ["wechat-article", "xiaohongshu", "zhihu", "medium", "substack"];

type FilterKey = "all" | "unread" | "read";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
];

function parseFilter(v: string | undefined): FilterKey {
  if (v === "unread" || v === "read") return v;
  return "all";
}

function buildFilterHref(
  base: string,
  sp: Record<string, string | undefined>,
  filter: FilterKey,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "filter") next.set(k, v);
  }
  if (filter !== "all") next.set("filter", filter);
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const filter = parseFilter(sp.filter);
  const excl = excludedSubquery({ includeArchived });
  const db = getDb();
  const placeholders = READING_GROUPS.map(() => "?").join(",");
  const items = db
    .prepare(
      `SELECT id, url, domain_group, chat_display, chat_username, sender, timestamp, preview
       FROM urls_dedup
       WHERE domain_group IN (${placeholders})
         AND (chat_username IS NULL OR chat_username NOT IN ${excl})
       ORDER BY timestamp DESC
       LIMIT 80`,
    )
    .all(...READING_GROUPS) as ReadingItem[];
  const readIds = Array.from(getReadUrlIds());
  const readSetForCount = new Set(readIds);
  const readCount = items.reduce((a, it) => (readSetForCount.has(it.id) ? a + 1 : a), 0);
  const unreadCount = items.length - readCount;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reading queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recent long-form links shared with you — articles, posts, threads
            {includeArchived ? " (including archived)" : ""}.
          </p>
        </div>
        <ArchivedFilterPill
          on={includeArchived}
          href={buildArchivedFilterHref("/reading", sp, includeArchived)}
        />
      </header>

      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.key;
          const count =
            opt.key === "unread" ? unreadCount : opt.key === "read" ? readCount : items.length;
          return (
            <Link
              key={opt.key}
              href={buildFilterHref("/reading", sp, opt.key)}
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
            Latest {items.length} items
          </CardTitle>
          <CardDescription>
            Aggregated from{" "}
            {READING_GROUPS.map((g, i) => (
              <span key={g}>
                <Link href={`/links/${encodeURIComponent(g)}`} className="hover:underline">
                  {g}
                </Link>
                {i < READING_GROUPS.length - 1 ? ", " : ""}
              </span>
            ))}
            . Tick the checkbox to mark an item read.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ReadingList items={items} readIds={readIds} filter={filter} />
        </CardContent>
      </Card>
    </div>
  );
}
