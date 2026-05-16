"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Database } from "lucide-react";
import { toast } from "sonner";
import type { CacheStats } from "@/lib/cache";
import { formatDistanceToNow } from "date-fns";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function CachePanel({ stats }: { stats: CacheStats }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clearAll() {
    if (
      !confirm(
        `Drop all ${stats.rows.toLocaleString()} cached aggregates? Subsequent page loads will recompute from scratch and be slow until each cache row is warmed again.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const tid = toast.loading("Clearing cache…");
    try {
      const res = await fetch("/api/cache", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      toast.success(`Dropped ${j.dropped} cached rows`, { id: tid });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            Query cache
          </CardTitle>
          <CardDescription>
            Persistent, epoch-invalidated cache for expensive aggregates (recap,
            me-stats, year keywords). Indexed data and archive state are
            stamped on each cached row, so anything past stays fresh as long as
            the index doesn&apos;t change.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={busy || stats.rows === 0}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Clear all
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Cached rows" value={stats.rows.toLocaleString()} />
          <Stat label="Total size" value={fmtBytes(stats.totalBytes)} />
          <Stat label="Total hits" value={stats.totalHits.toLocaleString()} />
          <Stat
            label="Epochs"
            value={`idx ${stats.epochs.index} · arc ${stats.epochs.archive}`}
          />
        </div>

        {stats.topByHits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Most-hit cached rows
            </p>
            <ul className="space-y-1 text-xs">
              {stats.topByHits.slice(0, 8).map((r) => (
                <li
                  key={r.cache_key}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-accent/40"
                >
                  <code className="text-[11px] truncate flex-1 font-mono">
                    {r.cache_key}
                  </code>
                  <Badge variant="secondary" className="font-normal tabular-nums">
                    {r.hits} hits
                  </Badge>
                  <span className="text-muted-foreground tabular-nums w-16 text-right">
                    {fmtBytes(r.size_bytes)}
                  </span>
                  <span className="text-muted-foreground text-[10px] tabular-nums w-24 text-right">
                    {formatDistanceToNow(new Date(r.computed_at), {
                      addSuffix: true,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Invalidation: a fresh index bumps the index epoch; archiving / restoring
          a session bumps the archive epoch. Either causes affected rows to be
          recomputed on next read — no manual clear needed in normal use.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
