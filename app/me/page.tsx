import Link from "next/link";
import { Suspense } from "react";
import { getMeStats, type MeAggregation, type MeTopN, type MeTopRange } from "@/lib/me-stats";
import { getMeFunFacts, type FunFact } from "@/lib/me-fun";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { t, tf, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { LatencyHistogram } from "@/components/charts/latency-histogram";
import { WordCloud } from "@/components/charts/word-cloud";
import { HeroCard } from "@/components/hero-card";
import { formatLatency } from "@/lib/latency";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}
function pct(p: number) {
  return `${p.toFixed(1)}%`;
}

const VALID_AGGS: MeAggregation[] = ["week", "month", "year"];
const VALID_TOP_NS: MeTopN[] = [3, 5, 10];
const VALID_TOP_RANGES: MeTopRange[] = ["all", "1y", "6m", "3m"];

function parseTopN(v: string | undefined): MeTopN {
  const n = Number(v);
  return VALID_TOP_NS.includes(n as MeTopN) ? (n as MeTopN) : 5;
}
function parseTopRange(v: string | undefined): MeTopRange {
  if (VALID_TOP_RANGES.includes(v as MeTopRange)) return v as MeTopRange;
  // Default to the rolling 12 months. "All time" data on a long-lived account
  // is dominated by ancient relationships — `1y` surfaces who's *currently*
  // active. The control still lets the user flip back to `all`.
  return "1y";
}

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{
    agg?: string;
    split?: string;
    topN?: string;
    topRange?: string;
  }>;
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
  const topN = parseTopN(sp.topN);
  const topRange = parseTopRange(sp.topRange);
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const s = getMeStats({ agg, topN, topRange });

  if (!s.hasData) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              {tr("me.noHandlesTitle")}
            </CardTitle>
            <CardDescription>{tr("me.noHandlesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>
              {s.meHandles.length === 0
                ? tr("me.noHandlesEmpty")
                : tf("me.noHandlesUnmatched", locale, { n: s.meHandles.length })}
            </p>
            <p>
              {tr("me.noHandlesOpenSettingsPre")}{" "}
              <Link href="/settings" className="font-medium underline">
                {tr("settings.title")}
              </Link>
              {tr("me.noHandlesOpenSettingsSuffix")}
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
          {tf("me.headerSummary", locale, {
            my: fmt(s.totals.myMessages),
            days: fmt(s.totals.activeDays),
            n: s.meHandles.length,
            plural: locale === "zh" ? "" : s.meHandles.length === 1 ? "" : "s",
          })}{" "}
          {s.meHandles.map((h, i) => (
            <Badge key={i} variant="secondary" className="font-mono ml-1 text-[11px]">
              {h === "" ? "(empty)" : h}
            </Badge>
          ))}
        </p>
      </header>

      {/* Hero stats */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroCard
          size="sm"
          icon={<MessageSquare className="size-4" />}
          label={tr("me.heroMessages")}
          value={fmt(s.totals.myMessages)}
          sub={`${pct(s.totals.mySharePct)} ${tr("me.heroShare")}`}
        />
        <HeroCard
          size="sm"
          icon={<CalendarCheck className="size-4" />}
          label={tr("me.heroActiveDays")}
          value={fmt(s.totals.activeDays)}
          sub={tf("me.heroLongestStreakSub", locale, {
            n: s.totals.longestStreak,
            rate: s.totals.msgsPerActiveDay.toFixed(1),
          })}
        />
        <HeroCard
          size="sm"
          icon={<Clock className="size-4" />}
          label={tr("me.heroPeakHour")}
          value={`${String(s.totals.peakHour).padStart(2, "0")}:00`}
          sub={tf("me.heroPeakHourSub", locale, { n: fmt(s.totals.peakHourCount) })}
        />
        <HeroCard
          size="sm"
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
                <SplitToggle
                  current={splitTheirs}
                  agg={s.agg}
                  topN={topN}
                  topRange={topRange}
                  locale={locale}
                />
                <AggSwitch
                  current={s.agg}
                  split={splitTheirs}
                  topN={topN}
                  topRange={topRange}
                  locale={locale}
                />
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
            <CardTitle>{tr("me.whenYouTalk")}</CardTitle>
            <CardDescription>{tr("me.whenYouTalkDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <HourRadial
              data={s.hourly.map((h) => ({ hour: h.hour, mine: h.mine, theirs: 0 }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("me.byWeekday")}</CardTitle>
            <CardDescription>{tr("me.byWeekdayDesc")}</CardDescription>
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
          <CardTitle>{tr("me.voiceTitle")}</CardTitle>
          <CardDescription>
            {tf("me.voiceSampled", locale, { n: fmt(s.style.sampleSize) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
            <Metric label={tr("contact.metric.avgChars")} value={s.style.avgChars.toFixed(0)} />
            <Metric label={tr("contact.metric.emojiPerMsg")} value={s.style.emojiPerMsg.toFixed(2)} />
            <Metric label={tr("contact.metric.linkRate")} value={s.style.linkPerMsg.toFixed(3)} />
            <Metric
              label={
                <span className="inline-flex items-center gap-1">
                  <Mic className="size-3" /> {tr("contact.metric.voice")}
                </span>
              }
              value={pct(s.style.voiceShare * 100)}
            />
            <Metric
              label={
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="size-3" /> {tr("contact.metric.image")}
                </span>
              }
              value={pct(s.style.imageShare * 100)}
            />
            <Metric
              label={
                <span className="inline-flex items-center gap-1">
                  <Smile className="size-3" /> {tr("contact.metric.sticker")}
                </span>
              }
              value={pct(s.style.stickerShare * 100)}
            />
          </div>
          {s.style.topEmoji.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {tr("me.topEmojiHeading")}
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

      {/* Top chats over time — 2x2 grid: (sent / received) × (private / groups) */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{tr("me.topChatsTitle")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tf("me.topChatsDesc", locale, { unit: unitFor(s.agg, locale) })}
            </p>
          </div>
          <TopChatsToolbar
            agg={agg}
            split={splitTheirs}
            topN={s.topFilters.topN}
            topRange={s.topFilters.range}
            locale={locale}
          />
        </div>
        <section className="grid gap-6 lg:grid-cols-2">
          <TopChatsCard
            title={tr("me.privateSent")}
            desc={tf("me.privateSentDesc", locale, { unit: unitFor(s.agg, locale) })}
            empty={tr("me.privateSentEmpty")}
            chats={s.topPrivate}
            series={s.topPrivateSeries}
            metric="my_msgs"
            locale={locale}
          />
          <TopChatsCard
            title={tr("me.privateReceived")}
            desc={tf("me.privateReceivedDesc", locale, { unit: unitFor(s.agg, locale) })}
            empty={tr("me.privateReceivedEmpty")}
            chats={s.topPrivateReceived}
            series={s.topPrivateReceivedSeries}
            metric="theirs"
            locale={locale}
          />
          <TopChatsCard
            title={tr("me.groupsSent")}
            desc={tf("me.groupsSentDesc", locale, { unit: unitFor(s.agg, locale) })}
            empty={tr("me.groupsSentEmpty")}
            chats={s.topGroups}
            series={s.topGroupSeries}
            metric="my_msgs"
            showMembers
            locale={locale}
          />
          <TopChatsCard
            title={tr("me.groupsReceived")}
            desc={tf("me.groupsReceivedDesc", locale, { unit: unitFor(s.agg, locale) })}
            empty={tr("me.groupsReceivedEmpty")}
            chats={s.topGroupsReceived}
            series={s.topGroupReceivedSeries}
            metric="theirs"
            showMembers
            locale={locale}
          />
        </section>
      </section>

      {/* Reply latency */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("me.replyTitle")}</CardTitle>
          <CardDescription>
            {s.latency.sampleSize > 0
              ? tf("me.replyDesc", locale, {
                  n: fmt(s.latency.sampleSize),
                  you:
                    s.latency.meToThemMedianSec > 0
                      ? formatLatency(s.latency.meToThemMedianSec)
                      : "—",
                  them:
                    s.latency.themToMeMedianSec > 0
                      ? formatLatency(s.latency.themToMeMedianSec)
                      : "—",
                })
              : tr("me.replyEmpty")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {s.latency.sampleSize > 0 && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{tr("me.youToThem")}</p>
                <LatencyHistogram
                  data={s.latency.meToThemHist.map((b) => ({ label: b.label, n: b.n }))}
                  tone="primary"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{tr("me.themToYou")}</p>
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
            <CardTitle>{tr("me.topicsTitle")}</CardTitle>
            <CardDescription>
              {tf("me.topicsDesc", locale, { n: s.topics.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.topics.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("me.topicsEmpty")}</p>
            ) : (
              <WordCloud words={s.topics} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("me.whatYouSend")}</CardTitle>
            <CardDescription>{tr("me.whatYouSendDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {s.msgTypeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("contact.msgTypesEmpty")}</p>
            ) : (
              <Donut
                centerLabel={{ title: tr("me.donutCenterYours"), value: fmt(s.totals.myMessages) }}
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
            <CardTitle>{tr("me.linksTitle")}</CardTitle>
            <CardDescription>{tr("me.linksDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {s.topDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("me.linksEmpty")}</p>
            ) : (
              <DomainList rows={s.topDomains} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              {tr("me.shoutingTitle")}
            </CardTitle>
            <CardDescription>
              {s.oneSided.totalCount > 0
                ? tf("me.shoutingDesc", locale, { n: fmt(s.oneSided.totalCount) })
                : tr("me.shoutingNone")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.oneSided.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("me.shoutingEmpty")}</p>
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
                      {tf("me.yoursTheirs", locale, {
                        mine: fmt(r.my_msgs),
                        theirs: fmt(r.theirs),
                      })}
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
              <Trophy className="size-4 text-primary" /> {tr("me.longestTitle")}
            </CardTitle>
            <CardDescription>{tr("me.longestDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {s.longestMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("me.longestEmpty")}</p>
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
                        {fmt(m.len)} {tr("me.chars")}
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
                <Flame className="size-4 text-primary" /> {tr("me.burstTitle")}
              </CardTitle>
              <CardDescription>
                {tf("me.burstDesc", locale, { n: fmt(s.burst.n) })}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <span className="text-muted-foreground">{tr("me.where")}:</span>{" "}
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
                <span className="text-muted-foreground">{tr("me.when")}:</span>{" "}
                <span className="font-mono tabular-nums">{s.burst.minute}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Did you know — dense info grid. Slow query mix; suspend so the rest
          of the page paints first and this fills in. */}
      <Suspense fallback={<FunFactsSkeleton locale={locale} />}>
        <FunFactsPanel locale={locale} />
      </Suspense>
    </div>
  );
}

async function FunFactsPanel({ locale }: { locale: "en" | "zh" }) {
  // Same micro-yield trick as the contact-detail page: a single setImmediate
  // lets React stream the page's parent tree + this boundary's fallback
  // before our synchronous SQL kicks off.
  await new Promise((r) => setImmediate(r));
  const facts = getMeFunFacts();
  const tr = (k: TKey) => t(k, locale);
  if (!facts.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tr("fun.title")}</CardTitle>
          <CardDescription>{tr("fun.empty")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> {tr("fun.title")}
        </CardTitle>
        <CardDescription>{tr("fun.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FunFactGroup heading={tr("fun.section.time")} facts={facts.timeMarkers} locale={locale} />
        <FunFactGroup heading={tr("fun.section.people")} facts={facts.interactions} locale={locale} />
        <FunFactGroup heading={tr("fun.section.records")} facts={facts.records} locale={locale} />
        <FunFactGroup heading={tr("fun.section.scope")} facts={facts.scope} locale={locale} />
      </CardContent>
    </Card>
  );
}

function FunFactGroup({
  heading,
  facts,
  locale,
}: {
  heading: string;
  facts: FunFact[];
  locale: "en" | "zh";
}) {
  if (facts.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {heading}
      </p>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((f) => (
          <FactRow key={f.key} fact={f} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function FactRow({ fact: f, locale }: { fact: FunFact; locale: "en" | "zh" }) {
  // Translate the label by key; values + subs stay as-rendered (they're
  // already concrete strings with names/dates/numbers in them).
  const label = t(f.key as TKey, locale);
  const inner = (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className="text-sm font-medium tabular-nums break-words leading-snug">{f.value}</p>
      {f.sub && (
        <p className="text-[11px] text-muted-foreground tabular-nums leading-snug">{f.sub}</p>
      )}
    </div>
  );
  if (f.href) {
    return (
      <Link
        href={f.href}
        className="block rounded-md px-2 -mx-2 py-1.5 hover:bg-accent/40 transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return <div className="px-2 -mx-2 py-1.5">{inner}</div>;
}

function FunFactsSkeleton({ locale }: { locale: "en" | "zh" }) {
  const tr = (k: TKey) => t(k, locale);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> {tr("fun.title")}
        </CardTitle>
        <CardDescription>{tr("fun.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {[0, 1, 2, 3].map((g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-2.5 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function meHref(
  agg: MeAggregation,
  split: boolean,
  topN: MeTopN = 5,
  topRange: MeTopRange = "all",
): string {
  const qs = new URLSearchParams();
  if (agg !== "month") qs.set("agg", agg);
  if (split) qs.set("split", "1");
  if (topN !== 5) qs.set("topN", String(topN));
  if (topRange !== "all") qs.set("topRange", topRange);
  const str = qs.toString();
  return str ? `/me?${str}` : "/me";
}

function AggSwitch({
  current,
  split,
  topN,
  topRange,
  locale,
}: {
  current: MeAggregation;
  split: boolean;
  topN: MeTopN;
  topRange: MeTopRange;
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
          href={meHref(o.key, split, topN, topRange)}
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
  topN,
  topRange,
  locale,
}: {
  current: boolean;
  agg: MeAggregation;
  topN: MeTopN;
  topRange: MeTopRange;
  locale: "en" | "zh";
}) {
  const tr = (k: TKey) => t(k, locale);
  // Sits next to AggSwitch — same visual idiom. Toggles whether `theirs` is
  // shown as one line or split by chat_type (private + group).
  const opts: { key: boolean; label: string; title: string }[] = [
    {
      key: false,
      label: tr("common.combined"),
      title: tr("me.combinedTooltipOn"),
    },
    {
      key: true,
      label: tr("common.splitByType"),
      title: tr("me.splitTooltipOn"),
    },
  ];
  return (
    <div className="inline-flex rounded-md border border-border/60 p-[2px] text-xs">
      {opts.map((o) => (
        <Link
          key={String(o.key)}
          href={meHref(agg, o.key, topN, topRange)}
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
  /** Which column to lead with — "my_msgs" or "theirs". Drives the big number
   *  on each row; the muted slash-total stays the same either way. */
  metric = "my_msgs",
  locale,
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
  metric?: "my_msgs" | "theirs";
  locale: "en" | "zh";
}) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground select-none">
        {tf("me.fullRanking", locale, { n: rows.length })}
      </summary>
      <ol className="mt-2 space-y-0.5">
        {rows.map((r, i) => {
          const headline = metric === "my_msgs" ? r.my_msgs : r.theirs;
          return (
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
                  {headline.toLocaleString()}
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
          );
        })}
      </ol>
    </details>
  );
}

/**
 * Top-chats card wrapper. Renders one MultiLine + a CompactRanking together,
 * accepting either the sent or received series + metric so all four cards
 * stay symmetric.
 */
function TopChatsCard({
  title,
  desc,
  empty,
  chats,
  series,
  metric,
  showMembers,
  locale,
}: {
  title: string;
  desc: string;
  empty: string;
  chats: {
    username: string;
    display_name: string;
    my_msgs: number;
    total: number;
    theirs: number;
    member_count: number | null;
    last_ts: number | null;
  }[];
  series: { chats: { username: string; display_name: string }[]; points: Record<string, number | string>[] };
  metric: "my_msgs" | "theirs";
  showMembers?: boolean;
  locale: "en" | "zh";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {series.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <MultiLine
            data={series.points}
            series={series.chats.map((c) => ({
              key: c.username,
              label: c.display_name || c.username,
            }))}
          />
        )}
        {chats.length > 0 && (
          <CompactRanking
            rows={chats}
            showMembers={showMembers}
            metric={metric}
            locale={locale}
          />
        )}
      </CardContent>
    </Card>
  );
}

function unitFor(agg: MeAggregation, locale: "en" | "zh"): string {
  if (agg === "week") return t("me.unitWeek", locale);
  if (agg === "year") return t("me.unitYear", locale);
  return t("me.unitMonth", locale);
}

/**
 * Toolbar above the top-chats grid. Three independent dimensions:
 * - Top N: 3 / 5 / 10 rows per panel
 * - Range: lifetime / 1y / 6m / 3m (affects both ranking + chart window)
 *
 * Aggregation (Week / Month / Year) is shared with the activity-over-time
 * chart's switcher above, so we don't duplicate it here.
 */
function TopChatsToolbar({
  agg,
  split,
  topN,
  topRange,
  locale,
}: {
  agg: MeAggregation;
  split: boolean;
  topN: MeTopN;
  topRange: MeTopRange;
  locale: "en" | "zh";
}) {
  const buildHref = (patch: { topN?: MeTopN; topRange?: MeTopRange }): string => {
    const next = new URLSearchParams();
    if (agg !== "month") next.set("agg", agg);
    if (split) next.set("split", "1");
    const nextN = patch.topN ?? topN;
    if (nextN !== 5) next.set("topN", String(nextN));
    const nextR = patch.topRange ?? topRange;
    if (nextR !== "all") next.set("topRange", nextR);
    const qs = next.toString();
    return qs ? `/me?${qs}` : "/me";
  };
  const tr = (k: TKey) => t(k, locale);
  const topNOpts: MeTopN[] = [3, 5, 10];
  const rangeOpts: { key: MeTopRange; label: string }[] = [
    { key: "all", label: tr("me.rangeAll") },
    { key: "1y", label: tr("me.range1y") },
    { key: "6m", label: tr("me.range6m") },
    { key: "3m", label: tr("me.range3m") },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <div className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">{tr("me.toolbarTop")}</span>
        <div className="inline-flex rounded-md border border-border/60 p-[2px]">
          {topNOpts.map((n) => (
            <Link
              key={n}
              href={buildHref({ topN: n })}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                topN === n
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n}
            </Link>
          ))}
        </div>
      </div>
      <div className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">{tr("me.toolbarRange")}</span>
        <div className="inline-flex rounded-md border border-border/60 p-[2px]">
          {rangeOpts.map((o) => (
            <Link
              key={o.key}
              href={buildHref({ topRange: o.key })}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                topRange === o.key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
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
