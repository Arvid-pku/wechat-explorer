import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getDb } from "@/lib/db";
import { getHeatmap } from "@/lib/queries";
import {
  getCoveredYears,
  getDayHourly,
  getDayKeywords,
  getDayMessagesGrouped,
  getOnThisDay,
  getYearKeywords,
  getYearSummary,
} from "@/lib/queries.calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { HeatmapClient } from "./client";
import { HourlyHeatmap } from "@/components/charts/hourly-heatmap";
import { KeywordCloud } from "@/components/charts/keyword-cloud";
import {
  ArchivedFilterPill,
  buildArchivedFilterHref,
} from "@/components/archived-filter-pill";
import { X, UserCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function isValidDay(s: string | undefined, year: number): s is string {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  if (!s.startsWith(String(year))) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/**
 * Build a calendar URL preserving the current params but overriding selected
 * ones. Passing `null` for a key strips that param. Keeps `chat=` / `archived=`
 * sticky as the user clicks across years / days inside a scoped view.
 */
function calendarHref(
  sp: Record<string, string | undefined>,
  overrides: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && !(k in overrides)) next.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== null) next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/calendar?${qs}` : "/calendar";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    day?: string;
    archived?: string;
    chat?: string;
  }>;
}) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";

  // Resolve the chat scope first — if the username doesn't match any session
  // (mangled URL, deleted contact), silently fall back to the global view.
  let scopeUsername: string | null = null;
  let scopeDisplay: string | null = null;
  if (sp.chat) {
    const row = getDb()
      .prepare(`SELECT username, display_name FROM sessions WHERE username = ?`)
      .get(sp.chat) as { username: string; display_name: string } | undefined;
    if (row) {
      scopeUsername = row.username;
      scopeDisplay = row.display_name;
    }
  }

  const covered = getCoveredYears({ chatUsername: scopeUsername });
  const defaultYear = covered[0] ?? new Date().getFullYear();
  const parsedYear = sp.year ? parseInt(sp.year, 10) : NaN;
  const year =
    !Number.isNaN(parsedYear) && covered.includes(parsedYear)
      ? parsedYear
      : defaultYear;
  const day = isValidDay(sp.day, year) ? sp.day : undefined;

  const data = getHeatmap(year, { includeArchived, chatUsername: scopeUsername });
  const summary = getYearSummary(year, {
    includeArchived,
    chatUsername: scopeUsername,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {summary.total.toLocaleString()} messages in {year}
            {summary.busiestDay ? (
              <>
                {" · busiest day "}
                <Link
                  href={calendarHref(sp, { year: String(year), day: summary.busiestDay.day })}
                  className="underline-offset-2 hover:underline"
                >
                  {summary.busiestDay.day}
                </Link>
                {" ("}
                {summary.busiestDay.n.toLocaleString()}
                {")"}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {covered.map((y) => {
              const overrides: Record<string, string | null> = { year: String(y) };
              // Only carry `day` across when the destination year still owns it.
              if (!(day && day.startsWith(String(y)))) overrides.day = null;
              return (
                <Link
                  key={y}
                  href={calendarHref(sp, overrides)}
                  className={`rounded-md border border-border/60 px-3 py-1 text-sm hover:bg-accent ${
                    y === year ? "bg-accent" : ""
                  }`}
                >
                  {y}
                </Link>
              );
            })}
          </div>
          <ArchivedFilterPill
            on={includeArchived}
            href={buildArchivedFilterHref("/calendar", sp, includeArchived)}
          />
          <Link
            href={
              scopeUsername
                ? `/recap/${year}/${encodeURIComponent(scopeUsername)}${
                    includeArchived ? "?archived=1" : ""
                  }`
                : `/recap/${year}${includeArchived ? "?archived=1" : ""}`
            }
            className="rounded-md border border-border/60 px-3 py-1 text-sm hover:bg-accent"
          >
            View {year} Recap →
          </Link>
        </div>
      </header>

      {scopeUsername && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <UserCircle2 className="size-3.5 text-primary" />
          <span className="text-muted-foreground">Filtered to chat:</span>
          <Link
            href={`/contacts/${encodeURIComponent(scopeUsername)}`}
            className="font-medium text-foreground hover:underline truncate max-w-[40ch]"
          >
            {scopeDisplay ?? scopeUsername}
          </Link>
          <Link
            href={calendarHref(sp, { chat: null })}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Clear chat filter"
          >
            <X className="size-3" /> clear
          </Link>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Activity heatmap — {year}
            {scopeUsername && scopeDisplay && (
              <span className="text-muted-foreground font-normal">
                {" "}· {scopeDisplay}
              </span>
            )}
          </CardTitle>
          <CardDescription>Click any day to deep-dive</CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapClient year={year} data={data} selected={day} />
        </CardContent>
      </Card>

      {day ? (
        <DayDetail
          day={day}
          year={year}
          includeArchived={includeArchived}
          scopeUsername={scopeUsername}
          scopeDisplay={scopeDisplay}
          sp={sp}
        />
      ) : (
        <YearOverview
          year={year}
          summary={summary}
          includeArchived={includeArchived}
          scopeUsername={scopeUsername}
          sp={sp}
        />
      )}
    </div>
  );
}

function YearOverview({
  year,
  summary,
  includeArchived,
  scopeUsername,
  sp,
}: {
  year: number;
  summary: ReturnType<typeof getYearSummary>;
  includeArchived: boolean;
  scopeUsername: string | null;
  sp: Record<string, string | undefined>;
}) {
  const yearKeywords = getYearKeywords(year, {
    includeArchived,
    chatUsername: scopeUsername,
  });
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>What was {year} about</CardTitle>
          <CardDescription>
            {scopeUsername
              ? `Top-30 distinctive terms in this chat in ${year} vs your all-time chat baseline.`
              : `Top-30 distinctive terms in ${year} vs your all-time chat baseline (sampled).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeywordCloud
            words={yearKeywords.words}
            empty="Not enough text in this year to extract keywords."
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Year at a glance</CardTitle>
          <CardDescription>
            {scopeUsername ? `${year} for this chat` : `${year} totals after exclusions`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SummaryRow label="Total messages" value={summary.total.toLocaleString()} />
          {!scopeUsername && (
            <SummaryRow
              label="Unique chats"
              value={summary.uniqueChats.toLocaleString()}
            />
          )}
          <SummaryRow
            label="Your share"
            value={
              summary.myMessages > 0
                ? `${pct(summary.myShare)} (${summary.myMessages.toLocaleString()})`
                : "—"
            }
          />
          <SummaryRow
            label="Busiest day"
            value={
              summary.busiestDay ? (
                <Link
                  href={calendarHref(sp, {
                    year: String(year),
                    day: summary.busiestDay.day,
                  })}
                  className="hover:underline"
                >
                  {summary.busiestDay.day} ({summary.busiestDay.n.toLocaleString()})
                </Link>
              ) : (
                "—"
              )
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function DayDetail({
  day,
  year,
  includeArchived,
  scopeUsername,
  scopeDisplay,
  sp,
}: {
  day: string;
  year: number;
  includeArchived: boolean;
  scopeUsername: string | null;
  scopeDisplay: string | null;
  sp: Record<string, string | undefined>;
}) {
  const groups = getDayMessagesGrouped(day, {
    includeArchived,
    chatUsername: scopeUsername,
  });
  const hourly = getDayHourly(day, {
    includeArchived,
    chatUsername: scopeUsername,
  });
  const keywords = getDayKeywords(day, year, {
    includeArchived,
    chatUsername: scopeUsername,
  });
  const monthDay = day.slice(5);
  const onThisDay = getOnThisDay(monthDay, year, 6, {
    includeArchived,
    chatUsername: scopeUsername,
  });
  const total = hourly.reduce((a, b) => a + b.n, 0);

  const headerDate = (() => {
    const d = new Date(`${day}T00:00:00`);
    return format(d, "EEEE, MMMM d, yyyy");
  })();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            {headerDate}
            <Badge variant="outline" className="font-normal">
              {total.toLocaleString()} messages
            </Badge>
            <Badge variant="outline" className="font-normal">
              {groups.length.toLocaleString()} chat{groups.length === 1 ? "" : "s"}
            </Badge>
            {scopeUsername && scopeDisplay && (
              <Badge variant="secondary" className="font-normal">
                {scopeDisplay}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Hour-by-hour activity for {day}</CardDescription>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              {scopeUsername
                ? "No messages with this chat on this day."
                : "No indexed messages on this day — try a deep index from Settings."}
            </p>
          ) : (
            <HourlyHeatmap data={hourly} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What was on the table</CardTitle>
          <CardDescription>
            Top-30 distinctive terms vs the trailing 365-day sampled baseline
            {keywords.subsetSize > 0
              ? ` · from ${keywords.subsetSize.toLocaleString()} text messages`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeywordCloud
            words={keywords.words}
            empty="Not enough text messages on this day to extract keywords."
          />
        </CardContent>
      </Card>

      {onThisDay.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>On this day in previous years</CardTitle>
            <CardDescription>
              Same {monthDay} across earlier years that have data
              {scopeUsername ? " with this chat" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {onThisDay.map((y) => (
                <Link
                  key={y.year}
                  href={calendarHref(sp, { year: String(y.year), day: y.day })}
                  className="flex items-start gap-3 rounded-md border border-border/60 p-3 hover:bg-accent transition-colors"
                >
                  <Badge className="shrink-0 font-mono">{y.year}</Badge>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      {y.total.toLocaleString()} messages
                    </p>
                    {y.samples.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        (no text snippets — links/images/etc.)
                      </p>
                    ) : (
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {y.samples.slice(0, 3).map((s, i) => (
                          <li
                            key={i}
                            className="truncate"
                            title={`${s.chat_display} · ${s.sender || "—"}`}
                          >
                            <span className="text-foreground/80">
                              {s.chat_display}:
                            </span>{" "}
                            {s.content.slice(0, 80)}
                            {s.content.length > 80 ? "…" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{scopeUsername ? "Messages" : "Chats this day"}</CardTitle>
          <CardDescription>
            {scopeUsername
              ? "Latest messages from this chat on this day"
              : "One row per session, sorted by message count"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing indexed for {day}. If you expect messages here, try a deep
              reindex from Settings.
            </p>
          ) : (
            groups.map((g, i) => (
              <ChatGroupCard
                key={`${g.chat_username ?? "null"}::${g.chat_display}`}
                group={g}
                openByDefault={i === 0 || groups.length === 1}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChatGroupCard({
  group,
  openByDefault,
}: {
  group: ReturnType<typeof getDayMessagesGrouped>[number];
  openByDefault: boolean;
}) {
  const chatHref = group.chat_username
    ? `/contacts/${encodeURIComponent(group.chat_username)}`
    : null;
  const lastAt = group.last_ts
    ? formatDistanceToNow(new Date(group.last_ts * 1000), { addSuffix: true })
    : "";
  return (
    <details
      className="group rounded-md border border-border/60"
      open={openByDefault || undefined}
    >
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm select-none hover:bg-accent/40 rounded-md">
        <span className="font-medium truncate">
          {chatHref ? (
            <Link href={chatHref} className="hover:underline">
              {group.chat_display}
            </Link>
          ) : (
            group.chat_display
          )}
        </span>
        {group.chat_type ? (
          <Badge variant="outline" className="text-xs font-normal">
            {group.chat_type}
          </Badge>
        ) : null}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>{group.n.toLocaleString()} msgs</span>
          {lastAt ? <span>· last {lastAt}</span> : null}
        </span>
      </summary>
      <div className="border-t border-border/60 divide-y divide-border/60">
        {group.sample.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No sample available.</p>
        ) : (
          group.sample.map((m) => (
            <div key={m.id} className="px-3 py-2 text-sm space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                <Separator orientation="vertical" className="h-3" />
                <span>{m.msg_type || "—"}</span>
                <Separator orientation="vertical" className="h-3" />
                <Link
                  href={`/messages/${m.id}`}
                  className="tabular-nums hover:text-foreground hover:underline"
                  title="Open message permalink"
                >
                  {format(new Date(m.timestamp * 1000), "HH:mm:ss")}
                </Link>
              </div>
              <p className="break-words whitespace-pre-wrap">{m.content}</p>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
