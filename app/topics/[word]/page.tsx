import Link from "next/link";
import { notFound } from "next/navigation";
import { getTopicTimeline } from "@/lib/topics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LineWithBars } from "@/components/charts/stats/bars";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, MessageSquare, Calendar, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ word: string }>;
}) {
  const { word: rawWord } = await params;
  const word = decodeURIComponent(rawWord);
  const t = getTopicTimeline(word);
  if (!t) return notFound();

  const dayStr = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-6">
      <Link
        href="/search"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 mr-1" /> Back to search
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Topic timeline</p>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
          <span className="font-mono px-2 py-0.5 rounded-md bg-muted">{word}</span>
          <Badge variant={t.fts ? "secondary" : "outline"} className="font-normal">
            {t.fts ? "FTS5" : "LIKE fallback"}
          </Badge>
        </h1>
        {t.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No indexed messages contain &quot;{word}&quot;.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {fmt(t.total)} occurrences across the corpus
            {t.firstSeen && (
              <>
                {" · first appeared "}
                <span className="font-medium">
                  {formatDistanceToNow(new Date(t.firstSeen * 1000), { addSuffix: true })}
                </span>{" "}
                ({format(new Date(t.firstSeen * 1000), "MMM d, yyyy")})
              </>
            )}
          </p>
        )}
      </header>

      {t.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Try a different spelling, or{" "}
            <Link href={`/search?q=${encodeURIComponent(word)}`} className="underline">
              search messages
            </Link>{" "}
            for surrounding context.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Over time</CardTitle>
              <CardDescription>
                Monthly occurrences. Useful to spot when a topic showed up in your life.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LineWithBars data={t.monthly.map((m) => ({ label: m.ym, n: m.n }))} />
            </CardContent>
          </Card>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-4" /> Top chats
                </CardTitle>
                <CardDescription>Where this word lives most.</CardDescription>
              </CardHeader>
              <CardContent>
                {t.topChats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chat breakdown.</p>
                ) : (
                  <TopChatsList rows={t.topChats} word={word} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4" /> Top senders
                </CardTitle>
                <CardDescription>Who says it most.</CardDescription>
              </CardHeader>
              <CardContent>
                {t.topSenders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sender breakdown.</p>
                ) : (
                  <TopSendersList rows={t.topSenders} word={word} />
                )}
              </CardContent>
            </Card>
          </section>

          {t.firstSamples.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="size-4" /> First appearances
                </CardTitle>
                <CardDescription>
                  The earliest indexed messages mentioning this word.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.firstSamples.map((s) => (
                  <SampleRow key={s.id} sample={s} dayStr={dayStr} />
                ))}
              </CardContent>
            </Card>
          )}

          {t.recentSamples.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent mentions</CardTitle>
                <CardDescription>Most recent ten.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.recentSamples.map((s) => (
                  <SampleRow key={s.id} sample={s} dayStr={dayStr} />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function TopChatsList({
  rows,
  word,
}: {
  rows: { chat_username: string | null; chat_display: string; n: number }[];
  word: string;
}) {
  const max = rows.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const target = r.chat_username
          ? `/contacts/${encodeURIComponent(r.chat_username)}`
          : `/search?q=${encodeURIComponent(word)}`;
        return (
          <li key={`${r.chat_username ?? "null"}::${r.chat_display}`}>
            <Link
              href={target}
              className="group block rounded px-1.5 py-1 hover:bg-accent/60 transition-colors"
              title={`Open ${r.chat_display}`}
            >
              <div className="flex items-center justify-between text-sm gap-3">
                <span className="truncate group-hover:text-primary">{r.chat_display}</span>
                <span className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
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
          </li>
        );
      })}
    </ul>
  );
}

function TopSendersList({
  rows,
  word,
}: {
  rows: { sender: string; n: number }[];
  word: string;
}) {
  return (
    <ul className="space-y-1.5">
      {rows.map((s) => (
        <li key={s.sender}>
          <Link
            href={`/search?q=${encodeURIComponent(s.sender + " " + word)}`}
            className="group block rounded px-2 py-1 hover:bg-accent/60 transition-colors"
            title={`Search messages by ${s.sender} containing the topic`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="truncate group-hover:text-primary">{s.sender}</span>
              <span className="text-muted-foreground tabular-nums text-xs">
                {s.n.toLocaleString()}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SampleRow({
  sample: s,
  dayStr,
}: {
  sample: {
    id: number;
    chat_username: string | null;
    chat_display: string;
    sender: string;
    content: string;
    timestamp: number;
  };
  dayStr: (ts: number) => string;
}) {
  const d = new Date(s.timestamp * 1000);
  return (
    <div className="space-y-1" data-jk-row>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {s.chat_username ? (
          <Link
            href={`/contacts/${encodeURIComponent(s.chat_username)}`}
            className="font-medium text-foreground hover:underline truncate max-w-[40ch]"
          >
            {s.chat_display}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{s.chat_display}</span>
        )}
        <span>·</span>
        <span className="text-foreground/80">{s.sender || "—"}</span>
        <span>·</span>
        <Link href={`/messages/${s.id}`} className="tabular-nums hover:underline">
          {format(d, "MMM d, yyyy HH:mm")}
        </Link>
        <Link
          href={
            s.chat_username
              ? `/calendar?year=${d.getFullYear()}&day=${dayStr(s.timestamp)}&chat=${encodeURIComponent(s.chat_username)}`
              : `/calendar?year=${d.getFullYear()}&day=${dayStr(s.timestamp)}`
          }
          className="text-muted-foreground/70 hover:text-foreground hover:underline text-[10px]"
        >
          day
        </Link>
      </div>
      <p className="text-sm break-words line-clamp-3 whitespace-pre-wrap">{s.content}</p>
      <Separator className="mt-2" />
    </div>
  );
}
