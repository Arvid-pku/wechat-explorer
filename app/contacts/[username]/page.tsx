import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactAnalytics } from "@/lib/queries.contact";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { ArchiveToggle } from "@/components/archive-toggle";
import { MonthlyActivityChart } from "@/components/charts/monthly-activity-chart";
import { HourlyGrid } from "@/components/charts/hourly-grid";
import { LatencyHistogram } from "@/components/charts/latency-histogram";
import { WordCloud } from "@/components/charts/word-cloud";
import { bucketLatencies, latencyStats, formatLatency } from "@/lib/latency";
import type { StyleFingerprint } from "@/lib/queries.contact";

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
  const a = getContactAnalytics(decoded);
  if (!a) return notFound();

  const { session, totals, monthly, hourly, latencies, styleMine, styleTheirs, msgTypeBreakdown } = a;
  const themBuckets = bucketLatencies(latencies.themToYou);
  const youBuckets = bucketLatencies(latencies.youToThem);
  const themStats = latencyStats(latencies.themToYou);
  const youStats = latencyStats(latencies.youToThem);
  const hasLatency = latencies.themToYou.length + latencies.youToThem.length > 0;
  const chatDisplay = session.display_name || session.username;

  // Latest year with activity → recap link
  const lastYear = totals.lastTs ? new Date(totals.lastTs * 1000).getFullYear() : null;
  // Last active day for "view in calendar"
  const lastDay = totals.lastTs ? format(new Date(totals.lastTs * 1000), "yyyy-MM-dd") : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <Link
        href="/contacts"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 mr-1" /> Back to contacts
      </Link>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {chatDisplay}
            {session.archived === 1 && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                Archived
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{session.chat_type}</Badge>
            <span className="font-mono text-xs">{session.username}</span>
            {session.member_count != null && (
              <span className="text-xs">· {fmt(session.member_count)} members</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastYear && (
            <Link
              href={`/recap/${lastYear}/${encodeURIComponent(session.username)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Sparkles className="size-3.5" /> Recap {lastYear}
            </Link>
          )}
          {lastDay && lastYear && (
            <Link
              href={`/calendar?year=${lastYear}&day=${lastDay}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <CalendarDays className="size-3.5" /> View in calendar
            </Link>
          )}
          <ArchiveToggle username={session.username} archived={session.archived === 1} />
        </div>
      </header>

      {/* Hero stat strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <HeroStat
          icon={<MessageSquare className="size-3.5" />}
          title="Messages"
          value={fmt(totals.messages)}
          sub={totals.theirs > 0 || totals.mine > 0 ? `${fmt(totals.mine)} you · ${fmt(totals.theirs)} them` : undefined}
        />
        <HeroStat
          icon={<PieChart className="size-3.5" />}
          title="Your share"
          value={totals.messages > 0 ? pct(totals.minePct) : "—"}
          sub={a.meHandles.length === 0 ? "no me-handle here" : `${fmt(totals.mine)} of ${fmt(totals.messages)}`}
        />
        <HeroStat
          icon={<LinkIcon className="size-3.5" />}
          title="Links shared"
          value={fmt(totals.links)}
          sub={a.topDomains[0] ? `top: ${a.topDomains[0].domain_group}` : undefined}
        />
        <HeroStat
          icon={<Clock className="size-3.5" />}
          title="Last active"
          value={
            totals.lastTs
              ? formatDistanceToNow(new Date(totals.lastTs * 1000), { addSuffix: true })
              : "—"
          }
          sub={totals.lastTs ? format(new Date(totals.lastTs * 1000), "MMM d, yyyy") : undefined}
        />
        <HeroStat
          icon={<Calendar className="size-3.5" />}
          title="First contacted"
          value={totals.firstTs ? format(new Date(totals.firstTs * 1000), "MMM d, yyyy") : "—"}
          sub={
            totals.firstTs && totals.lastTs
              ? `${Math.round((totals.lastTs - totals.firstTs) / 86400)} days span`
              : undefined
          }
        />
      </section>

      {/* Monthly activity */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly activity (last 24 months)</CardTitle>
          <CardDescription>
            Stacked counts: your sends + their sends per month
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthly.some((m) => m.mine + m.theirs > 0) ? (
            <MonthlyActivityChart data={monthly} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No messages indexed in the last 24 months — run a deep index from Settings.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Hourly + latency row */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity by hour</CardTitle>
            <CardDescription>When does this chat happen? (local time)</CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyGrid data={hourly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reply latency</CardTitle>
            <CardDescription>
              {hasLatency
                ? `Median them→you ${formatLatency(themStats.median)} · you→them ${formatLatency(youStats.median)}`
                : a.meHandles.length === 0
                ? "Configure your me-handles in Settings to see reply latency."
                : "Not enough back-and-forth in this chat yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasLatency && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Them → You</span>
                    <span className="tabular-nums">{fmt(themStats.count)} replies</span>
                  </div>
                  <LatencyHistogram
                    data={themBuckets.map((b) => ({ label: b.label, n: b.n }))}
                    tone="muted"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>You → Them</span>
                    <span className="tabular-nums">{fmt(youStats.count)} replies</span>
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
          <StyleCard label="Your style" tone="primary" style={styleMine} />
          <StyleCard label="Their style" tone="muted" style={styleTheirs} />
        </section>
      )}

      {a.isGroup && (
        <Card>
          <CardHeader>
            <CardTitle>Group style fingerprint</CardTitle>
            <CardDescription>Sampled across the most recent {fmt(styleTheirs.sampleSize)} messages</CardDescription>
          </CardHeader>
          <CardContent>
            <StyleCard inline label="Group" tone="muted" style={styleTheirs} />
          </CardContent>
        </Card>
      )}

      {/* Topics + shared content */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Topic fingerprint</CardTitle>
            <CardDescription>
              Top {a.topics.length} TF-IDF words for this chat vs a global baseline. Click a word to search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WordCloud words={a.topics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shared content</CardTitle>
            <CardDescription>Where do the links go?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DomainShareList rows={a.topDomains} chatDisplay={chatDisplay} />
            {a.fileTypes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">File types</p>
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
              <p className="text-sm text-muted-foreground">No shared content indexed yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Vocab diff (private only) or Top senders (group only) */}
      {a.vocab && !a.isGroup && (
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Words you use, they don&apos;t</CardTitle>
              <CardDescription>Tokens distinctive to your side</CardDescription>
            </CardHeader>
            <CardContent>
              <VocabList words={a.vocab.aOnly} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Words they use, you don&apos;t</CardTitle>
              <CardDescription>Tokens distinctive to their side</CardDescription>
            </CardHeader>
            <CardContent>
              <VocabList words={a.vocab.bOnly} />
            </CardContent>
          </Card>
        </section>
      )}

      {a.isGroup && a.topSenders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-3.5" /> Top senders
            </CardTitle>
            <CardDescription>The voices that drive this group</CardDescription>
          </CardHeader>
          <CardContent>
            <TopSendersList senders={a.topSenders} />
          </CardContent>
        </Card>
      )}

      {/* Message type breakdown + recent messages */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Message types</CardTitle>
            <CardDescription>What flows here</CardDescription>
          </CardHeader>
          <CardContent>
            {msgTypeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
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
            <CardTitle>Recent messages</CardTitle>
            <CardDescription>Last 50 indexed messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {a.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                History for this chat has not been indexed yet. Trigger a deep index from Settings to
                pull messages.
              </p>
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
                        {m.isMine ? "You" : "—"}
                      </span>
                    ) : (
                      <Link
                        href={`/search?q=${encodeURIComponent(m.sender)}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {m.sender}
                      </Link>
                    )}
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {m.msg_type}
                    </Badge>
                    <Link
                      href={`/calendar?year=${d.getFullYear()}&day=${dayStr}`}
                      className="tabular-nums hover:text-foreground hover:underline"
                      title="Open this day in the calendar"
                    >
                      {format(d, "MMM d, HH:mm")}
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

/* ---------- subcomponents ---------- */

function HeroStat({
  icon,
  title,
  value,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon}
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StyleCard({
  label,
  tone,
  style,
  inline,
}: {
  label: string;
  tone: "primary" | "muted";
  style: StyleFingerprint;
  inline?: boolean;
}) {
  const ringTone = tone === "primary" ? "ring-primary/40" : "ring-foreground/10";
  if (style.sampleSize === 0) {
    if (inline) {
      return <p className="text-sm text-muted-foreground">No messages on this side yet.</p>;
    }
    return (
      <Card className={ringTone}>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>No messages on this side yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const stats = (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Metric label="Avg chars / text" value={style.avgChars.toFixed(0)} />
        <Metric label="Emoji / text" value={style.emojiPerMsg.toFixed(2)} />
        <Metric label="Link rate" value={style.linkPerMsg.toFixed(3)} />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              <Mic className="size-3" /> Voice
            </span>
          }
          value={`${(style.voiceShare * 100).toFixed(1)}%`}
        />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="size-3" /> Image
            </span>
          }
          value={`${(style.imageShare * 100).toFixed(1)}%`}
        />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              <Smile className="size-3" /> Sticker
            </span>
          }
          value={`${(style.stickerShare * 100).toFixed(1)}%`}
        />
      </div>
      {style.topEmoji.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1.5">Top emoji</p>
          <div className="flex flex-wrap gap-1.5">
            {style.topEmoji.map((e) => (
              <span
                key={e.emoji}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-base"
                title={`${e.emoji} — ${e.n} uses`}
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
          Sampled across the most recent {fmt(style.sampleSize)} messages
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
  chatDisplay,
}: {
  rows: { domain_group: string; n: number }[];
  chatDisplay: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No links indexed yet.</p>;
  }
  const max = rows.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <Link
          key={r.domain_group}
          href={`/links/${encodeURIComponent(r.domain_group)}?chat=${encodeURIComponent(chatDisplay)}`}
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

function VocabList({ words }: { words: import("@/lib/text").ScoredWord[] }) {
  if (words.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough distinctive vocabulary yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((w) => (
        <Link
          key={w.word}
          href={`/search?q=${encodeURIComponent(w.word)}`}
          className="inline-flex items-center gap-1 rounded-md bg-muted hover:bg-accent px-2 py-1 text-sm transition-colors"
          title={`${w.count} mentions`}
        >
          <span className="font-medium">{w.word}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{w.count}</span>
        </Link>
      ))}
    </div>
  );
}

function TopSendersList({
  senders,
}: {
  senders: { sender: string; n: number; knownUsername: string | null }[];
}) {
  const max = senders.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <ul className="space-y-1.5">
      {senders.map((s) => {
        const href = s.knownUsername
          ? `/contacts/${encodeURIComponent(s.knownUsername)}`
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
                      contact
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
