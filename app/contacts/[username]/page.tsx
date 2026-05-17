import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getContactAnalytics } from "@/lib/queries.contact";
import { getSessionByUsername } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  MessageSquare,
  LinkIcon,
  Clock,
  Calendar,
  CalendarDays,
  Sparkles,
  Mic,
  Image as ImageIcon,
  Smile,
  PieChart,
  Users,
} from "lucide-react";
import { ArchiveSessionButton } from "@/components/archive-session-button";
import { HeroCard } from "@/components/hero-card";
import { MonthlyActivityChart } from "@/components/charts/monthly-activity-chart";
import { HourlyGrid } from "@/components/charts/hourly-grid";
import { LatencyHistogram } from "@/components/charts/latency-histogram";
import { WordCloud } from "@/components/charts/word-cloud";
import { bucketLatencies, latencyStats, formatLatency } from "@/lib/latency";
import type { StyleFingerprint } from "@/lib/queries.contact";
import { t, tf, type Locale, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}
function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  // Cheap up-front read just to validate the URL + paint the header. The
  // expensive analytics call happens inside <Suspense> below, so the back
  // link + page title + archive button can render immediately while the
  // charts stream in.
  const sessionRow = getSessionByUsername(decoded) as
    | {
        username: string;
        display_name: string;
        chat_type: string;
        archived: number;
        member_count: number | null;
        last_timestamp: number | null;
        first_msg_timestamp: number | null;
      }
    | undefined;
  if (!sessionRow) return notFound();

  const chatDisplay = sessionRow.display_name || sessionRow.username;
  const lastYear = sessionRow.last_timestamp
    ? new Date(sessionRow.last_timestamp * 1000).getFullYear()
    : null;
  const lastDay = sessionRow.last_timestamp
    ? format(new Date(sessionRow.last_timestamp * 1000), "yyyy-MM-dd")
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <Link
        href="/contacts"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 mr-1" /> {tr("common.backToContacts")}
      </Link>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {chatDisplay}
            {sessionRow.archived === 1 && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                {tr("contact.archivedBadge")}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{sessionRow.chat_type}</Badge>
            <span className="font-mono text-xs">{sessionRow.username}</span>
            {sessionRow.member_count != null && (
              <span className="text-xs">
                · {fmt(sessionRow.member_count)} {tr("contact.members")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastYear && (
            <Link
              href={`/recap/${lastYear}/${encodeURIComponent(sessionRow.username)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Sparkles className="size-3.5" /> {tr("contact.recap")} {lastYear}
            </Link>
          )}
          {lastDay && lastYear && (
            <Link
              href={`/calendar?year=${lastYear}&day=${lastDay}&chat=${encodeURIComponent(sessionRow.username)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <CalendarDays className="size-3.5" /> {tr("contact.viewInCalendar")}
            </Link>
          )}
          <ArchiveSessionButton
            username={sessionRow.username}
            archived={sessionRow.archived === 1}
          />
        </div>
      </header>

      <Suspense fallback={<ContactBodySkeleton />}>
        <ContactBody decoded={decoded} locale={locale} />
      </Suspense>
    </div>
  );
}

async function ContactBody({ decoded, locale }: { decoded: string; locale: Locale }) {
  // Yield to the event loop once so React flushes the parent + the Suspense
  // fallback before this sync better-sqlite3 call kicks off. Without this
  // tiny await, the synchronous compute runs in the same render tick as the
  // parent and TTFB == total time.
  await new Promise((r) => setImmediate(r));
  const a = getContactAnalytics(decoded);
  if (!a) return notFound();
  const tr = (k: TKey) => t(k, locale);
  const { session, totals, monthly, hourly, latencies, styleMine, styleTheirs, msgTypeBreakdown } = a;
  const themBuckets = bucketLatencies(latencies.themToYou);
  const youBuckets = bucketLatencies(latencies.youToThem);
  const themStats = latencyStats(latencies.themToYou);
  const youStats = latencyStats(latencies.youToThem);
  const hasLatency = latencies.themToYou.length + latencies.youToThem.length > 0;

  return (
    <div className="space-y-6">
      {a.meHandles.length === 0 && (
        <div className="flex gap-3 items-start rounded-md border border-amber-500/30 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2.5 text-sm">
          <Sparkles className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {tr("contact.noMeHere")}
            </p>
            <p className="text-xs text-muted-foreground">
              {tr("contact.noMeHereSub")}{" "}
              <Link href="/settings" className="underline hover:text-foreground">
                {tr("contact.openSettings")}
              </Link>{" "}
              {tr("contact.openSettingsSuffix")}
            </p>
          </div>
        </div>
      )}

      {/* Hero stat strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <HeroCard
          size="sm"
          icon={<MessageSquare className="size-3.5" />}
          label={tr("contact.hero.messages")}
          value={fmt(totals.messages)}
          sub={
            totals.theirs > 0 || totals.mine > 0
              ? tf("contact.hero.messagesSub", locale, {
                  mine: fmt(totals.mine),
                  theirs: fmt(totals.theirs),
                })
              : undefined
          }
        />
        <HeroCard
          size="sm"
          icon={<PieChart className="size-3.5" />}
          label={tr("contact.hero.yourShare")}
          value={totals.messages > 0 ? pct(totals.minePct) : "—"}
          sub={
            a.meHandles.length === 0
              ? tr("contact.hero.yourShareNoMe")
              : tf("contact.hero.yourShareOf", locale, {
                  mine: fmt(totals.mine),
                  total: fmt(totals.messages),
                })
          }
        />
        <HeroCard
          size="sm"
          icon={<LinkIcon className="size-3.5" />}
          label={tr("contact.hero.links")}
          value={fmt(totals.links)}
          sub={
            a.topDomains[0]
              ? `${tr("contact.hero.linksTop")}: ${a.topDomains[0].domain_group}`
              : undefined
          }
        />
        <HeroCard
          size="sm"
          icon={<Clock className="size-3.5" />}
          label={tr("contact.hero.lastActive")}
          value={
            totals.lastTs
              ? formatDistanceToNow(new Date(totals.lastTs * 1000), { addSuffix: true })
              : "—"
          }
          sub={totals.lastTs ? format(new Date(totals.lastTs * 1000), "MMM d, yyyy") : undefined}
        />
        <HeroCard
          size="sm"
          icon={<Calendar className="size-3.5" />}
          label={tr("contact.hero.firstContacted")}
          value={totals.firstTs ? format(new Date(totals.firstTs * 1000), "MMM d, yyyy") : "—"}
          sub={
            totals.firstTs && totals.lastTs
              ? `${Math.round((totals.lastTs - totals.firstTs) / 86400)} ${tr("contact.hero.daysSpan")}`
              : undefined
          }
        />
      </section>

      {/* Monthly activity */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("contact.monthlyTitle")}</CardTitle>
          <CardDescription>{tr("contact.monthlyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {monthly.some((m) => m.mine + m.theirs > 0) ? (
            <MonthlyActivityChart data={monthly} />
          ) : (
            <p className="text-sm text-muted-foreground">{tr("contact.monthlyEmpty")}</p>
          )}
        </CardContent>
      </Card>

      {/* Hourly + latency row */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("contact.hourlyTitle")}</CardTitle>
            <CardDescription>{tr("contact.hourlyDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyGrid data={hourly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tr("contact.latencyTitle")}</CardTitle>
            <CardDescription>
              {hasLatency
                ? tf("contact.latencyMedians", locale, {
                    them: formatLatency(themStats.median),
                    you: formatLatency(youStats.median),
                  })
                : a.meHandles.length === 0
                  ? tr("contact.latencyNoMe")
                  : tr("contact.latencyNotEnough")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasLatency && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tr("contact.themToYou")}</span>
                    <span className="tabular-nums">
                      {fmt(themStats.count)} {tr("contact.replies")}
                    </span>
                  </div>
                  <LatencyHistogram
                    data={themBuckets.map((b) => ({ label: b.label, n: b.n }))}
                    tone="muted"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tr("contact.youToThem")}</span>
                    <span className="tabular-nums">
                      {fmt(youStats.count)} {tr("contact.replies")}
                    </span>
                  </div>
                  <LatencyHistogram
                    data={youBuckets.map((b) => ({ label: b.label, n: b.n }))}
                    tone="primary"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Style fingerprint */}
      {!a.isGroup && (
        <section className="grid gap-6 lg:grid-cols-2">
          <StyleCard label={tr("contact.styleYour")} tone="primary" style={styleMine} locale={locale} />
          <StyleCard label={tr("contact.styleTheir")} tone="muted" style={styleTheirs} locale={locale} />
        </section>
      )}

      {a.isGroup && (
        <Card>
          <CardHeader>
            <CardTitle>{tr("contact.styleGroupTitle")}</CardTitle>
            <CardDescription>
              {tf("contact.styleSampled", locale, { n: fmt(styleTheirs.sampleSize) })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StyleCard inline label={tr("contact.styleGroup")} tone="muted" style={styleTheirs} locale={locale} />
          </CardContent>
        </Card>
      )}

      {/* Topics + shared content */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{tr("contact.topicTitle")}</CardTitle>
            <CardDescription>
              {tf("contact.topicDesc", locale, { n: a.topics.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WordCloud words={a.topics} chatUsername={session.username} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tr("contact.sharedTitle")}</CardTitle>
            <CardDescription>{tr("contact.sharedDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DomainShareList rows={a.topDomains} chatUsername={session.username} locale={locale} />
            {a.fileTypes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  {tr("contact.fileTypes")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.fileTypes.map((ft) => (
                    <Badge key={ft.ext} variant="secondary" className="font-normal">
                      {ft.ext}
                      <span className="ml-1 text-muted-foreground tabular-nums">{ft.n}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {a.topDomains.length === 0 && a.fileTypes.length === 0 && (
              <p className="text-sm text-muted-foreground">{tr("contact.sharedEmpty")}</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Vocab diff (private only) or Top senders (group only) */}
      {a.vocab && !a.isGroup && (
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{tr("contact.vocabYours")}</CardTitle>
              <CardDescription>{tr("contact.vocabYoursDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <VocabList words={a.vocab.aOnly} chatUsername={session.username} locale={locale} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tr("contact.vocabTheirs")}</CardTitle>
              <CardDescription>{tr("contact.vocabTheirsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <VocabList words={a.vocab.bOnly} chatUsername={session.username} locale={locale} />
            </CardContent>
          </Card>
        </section>
      )}

      {a.isGroup && a.topSenders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-3.5" /> {tr("contact.topSendersTitle")}
            </CardTitle>
            <CardDescription>{tr("contact.topSendersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TopSendersList senders={a.topSenders} chatUsername={session.username} locale={locale} />
          </CardContent>
        </Card>
      )}

      {/* Message type breakdown + recent messages */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{tr("contact.msgTypesTitle")}</CardTitle>
            <CardDescription>{tr("contact.msgTypesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {msgTypeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("contact.msgTypesEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {msgTypeBreakdown.slice(0, 10).map((r) => {
                  const total = msgTypeBreakdown.reduce((a, b) => a + b.n, 0) || 1;
                  const p = (r.n / total) * 100;
                  return (
                    <li key={r.msg_type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{r.msg_type || "未分类"}</span>
                        <span className="text-muted-foreground tabular-nums text-xs">
                          {fmt(r.n)} · {p.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-foreground/70" style={{ width: `${p}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{tr("contact.recentTitle")}</CardTitle>
            <CardDescription>{tr("contact.recentDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {a.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("contact.recentEmpty")}</p>
            ) : (
              a.recent.map((m) => {
                const d = new Date(m.timestamp * 1000);
                const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                return (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {m.isMine || !m.sender ? (
                      <span
                        className={`font-medium ${m.isMine ? "text-primary" : "text-foreground"}`}
                      >
                        {m.isMine ? tr("common.you") : "—"}
                      </span>
                    ) : (
                      <Link
                        href={`/search?q=${encodeURIComponent(m.sender)}&chat=${encodeURIComponent(session.username)}`}
                        className="font-medium text-foreground hover:underline"
                        title={tf("contact.searchInChat", locale, { sender: m.sender })}
                      >
                        {m.sender}
                      </Link>
                    )}
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {m.msg_type}
                    </Badge>
                    {/* Per project convention: timestamp → /messages/<id> (the
                        permalink with ±20 context lines is the richer drill).
                        Day glyph → calendar day-detail, kept as a smaller
                        secondary affordance. */}
                    <Link
                      href={`/messages/${m.id}`}
                      className="tabular-nums hover:text-foreground hover:underline"
                      title={tr("messages.permalink")}
                    >
                      {format(d, "MMM d, HH:mm")}
                    </Link>
                    <Link
                      href={`/calendar?year=${d.getFullYear()}&day=${dayStr}&chat=${encodeURIComponent(session.username)}`}
                      className="text-muted-foreground/70 hover:text-foreground hover:underline text-[10px]"
                      title={tr("contact.openDayInCal")}
                    >
                      {tr("messages.day")}
                    </Link>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  <Separator className="mt-3" />
                </div>
              );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ContactBodySkeleton() {
  // Mirrors the body structure roughly so the page doesn't jump on stream-in:
  // hero strip (5 tiles), monthly chart, two-column grid, etc.
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
      <section className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function StyleCard({
  label,
  tone,
  style,
  inline,
  locale,
}: {
  label: string;
  tone: "primary" | "muted";
  style: StyleFingerprint;
  inline?: boolean;
  locale: Locale;
}) {
  const tr = (k: TKey) => t(k, locale);
  const ringTone = tone === "primary" ? "ring-primary/40" : "ring-foreground/10";
  if (style.sampleSize === 0) {
    if (inline) {
      return <p className="text-sm text-muted-foreground">{tr("contact.styleEmpty")}</p>;
    }
    return (
      <Card className={ringTone}>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>{tr("contact.styleEmpty")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const stats = (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Metric label={tr("contact.metric.avgChars")} value={style.avgChars.toFixed(0)} />
        <Metric label={tr("contact.metric.emojiPerMsg")} value={style.emojiPerMsg.toFixed(2)} />
        <Metric label={tr("contact.metric.linkRate")} value={style.linkPerMsg.toFixed(3)} />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              <Mic className="size-3" /> {tr("contact.metric.voice")}
            </span>
          }
          value={`${(style.voiceShare * 100).toFixed(1)}%`}
        />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="size-3" /> {tr("contact.metric.image")}
            </span>
          }
          value={`${(style.imageShare * 100).toFixed(1)}%`}
        />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              <Smile className="size-3" /> {tr("contact.metric.sticker")}
            </span>
          }
          value={`${(style.stickerShare * 100).toFixed(1)}%`}
        />
      </div>
      {style.topEmoji.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1.5">{tr("contact.topEmoji")}</p>
          <div className="flex flex-wrap gap-1.5">
            {style.topEmoji.map((e) => (
              <span
                key={e.emoji}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-base"
                title={tf("contact.topEmojiTooltip", locale, { emoji: e.emoji, n: e.n })}
              >
                <span>{e.emoji}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{e.n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (inline) {
    return <div className="space-y-3">{stats}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {tf("contact.styleSampled", locale, { n: fmt(style.sampleSize) })}
        </CardDescription>
      </CardHeader>
      <CardContent>{stats}</CardContent>
    </Card>
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

function DomainShareList({
  rows,
  chatUsername,
  locale,
}: {
  rows: { domain_group: string; n: number }[];
  chatUsername: string;
  locale: Locale;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("contact.linksEmpty", locale)}</p>;
  }
  const max = rows.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <Link
          key={r.domain_group}
          href={`/links/${encodeURIComponent(r.domain_group)}?chat=${encodeURIComponent(chatUsername)}`}
          className="group block rounded px-1.5 py-1 hover:bg-accent/60 transition-colors"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="truncate group-hover:text-primary">{r.domain_group}</span>
            <span className="text-muted-foreground tabular-nums text-xs">{r.n.toLocaleString()}</span>
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

function VocabList({
  words,
  chatUsername,
  locale,
}: {
  words: import("@/lib/text").ScoredWord[];
  chatUsername?: string;
  locale: Locale;
}) {
  if (words.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("contact.vocabEmpty", locale)}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((w) => {
        const href = chatUsername
          ? `/search?q=${encodeURIComponent(w.word)}&chat=${encodeURIComponent(chatUsername)}`
          : `/search?q=${encodeURIComponent(w.word)}`;
        const scope = chatUsername ? t("contact.vocabInChat", locale) : "";
        return (
          <Link
            key={w.word}
            href={href}
            className="inline-flex items-center gap-1 rounded-md bg-muted hover:bg-accent px-2 py-1 text-sm transition-colors"
            title={tf("contact.vocabMentions", locale, { count: w.count, scope })}
          >
            <span className="font-medium">{w.word}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{w.count}</span>
          </Link>
        );
      })}
    </div>
  );
}

function TopSendersList({
  senders,
  chatUsername,
  locale,
}: {
  senders: { sender: string; n: number; knownUsername: string | null }[];
  chatUsername?: string;
  locale: Locale;
}) {
  const tr = (k: TKey) => t(k, locale);
  const max = senders.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <ul className="space-y-1.5">
      {senders.map((s) => {
        // Known contact → jump to their own contact page (no scope makes
        // sense there). Unknown sender → scoped search within this group
        // so the user can read what they wrote here.
        const href = s.knownUsername
          ? `/contacts/${encodeURIComponent(s.knownUsername)}`
          : chatUsername
            ? `/search?q=${encodeURIComponent(s.sender)}&chat=${encodeURIComponent(chatUsername)}`
            : `/search?q=${encodeURIComponent(s.sender)}`;
        return (
          <li key={s.sender}>
            <Link
              href={href}
              className="group block rounded px-2 py-1 hover:bg-accent/60 transition-colors"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="truncate group-hover:text-primary">
                  {s.sender || "—"}
                  {s.knownUsername && (
                    <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                      {tr("contact.contactBadge")}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground tabular-nums text-xs">
                  {s.n.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-foreground/60 group-hover:bg-foreground/80"
                  style={{ width: `${(s.n / max) * 100}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
