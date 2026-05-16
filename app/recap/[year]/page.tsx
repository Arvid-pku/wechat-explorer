import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Sparkles, Calendar, ExternalLink } from "lucide-react";
import { getYearRecap, getRecapYears, getYearBaseline } from "@/lib/recap";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";
import { formatLatency } from "@/lib/latency";
import { MonthlyBars } from "@/components/charts/recap/monthly-bars";
import { HourlyGrid } from "@/components/charts/recap/hourly-grid";
import { LatencyHist, LatencyTrend } from "@/components/charts/recap/latency-hist";
import { KeywordCloud } from "@/components/charts/recap/keyword-cloud";
import { HorizontalBars } from "@/components/charts/recap/horizontal-bars";

export const dynamic = "force-dynamic";

const DOMAIN_LABELS: Record<string, string> = {
  "wechat-article": "公众号文章",
  wechat: "Weixin (其他)",
  xiaohongshu: "小红书",
  bilibili: "B 站",
  zhihu: "知乎",
  arxiv: "arXiv",
  github: "GitHub",
  huggingface: "Hugging Face",
  scholar: "Google Scholar",
  twitter: "Twitter / X",
  youtube: "YouTube",
  notion: "Notion",
  medium: "Medium",
  substack: "Substack",
  reddit: "Reddit",
  hackernews: "Hacker News",
  douyin: "抖音",
  weibo: "微博",
  douban: "豆瓣",
};

