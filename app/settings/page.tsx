import { getDb, dbPath, getMeta } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { statSync } from "node:fs";
import { ReindexButtons } from "./reindex-buttons";
import { HygienePanel } from "./hygiene-panel";
import { listArchiveCandidates, listArchived, ensureMeDetected, detectMeHandles, ensureDistinctSendersBackfilled } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STALE_PRESETS = [0, 30, 90, 180, 365];
const TYPE_PRESETS: { key: string; types: ("private" | "group" | "official")[] }[] = [
  { key: "group", types: ["group"] },
  { key: "private+group", types: ["private", "group"] },
  { key: "all", types: ["private", "group", "official"] },
];

export default async function SettingsPage() {
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
         (SELECT COUNT(*) FROM urls) AS urls`,
    )
    .get() as { sessions: number; archived: number; contacts: number; messages: number; urls: number };

  const { handles: meHandles } = ensureMeDetected();
  ensureDistinctSendersBackfilled();
  const meRankings = detectMeHandles().rankings;

  const candidatesByPreset: Record<string, ReturnType<typeof listArchiveCandidates>> = {};
  for (const oneSided of [false, true]) {
    for (const stale of STALE_PRESETS) {
      for (const tp of TYPE_PRESETS) {
        const key = `${oneSided ? "one" : "any"}:${tp.key}:${stale}`;
        candidatesByPreset[key] = listArchiveCandidates({
          staleDays: stale,
          types: tp.types,
          onlyOneSided: oneSided,
        });
      }
    }
  }
  const archived = listArchived();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Index status, chat hygiene, and data location.
        </p>
      </header>

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

          <ReindexButtons />
        </CardContent>
      </Card>

      <HygienePanel
        candidatesByPreset={candidatesByPreset}
        archived={archived}
        meHandles={meHandles}
        meRankings={meRankings}
      />

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
