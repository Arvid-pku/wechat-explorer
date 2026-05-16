import Link from "next/link";
import { getLinkGroups } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { LinkIcon } from "lucide-react";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";

export const dynamic = "force-dynamic";

const GROUP_LABELS: Record<string, string> = {
  "wechat-article": "公众号文章",
  "wechat": "Weixin (其他)",
  "xiaohongshu": "小红书",
  "bilibili": "B 站",
  "weibo": "微博",
  "zhihu": "知乎",
  "douyin": "抖音",
  "douban": "豆瓣",
  "arxiv": "arXiv",
  "github": "GitHub",
  "huggingface": "Hugging Face",
  "scholar": "Google Scholar",
  "twitter": "Twitter / X",
  "youtube": "YouTube",
  "notion": "Notion",
  "medium": "Medium",
  "substack": "Substack",
  "reddit": "Reddit",
  "hackernews": "Hacker News",
};

export default async function LinksIndex({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const groups = getLinkGroups({ includeArchived });
  const grandTotal = groups.reduce((a, b) => a + b.n, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Links</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {grandTotal.toLocaleString()} shared links across {groups.length.toLocaleString()} domain groups
            {includeArchived ? " (including archived)" : ""}
          </p>
        </div>
        <ArchivedFilterPill
          on={includeArchived}
          href={buildArchivedFilterHref("/links", sp, includeArchived)}
        />
      </header>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {groups.map((g) => (
          <Link
            key={g.domain_group}
            href={`/links/${encodeURIComponent(g.domain_group)}${includeArchived ? "?archived=1" : ""}`}
          >
            <Card className="h-full transition-all hover:border-primary/40 hover:shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded bg-primary/10 text-primary">
                    <LinkIcon className="size-3" />
                  </span>
                  <span className="truncate">
                    {GROUP_LABELS[g.domain_group] ?? g.domain_group}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tabular-nums tracking-tight">
                  {g.n.toLocaleString()}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  last:{" "}
                  {g.latest_ts
                    ? formatDistanceToNow(new Date(g.latest_ts * 1000), { addSuffix: true })
                    : "—"}
                </p>
                {GROUP_LABELS[g.domain_group] && (
                  <p className="text-[11px] text-muted-foreground/60 truncate font-mono">
                    {g.domain_group}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
