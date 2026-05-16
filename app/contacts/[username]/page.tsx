import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionDetail } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, MessageSquare, LinkIcon, Clock } from "lucide-react";
import { ArchiveToggle } from "@/components/archive-toggle";

export const dynamic = "force-dynamic";

interface SessionRow {
  username: string;
  display_name: string;
  chat_type: string;
  archived?: number;
}

interface MessageRow {
  id: number;
  sender: string;
  msg_type: string;
  content: string;
  timestamp: number;
}

interface LinkRow {
  id: number;
  url: string;
  domain: string;
  domain_group: string;
  sender: string;
  timestamp: number;
  preview: string;
}

interface SenderRow {
  sender: string;
  n: number;
}

interface LinkGroupRow {
  domain_group: string;
  n: number;
}

interface Stats {
  messages: number;
  first_ts: number | null;
  last_ts: number | null;
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  const detail = getSessionDetail(decoded);
  if (!detail) return notFound();

  const session = detail.session as SessionRow;
  const recent = detail.recent as MessageRow[];
  const links = detail.links as LinkRow[];
  const senderBreakdown = detail.senderBreakdown as SenderRow[];
  const stats = detail.stats as Stats;
  const linkGroups = detail.linkGroups as LinkGroupRow[];

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
            {session.display_name || session.username}
            {session.archived === 1 && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/50">
                Archived
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Badge variant="secondary">{session.chat_type}</Badge>
            <span className="font-mono text-xs">{session.username}</span>
          </p>
        </div>
        <ArchiveToggle username={session.username} archived={session.archived === 1} />
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<MessageSquare className="size-3.5" />}
          title="Indexed messages"
          value={stats.messages.toLocaleString()}
          sub={
            stats.first_ts && stats.last_ts
              ? `${format(new Date(stats.first_ts * 1000), "MMM d, yyyy")} – ${format(
                  new Date(stats.last_ts * 1000),
                  "MMM d, yyyy",
                )}`
              : "No messages yet — run deep index"
          }
        />
        <StatCard
          icon={<LinkIcon className="size-3.5" />}
          title="Links shared"
          value={links.length.toLocaleString()}
          sub={linkGroups[0] ? `Top: ${linkGroups[0].domain_group} (${linkGroups[0].n})` : "—"}
        />
        <StatCard
          icon={<Clock className="size-3.5" />}
          title="Last active"
          value={
            stats.last_ts
              ? formatDistanceToNow(new Date(stats.last_ts * 1000), { addSuffix: true })
              : "—"
          }
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent messages</CardTitle>
            <CardDescription>Last 100 indexed messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                History for this chat has not been indexed yet. Trigger a deep index from Settings to
                pull messages.
              </p>
            ) : (
              recent.map((m) => (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.sender || "?"}</span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {m.msg_type}
                    </Badge>
                    <span>{format(new Date(m.timestamp * 1000), "MMM d, HH:mm")}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  <Separator className="mt-3" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top senders</CardTitle>
              <CardDescription>Who talks here</CardDescription>
            </CardHeader>
            <CardContent>
              {senderBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <ul className="space-y-2">
                  {senderBreakdown.slice(0, 15).map((s) => (
                    <li key={s.sender} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.sender || "—"}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.n.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Links by group</CardTitle>
              <CardDescription>What gets shared here</CardDescription>
            </CardHeader>
            <CardContent>
              {linkGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No links yet.</p>
              ) : (
                <ul className="space-y-2">
                  {linkGroups.map((g) => (
                    <li key={g.domain_group} className="flex items-center justify-between text-sm">
                      <Link
                        href={`/links/${encodeURIComponent(g.domain_group)}`}
                        className="hover:underline truncate"
                      >
                        {g.domain_group}
                      </Link>
                      <span className="text-muted-foreground tabular-nums">
                        {g.n.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function StatCard({
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
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
