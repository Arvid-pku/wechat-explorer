import Link from "next/link";
import { ArrowLeft, LinkIcon, TrendingUp, Globe, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinksStats } from "@/lib/stats";
import { Donut, LineWithBars, DomainTreemap } from "@/components/charts/stats/charts";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

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
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const includeArchived = sp.archived === "1";
  const s = getLinksStats({ includeArchived });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> {tr("common.backToOverview")}
        </Link>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr("stats.links.eyebrow")}</p>
            <h1 className="text-4xl font-semibold tracking-tight mt-1">
              {fmt(s.total)}{" "}
              <span className="text-muted-foreground text-2xl font-normal">{tr("stats.links.heroSuffix")}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
              {tr("stats.links.heroDesc")}
              {includeArchived ? tr("stats.links.heroIncluded") : tr("stats.links.heroExcluded")}
            </p>
          </div>
          <ArchivedFilterPill
            on={includeArchived}
            href={buildArchivedFilterHref("/stats/links", sp, includeArchived)}
            locale={locale}
          />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Globe className="size-4" />} label={tr("stats.links.tileTopGroup")} value={s.byGroup[0]?.domain_group ?? "—"} sub={s.byGroup[0] ? `${fmt(s.byGroup[0].n)} ${tr("stats.links.tileTopGroupSub")}` : ""} />
        <Tile icon={<LinkIcon className="size-4" />} label={tr("stats.links.tileDistinctGroups")} value={fmt(s.byGroup.length)} />
        <Tile icon={<Users className="size-4" />} label={tr("stats.links.tileTopSender")} value={s.topSenders[0]?.sender ?? "—"} sub={s.topSenders[0] ? `${fmt(s.topSenders[0].n)} ${tr("stats.links.tileTopSenderSub")}` : ""} />
        <Tile icon={<TrendingUp className="size-4" />} label={tr("stats.links.tileBusiestMonth")} value={(() => {
          const peak = [...s.byMonth].sort((a, b) => b.n - a.n)[0];
          return peak?.ym ?? "—";
        })()} sub={(() => {
          const peak = [...s.byMonth].sort((a, b) => b.n - a.n)[0];
          return peak ? `${fmt(peak.n)} ${tr("stats.links.tileTopGroupSub")}` : "";
        })()} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.links.byGroupTitle")}</CardTitle>
            <CardDescription>{tr("stats.links.byGroupDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: tr("stats.links.donutCenter"), value: fmt(s.total) }}
              data={s.byGroup.map((r) => ({ name: DOMAIN_LABELS[r.domain_group] ?? r.domain_group, value: r.n }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.links.treemapTitle")}</CardTitle>
            <CardDescription>{tr("stats.links.treemapDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DomainTreemap data={s.topDomains.map((d) => ({ name: d.domain, value: d.n }))} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{tr("stats.links.volumeTitle")}</CardTitle>
          <CardDescription>{tr("stats.links.volumeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LineWithBars data={s.byMonth.map((r) => ({ label: r.ym, n: r.n }))} />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.links.topSendersTitle")}</CardTitle>
            <CardDescription>{tr("stats.links.topSendersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList rows={s.topSenders.map((r) => ({ label: r.sender, n: r.n }))} emptyText={tr("stats.links.noData")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.links.topChatsTitle")}</CardTitle>
            <CardDescription>{tr("stats.links.topChatsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList
              rows={s.topChats.map((r) => ({
                label: r.chat_display,
                n: r.n,
                href: r.chat_username ? `/contacts/${encodeURIComponent(r.chat_username)}` : undefined,
              }))}
              emptyText={tr("stats.links.noData")}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RankList({ rows, emptyText }: { rows: { label: string; n: number; href?: string }[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
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
