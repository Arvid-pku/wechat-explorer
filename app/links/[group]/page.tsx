import Link from "next/link";
import { getDb } from "@/lib/db";
import { getLinksInGroup, getLinkGroupFacets } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink, Download, UserCircle2, X } from "lucide-react";
import { format } from "date-fns";
import { ArchivedFilterPill, buildArchivedFilterHref } from "@/components/archived-filter-pill";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LinksGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<{ sender?: string; chat?: string; page?: string; q?: string; archived?: string }>;
}) {
  const { group } = await params;
  const sp = await searchParams;
  const decoded = decodeURIComponent(group);
  const page = Math.max(0, parseInt(sp.page ?? "0", 10));
  const includeArchived = sp.archived === "1";

  // `chat` carries a session username (canonical) or — for older URLs —
  // a display name. Resolve to username when possible so the pill can show
  // the friendly display name and queries can use the unique id.
  let scopeUsername: string | undefined;
  let scopeDisplay: string | undefined;
  let chatDisplayFallback: string | undefined;
  if (sp.chat) {
    const row = getDb()
      .prepare(`SELECT username, display_name FROM sessions WHERE username = ?`)
      .get(sp.chat) as { username: string; display_name: string } | undefined;
    if (row) {
      scopeUsername = row.username;
      scopeDisplay = row.display_name;
    } else {
      chatDisplayFallback = sp.chat;
    }
  }

  const items = getLinksInGroup(decoded, {
    sender: sp.sender,
    chat: chatDisplayFallback,
    chatUsername: scopeUsername,
    q: sp.q,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    includeArchived,
  });
  const facets = getLinkGroupFacets(decoded, {
    includeArchived,
    chatUsername: scopeUsername,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <Link
        href="/links"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 mr-1" /> Back to all groups
      </Link>

      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{decoded}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length.toLocaleString()} links shown
            {(sp.sender || sp.chat || sp.q) && " (filtered)"}
            {includeArchived ? " (including archived)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ArchivedFilterPill
            on={includeArchived}
            href={buildArchivedFilterHref(`/links/${group}`, sp, includeArchived)}
          />
          <a
            href={`/api/export/links?group=${encodeURIComponent(decoded)}&format=csv`}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Download className="size-3.5" /> CSV
          </a>
          <a
            href={`/api/export/links?group=${encodeURIComponent(decoded)}&format=json`}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Download className="size-3.5" /> JSON
          </a>
        </div>
      </header>

      {scopeUsername && scopeDisplay && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <UserCircle2 className="size-3.5 text-primary" />
          <span className="text-muted-foreground">Filtered to chat:</span>
          <Link
            href={`/contacts/${encodeURIComponent(scopeUsername)}`}
            className="font-medium text-foreground hover:underline truncate max-w-[40ch]"
          >
            {scopeDisplay}
          </Link>
          <Link
            href={`/links/${group}?${stripParam(sp, "chat")}`}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Clear chat filter"
          >
            <X className="size-3" /> clear
          </Link>
        </div>
      )}

      {(sp.sender || (sp.chat && !scopeUsername) || sp.q) && (
        <div className="flex items-center gap-2 flex-wrap">
          {sp.sender && (
            <FilterChip label={`Sender: ${sp.sender}`} href={`/links/${group}?${stripParam(sp, "sender")}`} />
          )}
          {sp.chat && !scopeUsername && (
            <FilterChip label={`Chat: ${sp.chat}`} href={`/links/${group}?${stripParam(sp, "chat")}`} />
          )}
          {sp.q && <FilterChip label={`Search: ${sp.q}`} href={`/links/${group}?${stripParam(sp, "q")}`} />}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {items.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">No links match.</p>
            ) : (
              items.map((u) => (
                <div
                  key={u.id}
                  className="px-6 py-3 hover:bg-accent/40 border-b border-border/40 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:underline inline-flex items-center gap-1 break-all"
                      >
                        <span className="truncate">{u.preview?.replace(/\[链接\]\s*/, "") || u.url}</span>
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                      </a>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                        {u.domain}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Link
                          href={`/links/${group}?${withParam(sp, "sender", u.sender)}`}
                          className="hover:underline"
                        >
                          {u.sender || "—"}
                        </Link>
                        <span>·</span>
                        <Link
                          href={`/links/${group}?${withParam(sp, "chat", u.chat_display)}`}
                          className="hover:underline truncate"
                        >
                          {u.chat_display}
                        </Link>
                        <span>·</span>
                        <span className="tabular-nums">
                          {format(new Date(u.timestamp * 1000), "MMM d, yyyy HH:mm")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <FacetCard
            title="Senders"
            description="Who shared links in this group"
            rows={facets.senders.map((s) => ({ label: s.sender, n: s.n }))}
            param="sender"
            current={sp.sender}
            group={group}
            sp={sp}
          />
          <FacetCard
            title="Chats"
            description="Where these links appeared"
            rows={facets.chats.map((c) => ({ label: c.chat_display, n: c.n }))}
            param="chat"
            current={sp.chat}
            group={group}
            sp={sp}
          />
        </div>
      </div>

      {items.length === PAGE_SIZE && (
        <div className="flex items-center justify-center pt-2">
          <Link
            href={`/links/${group}?${withParam(sp, "page", String(page + 1))}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Load more →
          </Link>
        </div>
      )}
    </div>
  );
}

function FacetCard({
  title,
  description,
  rows,
  param,
  current,
  group,
  sp,
}: {
  title: string;
  description: string;
  rows: { label: string; n: number }[];
  param: "sender" | "chat";
  current?: string;
  group: string;
  sp: Record<string, string | undefined>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.slice(0, 20).map((r) => (
          <Link
            key={r.label}
            href={`/links/${group}?${withParam(sp, param, r.label)}`}
            className={`flex items-center justify-between text-xs rounded px-2 py-1 hover:bg-accent ${
              current === r.label ? "bg-accent font-medium" : "text-muted-foreground"
            }`}
          >
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums">{r.n}</span>
          </Link>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
      </CardContent>
    </Card>
  );
}

function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href}>
      <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
        {label} <span className="ml-1 text-muted-foreground">×</span>
      </Badge>
    </Link>
  );
}

function withParam(sp: Record<string, string | undefined>, key: string, value: string) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") usp.set(k, v);
  usp.set(key, value);
  return usp.toString();
}

function stripParam(sp: Record<string, string | undefined>, key: string) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== key && k !== "page") usp.set(k, v);
  return usp.toString();
}
