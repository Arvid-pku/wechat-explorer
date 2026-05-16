import Link from "next/link";
import { getDb } from "@/lib/db";
import { excludedSubquery } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { ArchivedToggle, buildArchivedToggleHref } from "@/components/archived-toggle";

export const dynamic = "force-dynamic";

const READING_GROUPS = ["wechat-article", "xiaohongshu", "zhihu", "medium", "substack"];

interface ReadingItem {
  id: number;
  url: string;
  domain_group: string;
  chat_display: string;
  chat_username: string | null;
  sender: string;
  timestamp: number;
  preview: string;
}

function dayParam(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const excl = excludedSubquery({ includeArchived });
  const db = getDb();
  const placeholders = READING_GROUPS.map(() => "?").join(",");
  const items = db
    .prepare(
      `SELECT id, url, domain_group, chat_display, chat_username, sender, timestamp, preview
       FROM urls_dedup
       WHERE domain_group IN (${placeholders})
         AND chat_username NOT IN ${excl}
       ORDER BY timestamp DESC
       LIMIT 80`,
    )
    .all(...READING_GROUPS) as ReadingItem[];

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
        <ArchivedToggle
          on={includeArchived}
          href={buildArchivedToggleHref("/reading", sp, includeArchived)}
        />
      </header>

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
            . Read tracking will land in a future iteration.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border/40">
          {items.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            items.map((u) => (
              <div key={u.id} className="px-6 py-3 hover:bg-accent/40">
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline inline-flex items-start gap-1 break-words"
                >
                  <span>{u.preview?.replace(/\[链接\]\s*/, "") || u.url}</span>
                  <ExternalLink className="size-3 shrink-0 mt-0.5 text-muted-foreground" />
                </a>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <Link
                    href={`/links/${encodeURIComponent(u.domain_group)}`}
                    className="hover:text-foreground"
                    title={`All ${u.domain_group} links`}
                  >
                    <Badge variant="outline" className="text-[10px] font-normal hover:bg-accent cursor-pointer">
                      {u.domain_group}
                    </Badge>
                  </Link>
                  {u.sender ? (
                    <Link
                      href={`/links/${encodeURIComponent(u.domain_group)}?sender=${encodeURIComponent(u.sender)}`}
                      className="hover:text-foreground hover:underline"
                      title={`All ${u.domain_group} from ${u.sender}`}
                    >
                      {u.sender}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                  <span>·</span>
                  {u.chat_username ? (
                    <Link
                      href={`/contacts/${encodeURIComponent(u.chat_username)}`}
                      className="truncate max-w-[40ch] hover:text-foreground hover:underline"
                      title={`Open ${u.chat_display}`}
                    >
                      {u.chat_display}
                    </Link>
                  ) : (
                    <Link
                      href={`/links/${encodeURIComponent(u.domain_group)}?chat=${encodeURIComponent(u.chat_display)}`}
                      className="truncate max-w-[40ch] hover:text-foreground hover:underline"
                      title={`All ${u.domain_group} in ${u.chat_display}`}
                    >
                      {u.chat_display}
                    </Link>
                  )}
                  <span>·</span>
                  <Link
                    href={`/calendar?year=${dayParam(u.timestamp).slice(0, 4)}&day=${dayParam(u.timestamp)}`}
                    className="tabular-nums hover:text-foreground hover:underline"
                    title="Open this day in the calendar"
                  >
                    {format(new Date(u.timestamp * 1000), "MMM d, HH:mm")}
                  </Link>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
