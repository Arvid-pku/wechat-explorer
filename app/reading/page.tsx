import Link from "next/link";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, BookOpen } from "lucide-react";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

const READING_GROUPS = ["wechat-article", "xiaohongshu", "zhihu", "medium", "substack"];

interface ReadingItem {
  id: number;
  url: string;
  domain_group: string;
  chat_display: string;
  sender: string;
  timestamp: number;
  preview: string;
}

export default async function ReadingPage() {
  const db = getDb();
  const placeholders = READING_GROUPS.map(() => "?").join(",");
  const items = db
    .prepare(
      `SELECT id, url, domain_group, chat_display, sender, timestamp, preview
       FROM urls
       WHERE domain_group IN (${placeholders})
       ORDER BY timestamp DESC
       LIMIT 80`,
    )
    .all(...READING_GROUPS) as ReadingItem[];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reading queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent long-form links shared with you — articles, posts, threads.
        </p>
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
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {u.domain_group}
                  </Badge>
                  <span>{u.sender || "—"}</span>
                  <span>·</span>
                  <span className="truncate max-w-[40ch]">{u.chat_display}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {format(new Date(u.timestamp * 1000), "MMM d, HH:mm")}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
