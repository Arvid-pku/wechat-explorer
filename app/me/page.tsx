import Link from "next/link";
import { getMeStats, type MeAggregation } from "@/lib/me-stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  MessageSquare,
  Clock,
  Flame,
  CalendarCheck,
  ArrowUpRight,
  Mic,
  Image as ImageIcon,
  Smile,
  LinkIcon,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { format } from "date-fns";
import {
  Donut,
  VerticalBars,
  TwoSeriesLine,
  HourRadial,
  MultiLine,
} from "@/components/charts/stats/charts";
import type { MeTimePoint } from "@/lib/me-stats";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { LatencyHistogram } from "@/components/charts/latency-histogram";
import { WordCloud } from "@/components/charts/word-cloud";
import { formatLatency } from "@/lib/latency";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}
function pct(p: number) {
  return `${p.toFixed(1)}%`;
}

const VALID_AGGS: MeAggregation[] = ["week", "month", "year"];

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ agg?: string; split?: string }>;
}) {
  const sp = await searchParams;
  const agg: MeAggregation =
    sp.agg && (VALID_AGGS as string[]).includes(sp.agg)
      ? (sp.agg as MeAggregation)
      : "month";
  // `?split=1` flips the "Your messages over time" chart from 2 lines
  // (you / them) to 3 lines (you / them-private / them-group). The split data
  // is always computed in me-stats; this param only toggles which series the
  // chart renders.
  const splitTheirs = sp.split === "1";
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const s = getMeStats({ agg });

  if (!s.hasData) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              Your me-handles aren&apos;t set yet
            </CardTitle>
            <CardDescription>
              This page summarises messages you sent. Without knowing which sender
              name(s) are you, every metric reads zero.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>
              {s.meHandles.length === 0
                ? "No me-handles are configured."
                : `You have ${s.meHandles.length} me-handle(s) but none of them match any messages.`}
            </p>
            <p>
              Open{" "}
              <Link href="/settings" className="font-medium underline">
                Settings
              </Link>
              , scroll to <em>Chat hygiene</em>, and either click{" "}
              <span className="font-medium">Re-detect</span> or set them
              manually.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {tr("me.eyebrow")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> {tr("me.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {fmt(s.totals.myMessages)} messages from you across {fmt(s.totals.activeDays)}{" "}
          active days. Identified by {s.meHandles.length} handle
          {s.meHandles.length === 1 ? "" : "s"}:{" "}
          {s.meHandles.map((h, i) => (
            <Badge key={i} variant="secondary" className="font-mono ml-1 text-[11px]">
              {h === "" ? "(empty)" : h}
            </Badge>
          ))}
        </p>
      </header>

      {/* Hero stats */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Hero
          icon={<MessageSquare className="size-4" />}
          label={tr("me.heroMessages")}
          value={fmt(s.totals.myMessages)}
          sub={`${pct(s.totals.mySharePct)} ${tr("me.heroShare")}`}
        />
        <Hero
          icon={<CalendarCheck className="size-4" />}
          label={tr("me.heroActiveDays")}
          value={fmt(s.totals.activeDays)}
          sub={
            locale === "zh"
              ? `最长连续 ${s.totals.longestStreak} 天 · 活跃日均 ${s.totals.msgsPerActiveDay.toFixed(1)} 条`
              : `Longest streak ${s.totals.longestStreak}d · ${s.totals.msgsPerActiveDay.toFixed(1)} msgs/day on active days`
          }
        />
        <Hero
          icon={<Clock className="size-4" />}
          label={tr("me.heroPeakHour")}
          value={`${String(s.totals.peakHour).padStart(2, "0")}:00`}
          sub={
            locale === "zh"
              ? `这一小时共发出 ${fmt(s.totals.peakHourCount)} 条`
              : `${fmt(s.totals.peakHourCount)} messages sent in that hour`
          }
        />
        <Hero
          icon={<Flame className="size-4" />}
          label={tr("me.heroMedianReply")}
          value={
            s.latency.meToThemMedianSec > 0
              ? formatLatency(s.latency.meToThemMedianSec)
              : "—"
          }
          sub={
            s.latency.themToMeMedianSec > 0
              ? `${tr("me.heroTheirReply")}: ${formatLatency(s.latency.themToMeMedianSec)}`
              : tr("me.heroNoLatency")
          }
        />
      </section>

      {/* Year-over-year strip — rolling 365d window vs the prior 365d. */}
      {s.yoy.myMessagesPrior > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr("me.vsLastYear")}</CardTitle>
            <CardDescription>
              {s.yoy.reliable
                ? `${tr("me.vsLastYearDesc")} ${fmt(s.yoy.myMessages)} ${locale === "zh" ? "条" : "sent vs"} ${fmt(s.yoy.myMessagesPrior)} ${locale === "zh" ? "（去年同期）。" : "the year before."}`
                : tr("me.vsLastYearUnreliable")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <YoYStat
                label={tr("me.heroMessages")}
                current={s.yoy.myMessages}
                prior={s.yoy.myMessagesPrior}
              />
              <YoYStat
                label={tr("me.theirMessages")}
                current={Math.max(0, s.yoy.totalMessages - s.yoy.myMessages)}
                prior={Math.max(0, s.yoy.totalMessagesPrior - s.yoy.myMessagesPrior)}
              />
              <YoYStat
                label={tr("me.yourShare")}
                current={s.yoy.mySharePct}
                prior={s.yoy.mySharePctPrior}
                kind="pct"
              />
              <YoYStat
                label={tr("me.heroActiveDays")}
                current={s.yoy.activeDays}
                prior={s.yoy.activeDaysPrior}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity over time with agg switcher */}
      {s.series.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>{tr("me.overTimeTitle")}</CardTitle>
                <CardDescription>
                  {(() => {
                    const unit = tr(
                      s.agg === "week"
                        ? "common.week"
                        : s.agg === "year"
                          ? "common.year"
                          : "common.month",
                    );
                    return splitTheirs
                      ? `${tr("me.overTimeThree")} ${unit}.`
                      : `${tr("me.overTimeTwo")} ${unit}.`;
                  })()}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SplitToggle current={splitTheirs} agg={s.agg} locale={locale} />
                <AggSwitch current={s.agg} split={splitTheirs} locale={locale} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {splitTheirs ? (
              <ThemActivityChart series={s.series} locale={locale} />
            ) : (
              <TwoSeriesLine
                data={s.series.map((p) => ({ label: p.label, a: p.mine, b: p.theirs }))}
                seriesLabels={[tr("common.you"), tr("common.them")]}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* When + what */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>When you talk</CardTitle>
            <CardDescription>
              Hour-of-day pattern. Look for sleep windows and the late-night spike.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HourRadial
              data={s.hourly.map((h) => ({ hour: h.hour, mine: h.mine, theirs: 0 }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By weekday</CardTitle>
            <CardDescription>
              Does the weekend look like the workweek for you?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars
              data={s.dow.map((d) => ({ label: d.label, value: d.mine }))}
              height={240}
            />
          </CardContent>
        </Card>
      </section>

      {/* Style fingerprint */}
      <Card>
        <CardHeader>
          <CardTitle>Your voice fingerprint</CardTitle>
          <CardDescription>
            Sampled across your most recent {fmt(s.style.sampleSize)} messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
            <Metric label="Avg chars / text" value={s.style.avgChars.toFixed(0)} />
            <Metric label="Emoji / text" value={s.style.emojiPerMsg.toFixed(2)} />
            <Metric label="Link rate" value={s.style.linkPerMsg.toFixed(3)} />
            <Metric
              label={
                <span className="inline-flex items-center gap-1">
                  <Mic className="size-3" /> Voice
                </span>
              }
              value={pct(s.style.voiceShare * 100)}
            />
            <Metric
              label={
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="size-3" /> Image
                </span>
              }
              value={pct(s.style.imageShare * 100)}
            />
            <Metric
              label={
                <span className="inline-flex items-center gap-1">
                  <Smile className="size-3" /> Sticker
                </span>
              }
              value={pct(s.style.stickerShare * 100)}
            />
          </div>
          {s.style.topEmoji.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Top emoji from you
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.style.topEmoji.map((e) => (
                  <span
                    key={e.emoji}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-base"
                    title={`${e.emoji} × ${e.n}`}
                  >
                    <span>{e.emoji}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {e.n}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top chats over time */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who you message most (1:1)</CardTitle>
            <CardDescription>
              Top 5 private chats — your sends per{" "}
              {s.agg === "week" ? "week" : s.agg === "year" ? "year" : "month"}.
              Switch the aggregation above. Full top-10 listed below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.topPrivateSeries.points.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No private chats yet — try a deep index.
              </p>
            ) : (
              <MultiLine
                data={s.topPrivateSeries.points}
                series={s.topPrivateSeries.chats.map((c) => ({
                  key: c.username,
                  label: c.display_name || c.username,
                }))}
              />
            )}
            {s.topPrivate.length > 0 && <CompactRanking rows={s.topPrivate} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Groups you contribute to most</CardTitle>
            <CardDescription>
              Top 5 groups — your sends per{" "}
              {s.agg === "week" ? "week" : s.agg === "year" ? "year" : "month"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.topGroupSeries.points.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No groups indexed for you yet.
              </p>
            ) : (
              <MultiLine
                data={s.topGroupSeries.points}
                series={s.topGroupSeries.chats.map((c) => ({
                  key: c.username,
                  label: c.display_name || c.username,
                }))}
              />
            )}
            {s.topGroups.length > 0 && (
              <CompactRanking rows={s.topGroups} showMembers />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Reply latency */}
      <Card>
        <CardHeader>
          <CardTitle>How you reply</CardTitle>
          <CardDescription>
            {s.latency.sampleSize > 0 ? (
              <>
                Based on {fmt(s.latency.sampleSize)} alternating-side reply pairs
                (capped to the last 200k messages). Median you → them{" "}
                {s.latency.meToThemMedianSec > 0
                  ? formatLatency(s.latency.meToThemMedianSec)
                  : "—"}{" "}
                · them → you{" "}
                {s.latency.themToMeMedianSec > 0
                  ? formatLatency(s.latency.themToMeMedianSec)
                  : "—"}
                .
              </>
            ) : (
              "Not enough back-and-forth in your indexed history."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {s.latency.sampleSize > 0 && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">You → them</p>
                <LatencyHistogram
                  data={s.latency.meToThemHist.map((b) => ({ label: b.label, n: b.n }))}
                  tone="primary"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Them → you</p>
                <LatencyHistogram
                  data={s.latency.themToMeHist.map((b) => ({ label: b.label, n: b.n }))}
                  tone="muted"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Topics + msg type + domains */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What you talk about</CardTitle>
            <CardDescription>
              Top {s.topics.length} TF-IDF words from your text vs everyone
              else&apos;s. Click to search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.topics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough text from you to score topics yet.
              </p>
            ) : (
              <WordCloud words={s.topics} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What you send</CardTitle>
            <CardDescription>Message-type mix on your side.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.msgTypeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <Donut
                centerLabel={{ title: "yours", value: fmt(s.totals.myMessages) }}
                data={s.msgTypeBreakdown.slice(0, 8).map((r) => ({
                  name: r.msg_type || "—",
                  value: r.n,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Links you share</CardTitle>
            <CardDescription>Top domain groups in URLs you sent.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.topDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links from you yet.</p>
            ) : (
              <DomainList rows={s.topDomains} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              Shouting into the void
            </CardTitle>
            <CardDescription>
              {s.oneSided.totalCount > 0 ? (
                <>
                  {fmt(s.oneSided.totalCount)} private chats where you sent ≥ 5
                  messages but got ≤ 1 reply back. Showing the heaviest.
                </>
              ) : (
                "No one-sided private chats — every conversation has had a reply."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.oneSided.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.oneSided.rows.map((r) => (
                  <li
                    key={r.username}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link
                      href={`/contacts/${encodeURIComponent(r.username)}`}
                      className="font-medium hover:underline truncate"
                    >
                      {r.display_name || r.username}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {fmt(r.my_msgs)} yours · {fmt(r.theirs)} theirs
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Records */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-primary" /> Longest things you sent
            </CardTitle>
            <CardDescription>Top 5 text essays.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.longestMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No long text messages.</p>
            ) : (
              <ul className="space-y-3">
                {s.longestMessages.map((m) => (
                  <li key={m.id} className="rounded-md border border-border/40 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      {m.chat_username ? (
                        <Link
                          href={`/messages/${m.id}`}
                          className="font-medium hover:underline truncate"
                          title={m.chat_display}
                        >
                          {m.chat_display}
                        </Link>
                      ) : (
                        <span className="font-medium truncate">{m.chat_display}</span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {fmt(m.len)} chars
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">
                      {m.preview}…
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                      {format(new Date(m.timestamp * 1000), "MMM d, yyyy HH:mm")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {s.burst && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="size-4 text-primary" /> Most messages in 1 minute
              </CardTitle>
              <CardDescription>
                You sent {fmt(s.burst.n)} messages within a single minute.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <span className="text-muted-foreground">Where:</span>{" "}
                {s.burst.chat_username ? (
                  <Link
                    href={`/contacts/${encodeURIComponent(s.burst.chat_username)}`}
                    className="font-medium hover:underline"
                  >
                    {s.burst.chat_display}
                  </Link>
                ) : (
                  <span className="font-medium">{s.burst.chat_display}</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">When:</span>{" "}
                <span className="font-mono tabular-nums">{s.burst.minute}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function meHref(agg: MeAggregation, split: boolean): string {
  const qs = new URLSearchParams();
  if (agg !== "month") qs.set("agg", agg);
  if (split) qs.set("split", "1");
  const str = qs.toString();
  return str ? `/me?${str}` : "/me";
}

function AggSwitch({
  current,
  split,
  locale,
}: {
  current: MeAggregation;
  split: boolean;
  locale: "en" | "zh";
}) {
  const tr = (k: TKey) => t(k, locale);
  const opts: { key: MeAggregation; label: string }[] = [
    { key: "week", label: tr("common.week") },
    { key: "month", label: tr("common.month") },
    { key: "year", label: tr("common.year") },
  ];
  return (
    <div className="inline-flex rounded-md border border-border/60 p-[2px] text-xs">
      {opts.map((o) => (
        <Link
          key={o.key}
          href={meHref(o.key, split)}
          className={`rounded px-2.5 py-1 font-medium transition-colors ${
            current === o.key
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function SplitToggle({
  current,
  agg,
  locale,
}: {
  current: boolean;
  agg: MeAggregation;
  locale: "en" | "zh";
}) {
  const tr = (k: TKey) => t(k, locale);
  // Sits next to AggSwitch — same visual idiom. Toggles whether `theirs` is
  // shown as one line or split by chat_type (private + group).
  const opts: { key: boolean; label: string; title: string }[] = [
    {
      key: false,
      label: tr("common.combined"),
      title: locale === "zh" ? "对方消息合并为一条线" : "Show all of their messages as a single line",
    },
    {
      key: true,
      label: tr("common.splitByType"),
      title: locale === "zh" ? "把对方消息拆分为私聊和群聊" : "Break out their messages into private chats vs groups",
    },
  ];
  return (
    <div className="inline-flex rounded-md border border-border/60 p-[2px] text-xs">
      {opts.map((o) => (
        <Link
          key={String(o.key)}
          href={meHref(agg, o.key)}
          title={o.title}
          className={`rounded px-2.5 py-1 font-medium transition-colors ${
            current === o.key
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function ThemActivityChart({
  series,
  locale,
}: {
  series: MeTimePoint[];
  locale: "en" | "zh";
}) {
  const tr = (k: TKey) => t(k, locale);
  // 3-line view: you / their private / their group. `theirsOther` (NULL
  // chat_username, official, folded — usually < 1% of volume) is folded into
  // the tooltip via title but kept off the chart for legibility.
  return (
    <MultiLine
      data={series.map((p) => ({
        label: p.label,
        you: p.mine,
        them_private: p.theirsPrivate,
        them_group: p.theirsGroup,
      }))}
      series={[
        { key: "you", label: tr("common.you") },
        { key: "them_private", label: `${tr("common.them")} · ${tr("common.private")}` },
        { key: "them_group", label: `${tr("common.them")} · ${tr("common.groups")}` },
      ]}
    />
  );
}

function Hero({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function YoYStat({
  label,
  current,
  prior,
  kind = "count",
}: {
  label: string;
  current: number;
  prior: number;
  kind?: "count" | "pct";
}) {
  // For percentages the "delta" is in absolute pp (percentage-points). For raw
  // counts it's a relative percent — same display logic, different units.
  const delta = kind === "pct" ? current - prior : prior > 0 ? ((current - prior) / prior) * 100 : 0;
  const arrow = delta > 0.5 ? "▲" : delta < -0.5 ? "▼" : "·";
  const tone =
    delta > 0.5
      ? "text-emerald-600 dark:text-emerald-400"
      : delta < -0.5
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  const valueDisplay =
    kind === "pct" ? `${current.toFixed(1)}%` : new Intl.NumberFormat("en").format(current);
  const priorDisplay =
    kind === "pct" ? `${prior.toFixed(1)}%` : new Intl.NumberFormat("en").format(prior);
  const deltaDisplay =
    kind === "pct"
      ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`
      : prior > 0
        ? `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`
        : "—";
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{valueDisplay}</p>
      <p className={`text-xs ${tone} tabular-nums inline-flex items-center gap-1`}>
        <span aria-hidden>{arrow}</span>
        <span>{deltaDisplay}</span>
        <span className="text-muted-foreground/70">(was {priorDisplay})</span>
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

function CompactRanking({
  rows,
  showMembers,
}: {
  rows: {
    username: string;
    display_name: string;
    my_msgs: number;
    total: number;
    theirs: number;
    member_count: number | null;
  }[];
  showMembers?: boolean;
}) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground select-none">
        Show full top-{rows.length} ranking
      </summary>
      <ol className="mt-2 space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.username}>
            <Link
              href={`/contacts/${encodeURIComponent(r.username)}`}
              className="grid grid-cols-[1.5rem_1fr_auto] gap-2 items-center rounded px-1.5 py-1 hover:bg-accent/60"
            >
              <span className="tabular-nums">{i + 1}.</span>
              <span className="truncate group-hover:text-primary text-foreground/80">
                {r.display_name || r.username}
              </span>
              <span className="tabular-nums whitespace-nowrap">
                {r.my_msgs.toLocaleString()}
                {r.total > 0 && (
                  <span className="text-muted-foreground/60">
                    {" / "}
                    {r.total.toLocaleString()}
                  </span>
                )}
                {showMembers && r.member_count != null && (
                  <span className="text-muted-foreground/60 ml-1">
                    · {r.member_count}m
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </details>
  );
}

// (ChatRanking was a never-used leftover from an earlier draft of /me — the
// MultiLine + CompactRanking pair above replaced it.)

function DomainList({ rows }: { rows: { domain_group: string; n: number }[] }) {
  const max = rows.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <Link
          key={r.domain_group}
          href={`/links/${encodeURIComponent(r.domain_group)}`}
          className="group block rounded px-1.5 py-1 hover:bg-accent/60 transition-colors"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="truncate group-hover:text-primary inline-flex items-center gap-1.5">
              <LinkIcon className="size-3 text-muted-foreground" />
              {r.domain_group}
            </span>
            <span className="text-muted-foreground tabular-nums text-xs">
              {r.n.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary/70 group-hover:bg-primary"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
