import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, MessageSquare, Search, User } from "lucide-react";
import { getMessageContext, type MessageRow } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function MessagePermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return notFound();

  const ctx = getMessageContext(id);
  if (!ctx.target) return notFound();

  const { target, before, after, session } = ctx;
  const chatDisplay = session?.display_name || target.chat_display;
  const chatHref = target.chat_username
    ? `/contacts/${encodeURIComponent(target.chat_username)}`
    : null;

  const d = new Date(target.timestamp * 1000);
  const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  // Scope the calendar to this chat when we know the username — preserves
  // the "looking at one conversation" mental model when bouncing to dates.
  const calendarHref = target.chat_username
    ? `/calendar?year=${d.getFullYear()}&day=${dayStr}&chat=${encodeURIComponent(target.chat_username)}`
    : `/calendar?year=${d.getFullYear()}&day=${dayStr}`;
  const searchSnippet = (target.content || "").trim().slice(0, 20);
  const searchHref = searchSnippet
    ? `/search?q=${encodeURIComponent(searchSnippet)}`
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {chatHref ? (
          <Link
            href={chatHref}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 mr-1" /> Back to {chatDisplay}
          </Link>
        ) : (
          <Link
            href="/contacts"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 mr-1" /> Contacts
          </Link>
        )}
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
          {chatHref ? (
            <Link href={chatHref} className="hover:underline">
              {chatDisplay}
            </Link>
          ) : (
            <span>{chatDisplay}</span>
          )}
          {session && <Badge variant="secondary">{session.chat_type}</Badge>}
          {!session && target.chat_username === null && (
            <Badge variant="outline" className="text-muted-foreground">
              unlinked chat
            </Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <MessageSquare className="size-3.5" />
          Message #{target.id}
          <span>·</span>
          <Link
            href={calendarHref}
            className="tabular-nums hover:text-foreground hover:underline inline-flex items-center gap-1"
          >
            <CalendarDays className="size-3.5" />
            {format(d, "MMM d, yyyy HH:mm")}
          </Link>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>
            {before.length} before · target · {after.length} after
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {before.length === 0 && after.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No surrounding messages indexed for this chat.
            </p>
          ) : (
            <>
              <Section label="Before">
                {before.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Nothing older indexed in this chat.
                  </p>
                ) : (
                  before.map((m) => <MessageRowView key={m.id} m={m} />)
                )}
              </Section>

              <Separator className="my-2" />
              <MessageRowView m={target} highlight />
              <Separator className="my-2" />

              <Section label="After">
                {after.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Nothing newer indexed in this chat.
                  </p>
                ) : (
                  after.map((m) => <MessageRowView key={m.id} m={m} />)
                )}
              </Section>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <Link
          href={calendarHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 hover:bg-accent"
        >
          <CalendarDays className="size-3.5" /> Open in calendar
        </Link>
        {chatHref && (
          <Link
            href={chatHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 hover:bg-accent"
          >
            <User className="size-3.5" /> Open contact
          </Link>
        )}
        {searchHref && (
          <Link
            href={searchHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 hover:bg-accent"
            title={`Search for "${searchSnippet}"`}
          >
            <Search className="size-3.5" /> Search this message
          </Link>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MessageRowView({ m, highlight }: { m: MessageRow; highlight?: boolean }) {
  const d = new Date(m.timestamp * 1000);
  const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const calendarHref = m.chat_username
    ? `/calendar?year=${d.getFullYear()}&day=${dayStr}&chat=${encodeURIComponent(m.chat_username)}`
    : `/calendar?year=${d.getFullYear()}&day=${dayStr}`;
  const isTarget = !!highlight;

  return (
    <div
      data-jk-row
      className={
        isTarget
          ? "rounded-md ring-2 ring-primary bg-primary/5 px-3 py-2 space-y-1"
          : "rounded-md px-3 py-2 space-y-1 hover:bg-accent/40 transition-colors"
      }
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {m.sender ? (
          <Link
            href={`/search?q=${encodeURIComponent(m.sender)}`}
            className="font-medium text-foreground hover:underline"
          >
            {m.sender}
          </Link>
        ) : (
          <span className="font-medium text-foreground">—</span>
        )}
        <Badge variant="outline" className="text-[10px] font-normal">
          {m.msg_type}
        </Badge>
        {isTarget ? (
          <span className="tabular-nums">{format(d, "HH:mm")}</span>
        ) : (
          <Link
            href={`/messages/${m.id}`}
            className="tabular-nums hover:text-foreground hover:underline"
            title="Open permalink"
          >
            {format(d, "HH:mm")}
          </Link>
        )}
        <Link
          href={calendarHref}
          className="tabular-nums hover:text-foreground hover:underline opacity-70"
          title="Open this day in the calendar"
        >
          {format(d, "MMM d")}
        </Link>
      </div>
      <p
        className={
          isTarget
            ? "text-sm whitespace-pre-wrap break-words font-medium"
            : "text-sm whitespace-pre-wrap break-words"
        }
      >
        {m.content}
      </p>
    </div>
  );
}
