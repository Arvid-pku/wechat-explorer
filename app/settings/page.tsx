import { Suspense } from "react";
import { getDb, dbPath, getMeta } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { statSync } from "node:fs";
import { ReindexButtons } from "./reindex-buttons";
import { HygienePanel } from "./hygiene-panel";
import { listArchiveCandidates, listArchived, ensureMeDetected, detectMeHandles, ensureDistinctSendersBackfilled } from "@/lib/queries";
import { getCacheStats } from "@/lib/cache";
import { CachePanel } from "./cache-panel";
import { AlertTriangle, Languages } from "lucide-react";
import { LanguagePanel } from "./language-panel";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// HygienePanel's default selection is "stale ≥ 180 days, groups only,
// not one-sided" — preload exactly that preset on the server, fetch other
// preset combinations from /api/archive-candidates on demand when the user
// picks a different filter. The old approach pre-loaded all 30 combinations
// up front and made the page ~7.5s cold.
const DEFAULT_STALE = 180;
const DEFAULT_TYPES: ("private" | "group" | "official")[] = ["group"];
const DEFAULT_TYPE_KEY = "group";
const DEFAULT_ONE_SIDED = false;

export default async function SettingsPage() {
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const lastQuick = getMeta("last_quick_index_at");
  const lastDeep = getMeta("last_deep_index_at");
  const db = getDb();
  const path = dbPath();
  let sizeMB = "—";
  try {
    sizeMB = (statSync(path).size / 1024 / 1024).toFixed(1);
  } catch {}

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM sessions) AS sessions,
         (SELECT COUNT(*) FROM sessions WHERE archived = 1) AS archived,
         (SELECT COUNT(*) FROM contacts) AS contacts,
         (SELECT COUNT(*) FROM messages) AS messages,
         (SELECT COUNT(*) FROM urls) AS urls,
         (SELECT COUNT(*) FROM messages WHERE chat_username IS NULL) AS messages_unmatched,
         (SELECT COUNT(*) FROM urls WHERE chat_username IS NULL) AS urls_unmatched`,
    )
    .get() as {
    sessions: number;
    archived: number;
    contacts: number;
    messages: number;
    urls: number;
    messages_unmatched: number;
    urls_unmatched: number;
  };

  const { handles: meHandles } = ensureMeDetected();
  ensureDistinctSendersBackfilled();
  const meRankings = detectMeHandles().rankings;
  const cacheStats = getCacheStats();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{tr("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tr("settings.desc")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4" /> {tr("settings.language")}
          </CardTitle>
          <CardDescription>{tr("settings.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguagePanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Index status</CardTitle>
          <CardDescription>Trigger fresh indexing runs against your local WeChat data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Last quick index</dt>
            <dd className="text-right tabular-nums">
              {lastQuick
                ? formatDistanceToNow(new Date(Number(lastQuick)), { addSuffix: true })
                : "Never"}
            </dd>
            <dt className="text-muted-foreground">Last deep index</dt>
            <dd className="text-right tabular-nums">
              {lastDeep
                ? formatDistanceToNow(new Date(Number(lastDeep)), { addSuffix: true })
                : "Never"}
            </dd>
            <dt className="text-muted-foreground">Sessions</dt>
            <dd className="text-right tabular-nums">
              {(counts.sessions - counts.archived).toLocaleString()}
              {counts.archived > 0 && (
                <span className="text-muted-foreground"> · {counts.archived} archived</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Messages</dt>
            <dd className="text-right tabular-nums">{counts.messages.toLocaleString()}</dd>
            <dt className="text-muted-foreground">URLs</dt>
            <dd className="text-right tabular-nums">{counts.urls.toLocaleString()}</dd>
            <dt className="text-muted-foreground">Contacts</dt>
            <dd className="text-right tabular-nums">{counts.contacts.toLocaleString()}</dd>
          </dl>

          {(counts.messages_unmatched > 0 || counts.urls_unmatched > 0) && (
            <div className="flex gap-3 items-start rounded-md border border-amber-500/30 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2.5 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {counts.messages_unmatched.toLocaleString()} messages and{" "}
                  {counts.urls_unmatched.toLocaleString()} URLs aren&apos;t linked to a session
                </p>
                <p className="text-muted-foreground">
                  Backfill skips ambiguous matches — most often display names shared by
                  multiple sessions in WeChat (e.g. several &ldquo;工作群&rdquo;).
                  These rows are still searchable but won&apos;t roll up into a contact
                  page. Rename the colliding contacts in WeChat to recover them.
                </p>
              </div>
            </div>
          )}

          <ReindexButtons />
        </CardContent>
      </Card>

      <Suspense fallback={<HygienePanelSkeleton />}>
        <HygienePanelLoader meHandles={meHandles} meRankings={meRankings} />
      </Suspense>

      <CachePanel stats={cacheStats} />

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>Where the explorer keeps its derived index.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Index path</dt>
            <dd className="font-mono text-xs break-all">{path}</dd>
            <dt className="text-muted-foreground">Index size</dt>
            <dd className="tabular-nums">{sizeMB} MB</dd>
            <dt className="text-muted-foreground">Source DB</dt>
            <dd className="text-muted-foreground">Read-only via <code>wx-cli</code></dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Async server component that loads only the default preset + the archived
 * list. Runs inside a Suspense boundary on the Settings page so the header
 * and other panels render immediately.
 */
async function HygienePanelLoader({
  meHandles,
  meRankings,
}: {
  meHandles: string[];
  meRankings: ReturnType<typeof detectMeHandles>["rankings"];
}) {
  const defaultRows = listArchiveCandidates({
    staleDays: DEFAULT_STALE,
    types: DEFAULT_TYPES,
    onlyOneSided: DEFAULT_ONE_SIDED,
  });
  const archived = listArchived();
  const defaultKey = `${DEFAULT_ONE_SIDED ? "one" : "any"}:${DEFAULT_TYPE_KEY}:${DEFAULT_STALE}`;
  const initialPreset = {
    key: defaultKey,
    stale: DEFAULT_STALE,
    typeKey: DEFAULT_TYPE_KEY,
    oneSided: DEFAULT_ONE_SIDED,
    rows: defaultRows,
  };
  return (
    <HygienePanel
      initialPreset={initialPreset}
      archived={archived}
      meHandles={meHandles}
      meRankings={meRankings}
    />
  );
}

function HygienePanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat hygiene</CardTitle>
        <CardDescription>Loading archive candidates…</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}
