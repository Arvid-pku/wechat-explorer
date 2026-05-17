import Link from "next/link";
import { listSessions, countSessions } from "@/lib/queries";
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
import { t, tf, type Locale, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const TYPE_OPTIONS = [
  { key: "all", labelKey: "contacts.typeAll", Icon: Users },
  { key: "private", labelKey: "contacts.typePrivate", Icon: Users },
  { key: "group", labelKey: "contacts.typeGroup", Icon: MessageSquare },
  { key: "official", labelKey: "contacts.typeOfficial", Icon: Building },
  { key: "folded", labelKey: "contacts.typeFolded", Icon: Folder },
] as const;

const VIEW_OPTIONS = [
  { key: "active", labelKey: "contacts.viewActive" },
  { key: "archived", labelKey: "contacts.viewArchived" },
  { key: "all", labelKey: "contacts.viewAll" },
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
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  // Validate filter inputs against their option-key allowlist so a stray /
  // crafted ?type= can't produce confusing filter chips ("Type: <script>")
  // or empty SQL results. Unknown values fall back to the safe default.
  const VALID_TYPES = new Set(TYPE_OPTIONS.map((o) => o.key as string));
  const VALID_VIEWS = new Set(VIEW_OPTIONS.map((o) => o.key as string));
  const type = sp.type && VALID_TYPES.has(sp.type) ? sp.type : "all";
  const sort = parseSort(sp.sort);
  const q = sp.q ?? "";
  const view = sp.view && VALID_VIEWS.has(sp.view) ? sp.view : "active";

  const PAGE_LIMIT = 300;
  const rows = listSessions({
    type,
    sort: sp.sort,
    q,
    limit: PAGE_LIMIT,
    onlyArchived: view === "archived",
    includeArchived: view === "all",
  });
  // Used to render "Showing N of M" so users don't think the 300-row cap is
  // the absolute total.
  const totalMatching = countSessions({
    type,
    q,
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
  const sessionWord = (n: number) =>
    locale === "zh" ? tr("contacts.session") : n === 1 ? tr("contacts.session") : tr("contacts.sessions");

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{tr("contacts.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length < totalMatching ? (
              <>
                {locale === "zh" ? (
                  <>
                    {tr("contacts.showingOf").replace("{n}", "")}
                    <span className="tabular-nums">{rows.length.toLocaleString()}</span>
                    {" / 共 "}
                    <span className="tabular-nums">{totalMatching.toLocaleString()}</span>
                    {" "}
                    {sessionWord(totalMatching)}
                  </>
                ) : (
                  <>
                    Showing <span className="tabular-nums">{rows.length.toLocaleString()}</span> of{" "}
                    <span className="tabular-nums">{totalMatching.toLocaleString()}</span>{" "}
                    {sessionWord(totalMatching)}
                  </>
                )}
              </>
            ) : (
              <>
                <span className="tabular-nums">{totalMatching.toLocaleString()}</span>{" "}
                {sessionWord(totalMatching)}
              </>
            )}
            {filterCount > 0 && " " + tr("contacts.matchingFilters")}
            {view === "archived" && " · " + tr("contacts.viewingArchived")}
            {view === "all" && " · " + tr("contacts.includingArchived")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterCount > 0 && (
            <Link
              href="/contacts"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
              title={tr("contacts.clearAll")}
            >
              <X className="size-3.5" /> {tr("contacts.clear")}
            </Link>
          )}
          <a
            href="/api/export/sessions?format=csv"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            title={tr("contacts.downloadCsv")}
          >
            <Download className="size-3.5" /> {tr("contacts.csv")}
          </a>
          <a
            href="/api/export/sessions?format=json"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            title={tr("contacts.downloadJson")}
          >
            <Download className="size-3.5" /> {tr("contacts.json")}
          </a>
        </div>
      </header>

      {/* Active-filter chips so removing a single filter is one click without
          having to re-open the column popover. */}
      {(q || typeActive || view !== "active") && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {q && (
            <Chip label={`${tr("contacts.chipName")}: ${q}`} href={href({ q: null })} />
          )}
          {typeActive && (
            <Chip
              label={`${tr("contacts.chipType")}: ${typeLabel(type, locale)}`}
              href={href({ type: null })}
            />
          )}
          {view !== "active" && (
            <Chip
              label={`${tr("contacts.chipView")}: ${viewLabel(view, locale)}`}
              href={href({ view: null })}
            />
          )}
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">
                  <ColumnHeader
                    label={tr("contacts.colName")}
                    sortDirection={sort.key === "name" ? sort.direction : undefined}
                    filterActive={!!q}
                  >
                    <ColumnSection label={tr("contacts.sectionSort")} />
                    <ColumnOption
                      href={href({ sort: sortValue("name", "asc") })}
                      active={sort.key === "name" && sort.direction === "asc"}
                      icon={<ArrowDown className="size-3.5" />}
                    >
                      {tr("contacts.sortAZ")}
                    </ColumnOption>
                    <ColumnOption
                      href={href({ sort: sortValue("name", "desc") })}
                      active={sort.key === "name" && sort.direction === "desc"}
                      icon={<ArrowUp className="size-3.5" />}
                    >
                      {tr("contacts.sortZA")}
                    </ColumnOption>
                    <ColumnDivider />
                    <ColumnSection label={tr("contacts.sectionFilter")} />
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
                    label={tr("contacts.colType")}
                    filterActive={typeActive}
                  >
                    <ColumnSection label={tr("contacts.sectionShowType")} />
                    {TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.Icon;
                      return (
                        <ColumnOption
                          key={opt.key}
                          href={href({ type: opt.key === "all" ? null : opt.key })}
                          active={
                            (opt.key === "all" && type === "all") || type === opt.key
                          }
                          icon={<Icon className="size-3.5" />}
                        >
                          {tr(opt.labelKey as TKey)}
                        </ColumnOption>
                      );
                    })}
                    <ColumnDivider />
                    <ColumnSection label={tr("contacts.sectionArchived")} />
                    {VIEW_OPTIONS.map((v) => (
                      <ColumnOption
                        key={v.key}
                        href={href({ view: v.key === "active" ? null : v.key })}
                        active={view === v.key}
                      >
                        {tr(v.labelKey as TKey)}
                      </ColumnOption>
                    ))}
                  </ColumnHeader>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end">
                    <ColumnHeader
                      label={tr("contacts.colMessages")}
                      align="right"
                      sortDirection={
                        sort.key === "messages" ? sort.direction : undefined
                      }
                    >
                      <ColumnSection label={tr("contacts.sectionSort")} />
                      <ColumnOption
                        href={href({ sort: sortValue("messages", "desc") })}
                        active={
                          sort.key === "messages" && sort.direction === "desc"
                        }
                        icon={<ArrowUp className="size-3.5" />}
                      >
                        {tr("contacts.sortHighLow")}
                      </ColumnOption>
                      <ColumnOption
                        href={href({ sort: sortValue("messages", "asc") })}
                        active={
                          sort.key === "messages" && sort.direction === "asc"
                        }
                        icon={<ArrowDown className="size-3.5" />}
                      >
                        {tr("contacts.sortLowHigh")}
                      </ColumnOption>
                    </ColumnHeader>
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end">
                    <ColumnHeader
                      label={tr("contacts.colLinks")}
                      align="right"
                      sortDirection={
                        sort.key === "urls" ? sort.direction : undefined
                      }
                    >
                      <ColumnSection label={tr("contacts.sectionSort")} />
                      <ColumnOption
                        href={href({ sort: sortValue("urls", "desc") })}
                        active={sort.key === "urls" && sort.direction === "desc"}
                        icon={<ArrowUp className="size-3.5" />}
                      >
                        {tr("contacts.sortHighLow")}
                      </ColumnOption>
                      <ColumnOption
                        href={href({ sort: sortValue("urls", "asc") })}
                        active={sort.key === "urls" && sort.direction === "asc"}
                        icon={<ArrowDown className="size-3.5" />}
                      >
                        {tr("contacts.sortLowHigh")}
                      </ColumnOption>
                    </ColumnHeader>
                  </div>
                </TableHead>
                <TableHead className="text-right pr-6">
                  <div className="flex justify-end">
                    <ColumnHeader
                      label={tr("contacts.colLastActive")}
                      align="right"
                      sortDirection={
                        sort.key === "recent" ? sort.direction : undefined
                      }
                    >
                      <ColumnSection label={tr("contacts.sectionSort")} />
                      <ColumnOption
                        href={href({ sort: sortValue("recent", "desc") })}
                        active={
                          sort.key === "recent" && sort.direction === "desc"
                        }
                        icon={<ArrowUp className="size-3.5" />}
                      >
                        {tr("contacts.sortNewest")}
                      </ColumnOption>
                      <ColumnOption
                        href={href({ sort: sortValue("recent", "asc") })}
                        active={
                          sort.key === "recent" && sort.direction === "asc"
                        }
                        icon={<ArrowDown className="size-3.5" />}
                      >
                        {tr("contacts.sortOldest")}
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
                        {row.unread} {tr("contacts.unread")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={row.chat_type} locale={locale} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    <CountCell
                      n={row.message_count}
                      capNote={row.last_history_error}
                      locale={locale}
                    />
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
                    {tr("contacts.noSessions")}
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

function typeLabel(type: string, locale: Locale): string {
  const tr = (k: TKey) => t(k, locale);
  switch (type) {
    case "private":  return tr("contacts.typePrivate");
    case "group":    return tr("contacts.typeGroup");
    case "official": return tr("contacts.typeOfficial");
    case "folded":   return tr("contacts.typeFolded");
    default:         return type;
  }
}

function viewLabel(view: string, locale: Locale): string {
  const tr = (k: TKey) => t(k, locale);
  switch (view) {
    case "active":   return tr("contacts.viewActive");
    case "archived": return tr("contacts.viewArchived");
    case "all":      return tr("contacts.viewAll");
    default:         return view;
  }
}

function TypeBadge({ type, locale }: { type: string; locale: Locale }) {
  const variants: Record<string, string> = {
    private: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    group: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    official: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    folded: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    other: "bg-muted text-muted-foreground",
  };
  const klass = variants[type] ?? variants.other;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${klass}`}>
      {typeLabel(type, locale)}
    </span>
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
function CountCell({
  n,
  capNote,
  locale,
}: {
  n: number;
  capNote: string | null;
  locale: Locale;
}) {
  const stillCapped = capNote ? capNote.startsWith("hit ") : false;
  const legacyCapped = n === 10_000 && !capNote;
  const looksCapped = stillCapped || legacyCapped;
  const tooltip = stillCapped
    ? tf("contacts.cappedTooltip", locale, { n: n.toLocaleString(), note: capNote ?? "" })
    : legacyCapped
      ? tf("contacts.cappedLegacyTooltip", locale, { n: n.toLocaleString() })
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
