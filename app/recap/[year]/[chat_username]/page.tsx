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
import { ArrowLeft, Download, Sparkles, Calendar } from "lucide-react";
import { getYearRecap, getRecapYears } from "@/lib/recap";
import { formatLatency } from "@/lib/latency";
import { MonthlyBars } from "@/components/charts/recap/monthly-bars";
import { HourlyGrid } from "@/components/charts/recap/hourly-grid";
import { LatencyHist, LatencyTrend } from "@/components/charts/recap/latency-hist";
import { KeywordCloud } from "@/components/charts/recap/keyword-cloud";
import { HorizontalBars } from "@/components/charts/recap/horizontal-bars";
import { t, tf, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const DOMAIN_LABELS: Record<string, string> = {
  "wechat-article": "公众号文章",
  wechat: "Weixin (其他)",
  xiaohongshu: "小红书",
  bilibili: "B 站",
  zhihu: "知乎",
  arxiv: "arXiv",
  github: "GitHub",
};

function fmtNum(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function ChatRecapPage({
  params,
}: {
  params: Promise<{ year: string; chat_username: string }>;
}) {
  const { year: yStr, chat_username } = await params;
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const year = parseInt(yStr, 10);
  if (!Number.isFinite(year)) return notFound();
  const username = decodeURIComponent(chat_username);
  const recap = getYearRecap(year, username);
  const knownYears = getRecapYears();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-10">
      <header className="space-y-3">
        <Link
          href={`/contacts/${encodeURIComponent(username)}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 mr-1" /> {tr("recap.backToContact")}
        </Link>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {tr("recap.eyebrowChat")} · {recap.scopeDisplay ?? username}
            </p>
            <h1 className="text-5xl font-semibold tracking-tight mt-1">{year}</h1>
            {!recap.ok && (
              <p className="text-sm text-muted-foreground mt-2">
                {tf("recap.noChatMessages", locale, { year })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {knownYears.slice(0, 6).map((y) => (
              <Link
                key={y}
                href={`/recap/${y}/${encodeURIComponent(username)}`}
                className={`rounded-md border border-border/60 px-3 py-1 text-sm hover:bg-accent ${
                  y === year ? "bg-accent" : "text-muted-foreground"
                }`}
              >
                {y}
              </Link>
            ))}
            <a
              href={`/api/recap/${year}/export?chat=${encodeURIComponent(username)}`}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Download className="size-3.5" />
              {tr("recap.html")}
            </a>
          </div>
        </div>
      </header>

      {!recap.ok ? null : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Hero
              label={tr("recap.hero.messages")}
              value={fmtNum(recap.totals.messages)}
              sub={tf("recap.hero.messagesSub", locale, {
                mine: fmtNum(recap.totals.mine),
                theirs: fmtNum(recap.totals.theirs),
              })}
            />
            <Hero
              label={tr("recap.hero.activeDays")}
              value={`${recap.totals.days}`}
              sub={tr("recap.hero.activeDaysSub")}
            />
            <Hero
              label={tr("recap.hero.longestStreak")}
              value={`${recap.totals.longestStreak}d`}
              sub={tf("recap.hero.longestStreakSub", locale, { n: recap.totals.longestDryStreak })}
            />
            <Hero
              label={tr("recap.hero.medianReply")}
              value={
                recap.latencyMedians.themToYouSec > 0
                  ? formatLatency(recap.latencyMedians.themToYouSec)
                  : "—"
              }
              sub={tf("recap.hero.medianReplySub", locale, {
                you:
                  recap.latencyMedians.youToThemSec > 0
                    ? formatLatency(recap.latencyMedians.youToThemSec)
                    : "—",
              })}
            />
          </section>

          <Section
            title={tr("recap.yearOfMessages")}
            description={tr("recap.yearOfMessagesDesc")}
          >
            <div className="overflow-x-auto">
              <MonthlyBars data={recap.monthly} />
            </div>
          </Section>

          <Section title={tr("recap.hourPattern")} description={tr("recap.hourPatternDesc")}>
            <HourlyGrid data={recap.hourly} />
          </Section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tr("recap.topLinksChatTitle")}</CardTitle>
                <CardDescription>{tr("recap.topLinksChatDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.topDomains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr("recap.topLinksEmpty")}</p>
                ) : (
                  <HorizontalBars
                    rows={recap.topDomains.map((d) => ({
                      label: DOMAIN_LABELS[d.domain_group] ?? d.domain_group,
                      sub: d.domain_group,
                      n: d.n,
                      href: `/links/${encodeURIComponent(d.domain_group)}`,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{tr("recap.recordsTitle")}</CardTitle>
                <CardDescription>{tr("recap.recordsChatDesc")}</CardDescription>
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

          <Section
            title={tr("recap.whatYouTalked")}
            description={tr("recap.whatChatTalkedDesc")}
          >
            <KeywordCloud words={recap.keywords} limit={50} />
          </Section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tr("recap.replyLatency")}</CardTitle>
                <CardDescription>
                  {tf("recap.replyLatencyChatDesc", locale, {
                    them:
                      recap.latencyMedians.themToYouSec > 0
                        ? formatLatency(recap.latencyMedians.themToYouSec)
                        : "—",
                    you:
                      recap.latencyMedians.youToThemSec > 0
                        ? formatLatency(recap.latencyMedians.youToThemSec)
                        : "—",
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LatencyHist
                  data={recap.latencyHistThemToYou}
                  title={tr("recap.themToYou")}
                  tone="primary"
                  median={recap.latencyMedians.themToYouSec > 0 ? formatLatency(recap.latencyMedians.themToYouSec) : undefined}
                />
                <LatencyHist
                  data={recap.latencyHistYouToThem}
                  title={tr("recap.youToThem")}
                  tone="muted"
                  median={recap.latencyMedians.youToThemSec > 0 ? formatLatency(recap.latencyMedians.youToThemSec) : undefined}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{tr("recap.latencyOverTimeTitle")}</CardTitle>
                <CardDescription>{tr("recap.latencyOverTimeChatDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.latencyTrend.length >= 2 ? (
                  <LatencyTrend data={recap.latencyTrend} />
                ) : (
                  <p className="text-sm text-muted-foreground">{tr("recap.latencyTrendChatEmpty")}</p>
                )}
              </CardContent>
            </Card>
          </section>

          {(recap.topEmojiMine.length > 0 || recap.topEmojiTheirs.length > 0) && (
            <section className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{tr("recap.topEmojiYours")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <EmojiRow items={recap.topEmojiMine} emptyText={tr("recap.noEmoji")} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{tr("recap.topEmojiTheirs")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <EmojiRow items={recap.topEmojiTheirs} emptyText={tr("recap.noEmoji")} />
                </CardContent>
              </Card>
            </section>
          )}

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tr("recap.bookendsTitle")}</CardTitle>
                <CardDescription>{tr("recap.bookendsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Bookend label={tr("recap.first")} m={recap.firstMessage} locale={locale} />
                <Bookend label={tr("recap.last")} m={recap.lastMessage} locale={locale} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{tr("recap.busiestDayTitle")}</CardTitle>
                <CardDescription>{tr("recap.busiestDayDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {recap.busiestDay ? (
                  <Link
                    href={`/calendar?year=${year}&day=${recap.busiestDay.day}`}
                    className="block rounded-md border border-border/40 px-3 py-2 hover:bg-accent/40"
                  >
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Calendar className="size-3.5" /> {recap.busiestDay.day}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {fmtNum(recap.busiestDay.n)} {tr("recap.hero.msgs")}
                    </p>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">{tr("recap.busiestDayNoneChat")}</p>
                )}
              </CardContent>
            </Card>
          </section>

          <p className="text-xs text-muted-foreground text-center pt-4">
            {tf("recap.computedChatFooter", locale, {
              when: format(new Date(recap.computedAt), "PPpp"),
            })}
          </p>
        </>
      )}
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

function Hero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight truncate">{value}</div>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Bookend({
  label,
  m,
  locale,
}: {
  label: string;
  m: {
    chat_username: string | null;
    chat_display: string;
    sender: string;
    content: string;
    timestamp: number;
  } | null;
  locale: "en" | "zh";
}) {
  if (!m) return null;
  const tr = (k: TKey) => t(k, locale);
  return (
    <div className="border-l-2 border-primary/40 pl-3 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-normal">{label}</Badge>
        <span>{m.sender || "—"}</span>
        <span>·</span>
        <span className="tabular-nums">{format(new Date(m.timestamp * 1000), "MMM d, HH:mm")}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{m.content || tr("recap.noText")}</p>
    </div>
  );
}

function EmojiRow({ items, emptyText }: { items: { emoji: string; n: number }[]; emptyText: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
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
