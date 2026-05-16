import Link from "next/link";
import { listSessions } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Users,
  MessageSquare,
  Building,
  Folder,
  Download,
  X,
  ArrowDown,
  ArrowUp,
  AlertCircle,
} from "lucide-react";
import {
  ColumnHeader,
  ColumnOption,
  ColumnDivider,
  ColumnSection,
  ColumnSearchInput,
} from "@/components/contacts/column-header";

export const dynamic = "force-dynamic";

const TYPE_OPTIONS = [
  { key: "all", label: "All types", Icon: Users },
  { key: "private", label: "Private", Icon: Users },
  { key: "group", label: "Group", Icon: MessageSquare },
  { key: "official", label: "Official", Icon: Building },
  { key: "folded", label: "Folded", Icon: Folder },
] as const;

const VIEW_OPTIONS = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

interface SortInfo {
  key: "name" | "type" | "messages" | "urls" | "recent";
  direction: "asc" | "desc";
}

function parseSort(raw: string | undefined): SortInfo {
  switch (raw) {
    case "name":         return { key: "name", direction: "asc" };
    case "name-desc":    return { key: "name", direction: "desc" };
    case "messages":     return { key: "messages", direction: "desc" };
    case "messages-asc": return { key: "messages", direction: "asc" };
    case "urls":         return { key: "urls", direction: "desc" };
    case "urls-asc":     return { key: "urls", direction: "asc" };
    case "recent-asc":   return { key: "recent", direction: "asc" };
    case "recent":
    default:             return { key: "recent", direction: "desc" };
  }
}

