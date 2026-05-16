import Link from "next/link";
import { ArrowLeft, LinkIcon, TrendingUp, Globe, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinksStats } from "@/lib/stats";
import { Donut, LineWithBars, DomainTreemap } from "@/components/charts/stats/charts";
import { ArchivedToggle, buildArchivedToggleHref } from "@/components/archived-toggle";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

const DOMAIN_LABELS: Record<string, string> = {
  "wechat-article": "公众号文章",
  wechat: "Weixin (其他)",
  xiaohongshu: "小红书",
  bilibili: "B 站",
  zhihu: "知乎",
  arxiv: "arXiv",
  github: "GitHub",
  huggingface: "Hugging Face",
  twitter: "Twitter / X",
  youtube: "YouTube",
  notion: "Notion",
};

export default async function LinksStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const s = getLinksStats({ includeArchived });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> Overview
        </Link>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Shared links</p>
            <h1 className="text-4xl font-semibold tracking-tight mt-1">
              {fmt(s.total)} <span className="text-muted-foreground text-2xl font-normal">unique links</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
              De-duplicated across chat / sender / timestamp.
              {includeArchived ? " Archived chats are included." : " Archived chats are excluded by default."}
            </p>
          </div>
          <ArchivedToggle
            on={includeArchived}
            href={buildArchivedToggleHref("/stats/links", sp, includeArchived)}
          />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Globe className="size-4" />} label="Top group" value={s.byGroup[0]?.domain_group ?? "—"} sub={s.byGroup[0] ? `${fmt(s.byGroup[0].n)} links` : ""} />
        <Tile icon={<LinkIcon className="size-4" />} label="Distinct groups" value={fmt(s.byGroup.length)} />
        <Tile icon={<Users className="size-4" />} label="Top sender" value={s.topSenders[0]?.sender ?? "—"} sub={s.topSenders[0] ? `${fmt(s.topSenders[0].n)} shared` : ""} />
        <Tile icon={<TrendingUp className="size-4" />} label="Busiest month" value={(() => {
          const peak = [...s.byMonth].sort((a, b) => b.n - a.n)[0];
          return peak?.ym ?? "—";
        })()} sub={(() => {
          const peak = [...s.byMonth].sort((a, b) => b.n - a.n)[0];
          return peak ? `${fmt(peak.n)} links` : "";
        })()} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By domain group</CardTitle>
            <CardDescription>Donut of the indexed domain-group distribution.</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: "links", value: fmt(s.total) }}
              data={s.byGroup.map((r) => ({ name: DOMAIN_LABELS[r.domain_group] ?? r.domain_group, value: r.n }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top hosts (treemap)</CardTitle>
            <CardDescription>Top-20 hostnames sized by share count.</CardDescription>
          </CardHeader>
          <CardContent>
            <DomainTreemap data={s.topDomains.map((d) => ({ name: d.domain, value: d.n }))} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Sharing volume over time</CardTitle>
          <CardDescription>Monthly link-share count.</CardDescription>
        </CardHeader>
        <CardContent>
          <LineWithBars data={s.byMonth.map((r) => ({ label: r.ym, n: r.n }))} />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top senders</CardTitle>
            <CardDescription>People who share the most links with you.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList rows={s.topSenders.map((r) => ({ label: r.sender, n: r.n }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top chats</CardTitle>
            <CardDescription>Where the links land.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList
              rows={s.topChats.map((r) => ({
                label: r.chat_display,
                n: r.n,
                href: r.chat_username ? `/contacts/${encodeURIComponent(r.chat_username)}` : undefined,
              }))}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RankList({ rows }: { rows: { label: string; n: number; href?: string }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => {
        const inner = (
          <div className="group">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium truncate group-hover:underline">{r.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fmt(r.n)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
              <div className="h-full bg-primary/70" style={{ width: `${(r.n / max) * 100}%` }} />
            </div>
          </div>
        );
        return (
          <li key={`${r.label}-${i}`}>
            {r.href ? <Link href={r.href}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="inline-flex items-center gap-1.5">{icon} {label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
