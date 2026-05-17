import { Suspense } from "react";
import { dbPath, getMeta } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { statSync } from "node:fs";
import { ReindexButtons } from "./reindex-buttons";
import { HygienePanel } from "./hygiene-panel";
import { listArchiveCandidates, listArchived, ensureMeDetected, detectMeHandles, ensureDistinctSendersBackfilled, getSettingsCounts } from "@/lib/queries";
import { getCacheStats } from "@/lib/cache";
import { CachePanel } from "./cache-panel";
import { AlertTriangle, Languages, Clock } from "lucide-react";
import { LanguagePanel } from "./language-panel";
import { t, tf, type Locale, type TKey } from "@/lib/i18n";
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
  const path = dbPath();
  let sizeMB = "—";
  try {
    sizeMB = (statSync(path).size / 1024 / 1024).toFixed(1);
  } catch {}

  // Cached aggregate — invalidated on next index epoch. Without this, every
  // Settings render runs five full-table COUNT(*)s (~6s cold on a 1M-msg DB).
  const counts = getSettingsCounts();

  // Suggest a Deep index when none has ever run or the last one was >30 days
  // ago. Deep indexing rebuilds full-text search and the contact analytics,
  // and a stale index is the most common reason "/me" or "/contacts/<u>"
  // looks empty for a chat the user is actively using.
  const deepAgeMs = lastDeep ? Date.now() - Number(lastDeep) : null;
  const STALE_DEEP_MS = 30 * 24 * 60 * 60 * 1000;
  const deepStale = !lastDeep || (deepAgeMs !== null && deepAgeMs > STALE_DEEP_MS);

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
          <CardTitle>{tr("settings.indexStatus")}</CardTitle>
          <CardDescription>{tr("settings.indexStatusDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{tr("settings.lastQuickIndex")}</dt>
            <dd className="text-right tabular-nums">
              {lastQuick
                ? formatDistanceToNow(new Date(Number(lastQuick)), { addSuffix: true })
                : tr("settings.never")}
            </dd>
            <dt className="text-muted-foreground">{tr("settings.lastDeepIndex")}</dt>
            <dd className="text-right tabular-nums">
              {lastDeep
                ? formatDistanceToNow(new Date(Number(lastDeep)), { addSuffix: true })
                : tr("settings.never")}
            </dd>
            <dt className="text-muted-foreground">{tr("settings.sessions")}</dt>
            <dd className="text-right tabular-nums">
              {(counts.sessions - counts.archived).toLocaleString()}
              {counts.archived > 0 && (
                <span className="text-muted-foreground">
                  {" "}· {counts.archived} {tr("settings.archivedSuffix")}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">{tr("settings.messages")}</dt>
            <dd className="text-right tabular-nums">{counts.messages.toLocaleString()}</dd>
            <dt className="text-muted-foreground">{tr("settings.urls")}</dt>
            <dd className="text-right tabular-nums">{counts.urls.toLocaleString()}</dd>
            <dt className="text-muted-foreground">{tr("settings.contacts")}</dt>
            <dd className="text-right tabular-nums">{counts.contacts.toLocaleString()}</dd>
          </dl>

          {deepStale && (
            <div className="flex gap-3 items-start rounded-md border border-sky-500/30 bg-sky-50/60 dark:bg-sky-900/10 px-3 py-2.5 text-xs">
              <Clock className="size-4 shrink-0 text-sky-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sky-900 dark:text-sky-200">
                  {tr("settings.deepStaleTitle")}
                </p>
                <p className="text-muted-foreground">
                  {lastDeep
                    ? tf("settings.deepStaleDesc", locale, {
                        ago: formatDistanceToNow(new Date(Number(lastDeep)), { addSuffix: true }),
                      })
                    : tr("settings.deepNeverDesc")}
                </p>
              </div>
            </div>
          )}

          {(counts.messages_unmatched > 0 || counts.urls_unmatched > 0) && (
            <div className="flex gap-3 items-start rounded-md border border-amber-500/30 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2.5 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {tf("settings.unmatchedTitle", locale, {
                    m: counts.messages_unmatched.toLocaleString(),
                    u: counts.urls_unmatched.toLocaleString(),
                  })}
                </p>
                <p className="text-muted-foreground">{tr("settings.unmatchedDesc")}</p>
              </div>
            </div>
          )}

          <ReindexButtons />
        </CardContent>
      </Card>

      <Suspense fallback={<HygienePanelSkeleton locale={locale} />}>
        <HygienePanelLoader meHandles={meHandles} meRankings={meRankings} />
      </Suspense>

      <CachePanel stats={cacheStats} />

      <Card>
        <CardHeader>
          <CardTitle>{tr("settings.storage")}</CardTitle>
          <CardDescription>{tr("settings.storageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{tr("settings.indexPath")}</dt>
            <dd className="font-mono text-xs break-all">{path}</dd>
            <dt className="text-muted-foreground">{tr("settings.indexSize")}</dt>
            <dd className="tabular-nums">{sizeMB} MB</dd>
            <dt className="text-muted-foreground">{tr("settings.sourceDb")}</dt>
            <dd className="text-muted-foreground">
              {tr("settings.sourceDbValue")} <code>wx-cli</code>
            </dd>
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

function HygienePanelSkeleton({ locale }: { locale: Locale }) {
  const tr = (k: TKey) => t(k, locale);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("settings.hygieneTitle")}</CardTitle>
        <CardDescription>{tr("settings.hygieneLoading")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}
