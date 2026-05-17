import Link from "next/link";
import { getLinkGroups } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { LinkIcon } from "lucide-react";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";
import { t, tf, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

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
  searchParams: Promise<{ archived?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const includeArchived = sp.archived === "1";
  const showAll = sp.show === "all";
  const groups = getLinkGroups({ includeArchived });
  const grandTotal = groups.reduce((a, b) => a + b.n, 0);

  // Collapse the long tail by default — hundreds of domain groups makes the
  // HTML payload >3 MB and noisy. Show the top 60 (by count, already the
  // sort order from getLinkGroups) plus a "Show all" link. The cutoff also
  // applies the "low-n" tail collapse implicitly because the sort is by n DESC.
  const TOP_N = 60;
  const visible = showAll ? groups : groups.slice(0, TOP_N);
  const hiddenCount = Math.max(0, groups.length - visible.length);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr("links.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tf("links.summary", locale, {
              n: grandTotal.toLocaleString(),
              groups: groups.length.toLocaleString(),
            })}
            {includeArchived ? tr("links.includingArchived") : ""}
          </p>
        </div>
        <ArchivedFilterPill
          on={includeArchived}
          href={buildArchivedFilterHref("/links", sp, includeArchived)}
          locale={locale}
        />
      </header>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {visible.map((g) => (
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
                  {tr("links.lastPrefix")}:{" "}
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

      {hiddenCount > 0 && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/links?show=all${includeArchived ? "&archived=1" : ""}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {tf("links.showAll", locale, { n: hiddenCount.toLocaleString() })}
          </Link>
        </div>
      )}
      {showAll && groups.length > TOP_N && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/links${includeArchived ? "?archived=1" : ""}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {tr("links.collapse")}
          </Link>
        </div>
      )}
    </div>
  );
}
