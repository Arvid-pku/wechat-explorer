import Link from "next/link";
import { listSessions } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { Users, MessageSquare, LinkIcon, Building, Folder, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPES = [
  { key: "all", label: "All", icon: Users },
  { key: "private", label: "Private", icon: Users },
  { key: "group", label: "Group", icon: MessageSquare },
  { key: "official", label: "Official", icon: Building },
  { key: "folded", label: "Folded", icon: Folder },
];
const SORTS = [
  { key: "recent", label: "Recent" },
  { key: "messages", label: "Messages" },
  { key: "urls", label: "Links" },
  { key: "name", label: "Name" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; q?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "all";
  const sort = sp.sort ?? "recent";
  const q = sp.q ?? "";
  const view = sp.view ?? "active";

  const rows = listSessions({
    type,
    sort,
    q,
    limit: 300,
    onlyArchived: view === "archived",
    includeArchived: view === "all",
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length.toLocaleString()} sessions matching current filters
            {view === "archived" && " · viewing archived"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/sessions?format=csv"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Download sessions as CSV"
          >
            <Download className="size-3.5" /> CSV
          </a>
          <a
            href="/api/export/sessions?format=json"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Download sessions as JSON"
          >
            <Download className="size-3.5" /> JSON
          </a>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="inline-flex items-center rounded-lg bg-muted p-[3px] text-sm">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.key;
            return (
              <Link
                key={t.key}
                href={`/contacts?${qs({ type: t.key, sort, q, view })}`}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="inline-flex rounded-md border border-border/60 p-[2px]">
            {[
              { key: "active", label: "Active" },
              { key: "archived", label: "Archived" },
              { key: "all", label: "All" },
            ].map((v) => (
              <Link
                key={v.key}
                href={`/contacts?${qs({ type, sort, q, view: v.key })}`}
                className={`rounded px-2.5 py-1 ${
                  view === v.key ? "bg-accent text-foreground" : "hover:text-foreground"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </div>
          <span>Sort:</span>
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={`/contacts?${qs({ type, sort: s.key, q, view })}`}
              className={`rounded px-2 py-1 hover:bg-accent ${
                sort === s.key ? "bg-accent text-foreground" : ""
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Links</TableHead>
                <TableHead className="text-right pr-6">Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.username} className="hover:bg-accent/40">
                  <TableCell className="pl-6">
                    <Link
                      href={`/contacts/${encodeURIComponent(row.username)}`}
                      className="font-medium hover:underline"
                    >
                      {row.display_name || row.username}
                    </Link>
                    {row.unread > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {row.unread} unread
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={row.chat_type} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.message_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.url_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right pr-6 text-muted-foreground tabular-nums text-xs">
                    {row.last_timestamp
                      ? formatDistanceToNow(new Date(row.last_timestamp * 1000), {
                          addSuffix: true,
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No sessions match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const variants: Record<string, string> = {
    private: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    group: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    official: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    folded: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    other: "bg-muted text-muted-foreground",
  };
  const klass = variants[type] ?? variants.other;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${klass}`}>{type}</span>
  );
}

function qs(parts: Record<string, string>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(parts)) {
    if (v) usp.set(k, v);
  }
  return usp.toString();
}