function fmtNum(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function RecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { year: yStr } = await params;
  const sp = await searchParams;
  const year = parseInt(yStr, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return notFound();
  const includeArchived = sp.archived === "1";
  const recap = getYearRecap(year, null, { includeArchived });
  const knownYears = getRecapYears();
  const prevYear = knownYears.find((y) => y < year) ?? null;
  const prevBaseline = prevYear ? getYearBaseline(prevYear, null, { includeArchived }) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-10">
      <header className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 mr-1" /> Overview
        </Link>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Year in Review</p>
            <h1 className="text-5xl font-semibold tracking-tight mt-1">{year}</h1>
            {!recap.ok && (
              <p className="text-sm text-muted-foreground mt-2">
                No indexed messages in {year}. Try one of the years below.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {knownYears.slice(0, 6).map((y) => (
              <Link
                key={y}
                href={`/recap/${y}${includeArchived ? "?archived=1" : ""}`}
                className={`rounded-md border border-border/60 px-3 py-1 text-sm hover:bg-accent ${
                  y === year ? "bg-accent" : "text-muted-foreground"
                }`}
              >
                {y}
              </Link>
            ))}
            <ArchivedFilterPill
              on={includeArchived}
              href={buildArchivedFilterHref(`/recap/${year}`, sp, includeArchived)}
            />

            <a
              href={`/api/recap/${year}/export${includeArchived ? "?archived=1" : ""}`}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Download className="size-3.5" />
              HTML
            </a>
          </div>
        </div>
      </header>

      {!recap.ok ? null : (
        <>
          {/* Hero stats strip */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Hero label="Messages" value={fmtNum(recap.totals.messages)} sub={`${fmtNum(recap.totals.mine)} you · ${fmtNum(recap.totals.theirs)} them`} />
            <Hero
              label="Top contact"
              value={recap.topContacts[0]?.display_name ?? "—"}
              sub={recap.topContacts[0] ? `${fmtNum(recap.topContacts[0].n)} msgs` : ""}
              href={recap.topContacts[0] ? `/contacts/${encodeURIComponent(recap.topContacts[0].username)}` : undefined}
            />
            <Hero
              label="Busiest month"
              value={
                recap.monthly.reduce(
                  (a, b) => (b.total > a.total ? b : a),
                  { ym: "—", total: 0, mine: 0, theirs: 0 },
                ).ym
              }
              sub={`${fmtNum(
                recap.monthly.reduce(
                  (a, b) => (b.total > a.total ? b : a),
                  { ym: "—", total: 0, mine: 0, theirs: 0 },
                ).total,
              )} msgs`}
            />
            <Hero
              label="Longest dry streak"
              value={`${recap.totals.longestDryStreak}d`}
              sub={`Longest active streak ${recap.totals.longestStreak}d`}
            />
          </section>

          {/* Year-over-year diff — only when both years have reasonably full coverage */}
          {prevBaseline && prevBaseline.totalMessages > 0 && (
            <section className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                vs {prevBaseline.year}
                {prevBaseline.totalMessages < 30_000 && (
                  <span className="ml-2 text-amber-700 dark:text-amber-400 normal-case tracking-normal">
                    {prevBaseline.year} only has {fmtNum(prevBaseline.totalMessages)} indexed messages — deltas
                    likely reflect coverage, not behavior.
                  </span>
                )}
              </p>
              <div className="grid gap-x-6 gap-y-2 grid-cols-2 sm:grid-cols-4 text-sm">
                <Delta label="messages" current={recap.totals.messages} previous={prevBaseline.totalMessages} />
                <Delta label="links" current={recap.totals.links} previous={prevBaseline.totalLinks} />
                <Delta label="chats" current={recap.totals.chats} previous={prevBaseline.totalChats} />
                <Delta label="active days" current={recap.totals.days} previous={prevBaseline.totalDays} />
              </div>
              {prevBaseline.topContact && recap.topContacts[0] && prevBaseline.topContact !== recap.topContacts[0].display_name && (
                <p className="text-xs text-muted-foreground mt-2">
                  Top contact shifted from <span className="font-medium text-foreground">{prevBaseline.topContact}</span>
                  {" "}→ <span className="font-medium text-foreground">{recap.topContacts[0].display_name}</span>.
                </p>
              )}
            </section>
          )}

          {/* Monthly */}
          <Section
            title={`A year of conversations`}
            description="Stacked bars: your messages on top, theirs underneath. The thin line is the year's cumulative total."
          >
            <div className="overflow-x-auto">
              <MonthlyBars data={recap.monthly} />
            </div>
          </Section>

          {/* Hourly grid */}
          <Section
            title="When you were online"
            description="Cells are darker when more messages landed in that hour. Look for sleep windows and peak times."
          >
            <HourlyGrid data={recap.hourly} />
          </Section>

          {/* Top contacts & groups */}
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 private chats</CardTitle>
                <CardDescription>The people you exchanged the most with this year.</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.topContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No private chats indexed.</p>
                ) : (
                  <HorizontalBars
                    rows={recap.topContacts.map((c) => ({
                      label: c.display_name || c.username,
                      n: c.n,
                      href: `/recap/${year}/${encodeURIComponent(c.username)}`,
                      sub: `${fmtNum(c.my_msgs)} mine · ${fmtNum(c.links)} links`,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top 10 groups</CardTitle>
                <CardDescription>The group chats you spent the most time in.</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.topGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No groups indexed.</p>
                ) : (
                  <HorizontalBars
                    rows={recap.topGroups.map((g) => ({
                      label: g.display_name || g.username,
                      n: g.n,
                      href: `/contacts/${encodeURIComponent(g.username)}`,
                      sub: g.member_count
                        ? `${g.member_count} members · ${fmtNum(g.my_msgs)} yours`
                        : `${fmtNum(g.my_msgs)} yours`,
                    }))}
                    tone="muted"
                  />
                )}
              </CardContent>
            </Card>
          </section>

          {/* Domains + records */}
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top 25 link sources</CardTitle>
                <CardDescription>What you shared and read most this year.</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBars
                  rows={recap.topDomains.map((d) => ({
                    label: DOMAIN_LABELS[d.domain_group] ?? d.domain_group,
                    sub: d.domain_group,
                    n: d.n,
                    href: `/links/${encodeURIComponent(d.domain_group)}`,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Records</CardTitle>
                <CardDescription>Quirky highlights of the year.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {recap.records.map((r) => {
                    const body = (
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{r.label}</p>
                          {r.detail && <p className="text-xs text-muted-foreground">{r.detail}</p>}
                        </div>
                        <p className="text-base font-semibold tabular-nums whitespace-nowrap">
                          {r.value}
                        </p>
                      </div>
                    );
                    return (
                      <li key={r.label} className="rounded-md border border-border/40 px-3 py-2 hover:bg-accent/40">
                        {r.href ? <Link href={r.href}>{body}</Link> : body}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Word cloud */}
          <Section
            title="What you talked about"
            description="Top 50 distinctive words, sized by how much more they appeared in your year vs the rest of the corpus."
          >
            <KeywordCloud words={recap.keywords} limit={50} />
          </Section>

          {/* Latency */}
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reply latency</CardTitle>
                <CardDescription>
                  How fast replies came in. Median them → you {recap.latencyMedians.themToYouSec > 0
                    ? formatLatency(recap.latencyMedians.themToYouSec)
                    : "—"}, you → them {recap.latencyMedians.youToThemSec > 0
                    ? formatLatency(recap.latencyMedians.youToThemSec)
                    : "—"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LatencyHist
                  data={recap.latencyHistThemToYou}
                  title="them → you"
                  tone="primary"
                  median={recap.latencyMedians.themToYouSec > 0 ? formatLatency(recap.latencyMedians.themToYouSec) : undefined}
                />
                <LatencyHist
                  data={recap.latencyHistYouToThem}
                  title="you → them"
                  tone="muted"
                  median={recap.latencyMedians.youToThemSec > 0 ? formatLatency(recap.latencyMedians.youToThemSec) : undefined}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Latency over time</CardTitle>
                <CardDescription>Median monthly reply time, log-scaled.</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.latencyTrend.length >= 2 ? (
                  <LatencyTrend data={recap.latencyTrend} />
                ) : (
                  <p className="text-sm text-muted-foreground">Not enough data for a monthly trend.</p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* New contacts + bookends */}
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>New people in {year}</CardTitle>
                <CardDescription>Sessions where the first message ever was this year.</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.newContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No new contacts in {year}.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {recap.newContacts.slice(0, 16).map((c) => (
                      <li key={c.username} className="flex items-center justify-between gap-3">
                        <Link
                          href={`/contacts/${encodeURIComponent(c.username)}`}
                          className="font-medium hover:underline truncate"
                        >
                          {c.display_name || c.username}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                          <Badge variant="secondary" className="font-normal">{c.chat_type}</Badge>
                          <span className="tabular-nums">
                            {format(new Date(c.first_ts * 1000), "MMM d")}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{fmtNum(c.n)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>First & last message</CardTitle>
                <CardDescription>How the year opened and closed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Bookend label="First" m={recap.firstMessage} />
                <Bookend label="Last" m={recap.lastMessage} />
              </CardContent>
            </Card>
          </section>

          {/* Emoji */}
          {(recap.topEmojiMine.length > 0 || recap.topEmojiTheirs.length > 0) && (
            <section className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Your top emoji</CardTitle>
                </CardHeader>
                <CardContent>
                  <EmojiRow items={recap.topEmojiMine} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Their top emoji</CardTitle>
                </CardHeader>
                <CardContent>
                  <EmojiRow items={recap.topEmojiTheirs} />
                </CardContent>
              </Card>
            </section>
          )}

          {recap.busiestDay && (
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="size-4 text-primary" /> Busiest day: {recap.busiestDay.day}
                </CardTitle>
                <CardDescription>
                  {fmtNum(recap.busiestDay.n)} messages on a single day.{" "}
                  <Link
                    href={`/calendar?year=${year}&day=${recap.busiestDay.day}`}
                    className="underline hover:text-primary"
                  >
                    See the day in the calendar →
                  </Link>
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-center pt-4">
            Computed {format(new Date(recap.computedAt), "PPpp")} · all stats are local to your machine
          </p>
        </>
      )}
    </div>
  );
}

function Delta({
  label,
  current,
  previous,
}: {
  label: string;
  current: number;
  previous: number;
}) {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : null;
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const tone =
    diff > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : diff < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  return (
    <div>
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
      <p className="text-base font-medium tabular-nums">{fmtNum(current)}</p>
      <p className={`text-xs tabular-nums ${tone}`}>
        {arrow} {fmtNum(Math.abs(diff))}
        {pct !== null && (
          <span className="text-muted-foreground"> ({Math.abs(pct).toFixed(0)}%)</span>
        )}
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Hero({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full hover:border-primary/40 transition-colors">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight truncate">{value}</div>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Bookend({
  label,
  m,
}: {
  label: string;
  m: {
    chat_username: string | null;
    chat_display: string;
    sender: string;
    content: string;
    timestamp: number;
  } | null;
}) {
  if (!m) return null;
  return (
    <div className="border-l-2 border-primary/40 pl-3 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-normal">{label}</Badge>
        {m.chat_username ? (
          <Link
            href={`/contacts/${encodeURIComponent(m.chat_username)}`}
            className="font-medium hover:underline text-foreground"
          >
            {m.chat_display}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{m.chat_display}</span>
        )}
        <span>·</span>
        <span>{m.sender || "—"}</span>
        <span>·</span>
        <span className="tabular-nums">{format(new Date(m.timestamp * 1000), "MMM d, HH:mm")}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{m.content || "(no text)"}</p>
    </div>
  );
}

function EmojiRow({ items }: { items: { emoji: string; n: number }[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No emoji.</p>;
  const max = Math.max(...items.map((x) => x.n));
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map((it) => (
        <span
          key={it.emoji}
          className="inline-flex flex-col items-center min-w-12"
          title={`${it.emoji} × ${it.n}`}
          style={{ opacity: 0.4 + (it.n / max) * 0.6 }}
        >
          <span className="text-2xl leading-none">{it.emoji}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums mt-1">{it.n}</span>
        </span>
      ))}
    </div>
  );
}