/** Encode a sort key+direction back to the URL value the queries layer reads. */
function sortValue(key: SortInfo["key"], direction: "asc" | "desc"): string {
  if (key === "recent") return direction === "desc" ? "recent" : "recent-asc";
  if (key === "name") return direction === "asc" ? "name" : "name-desc";
  // messages, urls
  return direction === "desc" ? key : `${key}-asc`;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; q?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "all";
  const sort = parseSort(sp.sort);
  const q = sp.q ?? "";
  const view = sp.view ?? "active";

  const rows = listSessions({
    type,
    sort: sp.sort,
    q,
    limit: 300,
    onlyArchived: view === "archived",
    includeArchived: view === "all",
  });

  /** Build a URL with the current params overridden. Pass null to strip a key. */
  function href(overrides: Record<string, string | null>): string {
    const base = { type, sort: sp.sort, q, view } as Record<string, string | undefined>;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) {
      if (v && !(k in overrides)) usp.set(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== null && v !== "") usp.set(k, v);
    }
    const qs = usp.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  }

  const typeActive = type !== "all";
  const filterCount =
    (typeActive ? 1 : 0) + (q ? 1 : 0) + (view !== "active" ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length.toLocaleString()} session
            {rows.length === 1 ? "" : "s"}
            {filterCount > 0 && " matching filters"}
            {view === "archived" && " · viewing archived"}
            {view === "all" && " · including archived"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterCount > 0 && (
            <Link
              href="/contacts"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Clear all filters"
            >
              <X className="size-3.5" /> Clear
            </Link>
          )}
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

      {/* Active-filter chips so removing a single filter is one click without
          having to re-open the column popover. */}
      {(q || typeActive || view !== "active") && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {q && (
            <Chip label={`Name: ${q}`} href={href({ q: null })} />
          )}
          {typeActive && (
            <Chip label={`Type: ${type}`} href={href({ type: null })} />
          )}
          {view !== "active" && (
            <Chip label={`View: ${view}`} href={href({ view: null })} />
          )}
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">
                  <ColumnHeader
                    label="Name"
                    sortDirection={sort.key === "name" ? sort.direction : undefined}
                    filterActive={!!q}
                  >
                    <ColumnSection label="Sort" />
                    <ColumnOption
                      href={href({ sort: sortValue("name", "asc") })}
                      active={sort.key === "name" && sort.direction === "asc"}
                      icon={<ArrowDown className="size-3.5" />}
                    >
                      A → Z
                    </ColumnOption>
                    <ColumnOption
                      href={href({ sort: sortValue("name", "desc") })}
                      active={sort.key === "name" && sort.direction === "desc"}
                      icon={<ArrowUp className="size-3.5" />}
                    >
                      Z → A
                    </ColumnOption>
                    <ColumnDivider />
                    <ColumnSection label="Filter" />
                    <ColumnSearchInput
                      path="/contacts"
                      name="q"
                      initial={q}
                      currentParams={Object.fromEntries(
                        Object.entries({ type, sort: sp.sort, view })
                          .filter(([, v]) => v) as [string, string][],
                      )}
                      clearHref={href({ q: null })}
                    />
                  </ColumnHeader>
                </TableHead>
                <TableHead>
                  <ColumnHeader
                    label="Type"
                    filterActive={typeActive}
                  >
                    <ColumnSection label="Show type" />
                    {TYPE_OPTIONS.map((t) => {
                      const Icon = t.Icon;
                      return (
                        <ColumnOption
                          key={t.key}
                          href={href({ type: t.key === "all" ? null : t.key })}
                          active={
                            (t.key === "all" && type === "all") || type === t.key
                          }
                          icon={<Icon className="size-3.5" />}
                        >
                          {t.label}
                        </ColumnOption>
                      );
                    })}
                    <ColumnDivider />
                    <ColumnSection label="Archived" />
                    {VIEW_OPTIONS.map((v) => (
                      <ColumnOption
                        key={v.key}
                        href={href({ view: v.key === "active" ? null : v.key })}
                        active={view === v.key}
                      >
                        {v.label}
                      </ColumnOption>
                    ))}
                  </ColumnHeader>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end">
                    <ColumnHeader
                      label="Messages"
                      align="right"
                      sortDirection={
                        sort.key === "messages" ? sort.direction : undefined
                      }
                    >
                      <ColumnSection label="Sort" />
                      <ColumnOption
                        href={href({ sort: sortValue("messages", "desc") })}
                        active={
                          sort.key === "messages" && sort.direction === "desc"
                        }
                        icon={<ArrowUp className="size-3.5" />}
                      >
                        High → Low
                      </ColumnOption>
                      <ColumnOption
                        href={href({ sort: sortValue("messages", "asc") })}
                        active={
                          sort.key === "messages" && sort.direction === "asc"
                        }
                        icon={<ArrowDown className="size-3.5" />}
                      >
                        Low → High
                      </ColumnOption>
                    </ColumnHeader>
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end">
                    <ColumnHeader
                      label="Links"
                      align="right"
                      sortDirection={
                        sort.key === "urls" ? sort.direction : undefined
                      }
                    >
                      <ColumnSection label="Sort" />
                      <ColumnOption
                        href={href({ sort: sortValue("urls", "desc") })}
                        active={sort.key === "urls" && sort.direction === "desc"}
                        icon={<ArrowUp className="size-3.5" />}
                      >
                        High → Low
                      </ColumnOption>
                      <ColumnOption
                        href={href({ sort: sortValue("urls", "asc") })}
                        active={sort.key === "urls" && sort.direction === "asc"}
                        icon={<ArrowDown className="size-3.5" />}
                      >
                        Low → High
                      </ColumnOption>
                    </ColumnHeader>
                  </div>
                </TableHead>
                <TableHead className="text-right pr-6">
                  <div className="flex justify-end">
                    <ColumnHeader
                      label="Last active"
                      align="right"
                      sortDirection={
                        sort.key === "recent" ? sort.direction : undefined
                      }
                    >
                      <ColumnSection label="Sort" />
                      <ColumnOption
                        href={href({ sort: sortValue("recent", "desc") })}
                        active={
                          sort.key === "recent" && sort.direction === "desc"
                        }
                        icon={<ArrowUp className="size-3.5" />}
                      >
                        Newest first
                      </ColumnOption>
                      <ColumnOption
                        href={href({ sort: sortValue("recent", "asc") })}
                        active={
                          sort.key === "recent" && sort.direction === "asc"
                        }
                        icon={<ArrowDown className="size-3.5" />}
                      >
                        Oldest first
                      </ColumnOption>
                    </ColumnHeader>
                  </div>
                </TableHead>
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
                    <CountCell n={row.message_count} capNote={row.last_history_error} />
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

/**
 * Per-row message count cell. When the indexer's per-chat history fetch hit
 * its cap on the LAST run it stores a `hit X-msg cap, rerun deep index…`
 * marker on the session row; we surface that with an amber icon + tooltip
 * so the user knows the number is a lower bound and another deep-index
 * pass will extend it. A heuristic 10k-equality fallback catches sessions
 * whose history was capped under the old 10k single-run limit and never
 * re-indexed under the new logic.
 */
function CountCell({ n, capNote }: { n: number; capNote: string | null }) {
  const stillCapped = capNote ? capNote.startsWith("hit ") : false;
  const legacyCapped = n === 10_000 && !capNote;
  const looksCapped = stillCapped || legacyCapped;
  const tooltip = stillCapped
    ? `${n.toLocaleString()} indexed · ${capNote}. Run Deep index from Settings to continue backfilling.`
    : legacyCapped
      ? `${n.toLocaleString()} indexed — likely capped under the old 10,000-msg limit. Run Deep index from Settings to backfill older history.`
      : undefined;
  return (
    <span
      className={
        looksCapped ? "inline-flex items-center gap-1 cursor-help" : undefined
      }
      title={tooltip}
    >
      {n.toLocaleString()}
      {looksCapped && <AlertCircle className="size-3 text-amber-500" />}
    </span>
  );
}

function Chip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md bg-muted hover:bg-accent px-2 py-1 text-foreground transition-colors"
    >
      <span>{label}</span>
      <X className="size-3 text-muted-foreground" />
    </Link>
  );
}
