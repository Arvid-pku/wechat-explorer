"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Loader2, Archive, RotateCcw, UserCircle2, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";

interface Row {
  username: string;
  display_name: string;
  chat_type: string;
  last_timestamp: number | null;
  message_count: number;
  url_count: number;
  archived: number;
  my_msg_count: number;
  distinct_senders: number;
  member_count: number | null;
}

const SIZE_PRESETS = [
  { min: 0, label: "Any size" },
  { min: 50, label: "≥50" },
  { min: 100, label: "≥100" },
  { min: 200, label: "≥200" },
];

function effectiveSize(r: Row): number {
  return r.member_count ?? r.distinct_senders ?? 0;
}

interface Ranking {
  sender: string;
  distinct_chats: number;
  msgs: number;
}

const STALE_PRESETS = [
  { days: 0, label: "Any" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
];

const TYPE_PRESETS = [
  { key: "group", label: "Groups only" },
  { key: "private+group", label: "Private + Group" },
  { key: "all", label: "+ Official" },
];

export interface HygieneInitialPreset {
  key: string;
  stale: number;
  typeKey: string;
  oneSided: boolean;
  rows: Row[];
}

export function HygienePanel({
  initialPreset,
  archived,
  meHandles,
  meRankings,
}: {
  initialPreset: HygieneInitialPreset;
  archived: Row[];
  meHandles: string[];
  meRankings: Ranking[];
}) {
  const router = useRouter();
  const [stale, setStale] = useState(initialPreset.stale);
  const [typeKey, setTypeKey] = useState(initialPreset.typeKey);
  const [oneSided, setOneSided] = useState(initialPreset.oneSided);
  const [minSize, setMinSize] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [fetchingMembers, setFetchingMembers] = useState<{ done: number; total: number } | null>(null);

  // Lazy preset cache — keyed the same way the old server-side cross product
  // was. Seeded with the initial preset; other combos lazy-load from
  // /api/archive-candidates as the user toggles the filters.
  const [presetCache, setPresetCache] = useState<Record<string, Row[]>>(() => ({
    [initialPreset.key]: initialPreset.rows,
  }));
  const [presetLoading, setPresetLoading] = useState(false);
  const inflight = useRef<Map<string, Promise<Row[]>>>(new Map());

  const currentKey = `${oneSided ? "one" : "any"}:${typeKey}:${stale}`;

  useEffect(() => {
    if (presetCache[currentKey] !== undefined) return;
    const existing = inflight.current.get(currentKey);
    if (existing) return;
    setPresetLoading(true);
    const params = new URLSearchParams({
      stale: String(stale),
      type: typeKey,
      oneSided: oneSided ? "1" : "0",
    });
    const p = fetch(`/api/archive-candidates?${params.toString()}`)
      .then((res) => res.json())
      .then((j: { rows?: Row[]; error?: string }) => {
        if (j.error) throw new Error(j.error);
        return j.rows ?? [];
      })
      .then((rows) => {
        setPresetCache((prev) => ({ ...prev, [currentKey]: rows }));
        return rows;
      })
      .catch((err) => {
        toast.error(`Failed to load preset: ${(err as Error).message}`);
        return [] as Row[];
      })
      .finally(() => {
        inflight.current.delete(currentKey);
        setPresetLoading(false);
      });
    inflight.current.set(currentKey, p);
  }, [currentKey, stale, typeKey, oneSided, presetCache]);

  const candidates = useMemo(() => {
    const base = presetCache[currentKey] ?? [];
    if (minSize === 0) return base;
    return base.filter((r) => effectiveSize(r) >= minSize);
  }, [presetCache, currentKey, minSize]);

  const allSelected = candidates.length > 0 && candidates.every((r) => selected.has(r.username));

  function toggle(u: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(candidates.map((r) => r.username)));
  }

  async function doArchive() {
    if (selected.size === 0) return;
    setBusy(true);
    const reason = oneSided ? `auto:one-sided` : `auto:stale>${stale}d`;
    const tid = toast.loading(`Archiving ${selected.size} sessions…`);
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", usernames: [...selected], reason }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      toast.success(`Archived ${j.changed} session${j.changed === 1 ? "" : "s"}.`, { id: tid });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(false);
    }
  }

  async function restoreOne(username: string) {
    setBusy(true);
    const tid = toast.loading("Restoring…");
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", usernames: [username] }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Restored.", { id: tid });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(false);
    }
  }

  async function recompute() {
    setRecomputing(true);
    const tid = toast.loading("Re-detecting + recomputing…");
    try {
      const res = await fetch("/api/me-handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redetect" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      toast.success(`Updated. ${j.rowsUpdated} sessions recomputed.`, { id: tid });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setRecomputing(false);
    }
  }

  async function fetchAllMemberCounts() {
    setFetchingMembers({ done: 0, total: 0 });
    const tid = toast.loading("Fetching member counts via wx members…");
    let errors = 0;
    try {
      let initialTotal = -1;
      while (true) {
        const res = await fetch("/api/member-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 5 }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as {
          processed: number;
          results: { error?: string }[];
          remaining: number;
          total: number;
        };
        errors += j.results.filter((r) => r.error).length;
        if (initialTotal < 0) initialTotal = j.total + j.processed;
        const done = initialTotal - j.remaining;
        setFetchingMembers({ done, total: initialTotal });
        toast.loading(`Fetched ${done}/${initialTotal}… (${errors} errors)`, { id: tid });
        if (j.remaining === 0 || j.processed === 0) break;
      }
      toast.success(`Done. ${errors} errors.`, { id: tid });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setFetchingMembers(null);
    }
  }

  async function saveHandles(newHandles: string[]) {
    setRecomputing(true);
    const tid = toast.loading("Saving handles…");
    try {
      const res = await fetch("/api/me-handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handles: newHandles }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      toast.success(`Saved. ${j.rowsUpdated} sessions recomputed.`, { id: tid });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat hygiene</CardTitle>
        <CardDescription>
          Surface chats that have been quiet or never received a reply from you, and archive them in bulk. Archived
          sessions are excluded from Overview / Contacts / Links / Search stats but kept on disk and restorable any
          time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 text-sm min-w-0">
            <UserCircle2 className="size-4 mt-0.5 text-muted-foreground" />
            <div className="min-w-0">
              <div className="font-medium">Your detected message identity</div>
              <div className="text-xs text-muted-foreground mt-1">
                Used to identify which messages are yours when filtering &quot;one-sided&quot; chats.
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {meHandles.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No handles detected — run a deep index first.</span>
                ) : (
                  meHandles.map((h, i) => (
                    <Badge key={i} variant="secondary" className="font-mono text-[11px]">
                      {h === "" ? "(empty)" : h}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HandleEditor handles={meHandles} rankings={meRankings} busy={recomputing} onSave={saveHandles} />
            <Button variant="ghost" size="sm" disabled={recomputing} onClick={recompute} className="gap-1.5 h-8">
              {recomputing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Re-detect
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Inactivity</span>
          <div className="inline-flex rounded-md border border-border/60 p-[2px]">
            {STALE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => {
                  setStale(p.days);
                  setSelected(new Set());
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  stale === p.days ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="inline-flex rounded-md border border-border/60 p-[2px]">
            {TYPE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setTypeKey(p.key);
                  setSelected(new Set());
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  typeKey === p.key ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Size</span>
          <div className="inline-flex rounded-md border border-border/60 p-[2px]">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.min}
                onClick={() => {
                  setMinSize(p.min);
                  setSelected(new Set());
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  minSize === p.min ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={fetchingMembers !== null}
            onClick={fetchAllMemberCounts}
            className="gap-1.5 h-7 ml-auto"
            title="Fetch nominal member count from wx members for each group (~5–15 min)"
          >
            {fetchingMembers ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {fetchingMembers.done}/{fetchingMembers.total}
              </>
            ) : (
              <>
                <RefreshCw className="size-3" />
                Fetch member counts
              </>
            )}
          </Button>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer text-sm">
          <Checkbox
            checked={oneSided}
            onCheckedChange={(v) => {
              setOneSided(Boolean(v));
              setSelected(new Set());
            }}
          />
          <span>
            <span className="font-medium">Only chats where I have never sent a message</span>
            <span className="text-xs text-muted-foreground ml-2">
              (deep-indexed chats only — requires history pull)
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            {presetLoading ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Loading…
              </>
            ) : (
              <>
                {candidates.length.toLocaleString()} candidate{candidates.length === 1 ? "" : "s"} ·{" "}
                <span className="text-foreground font-medium">{selected.size}</span> selected
                {oneSided && (
                  <span className="text-amber-600 dark:text-amber-400 ml-2">
                    · one-sided filter on
                  </span>
                )}
              </>
            )}
          </p>
          <Button disabled={busy || selected.size === 0} onClick={doArchive} size="sm" className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
            Archive selected
          </Button>
        </div>

        {presetLoading && candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-md inline-flex items-center justify-center gap-2 w-full">
            <Loader2 className="size-3.5 animate-spin" /> Loading preset…
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
            No candidates with these filters.
          </p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9 pl-3">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Msgs</TableHead>
                  <TableHead className="text-right">My msgs</TableHead>
                  <TableHead className="text-right">Links</TableHead>
                  <TableHead className="text-right pr-4">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.slice(0, 200).map((r) => (
                  <TableRow key={r.username} className="hover:bg-accent/30">
                    <TableCell className="pl-3">
                      <Checkbox
                        checked={selected.has(r.username)}
                        onCheckedChange={() => toggle(r.username)}
                        aria-label={`Select ${r.display_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/contacts/${encodeURIComponent(r.username)}`}
                        className="hover:underline"
                      >
                        {r.display_name || r.username}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {r.chat_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      <span
                        className={
                          effectiveSize(r) >= 100
                            ? "text-rose-600 dark:text-rose-400 font-medium"
                            : effectiveSize(r) >= 50
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }
                        title={
                          r.member_count !== null
                            ? `${r.member_count} members`
                            : `${r.distinct_senders} active senders (nominal count not fetched)`
                        }
                      >
                        {effectiveSize(r).toLocaleString()}
                        {r.member_count === null && r.distinct_senders > 0 && (
                          <span className="text-[10px] text-muted-foreground/70 ml-0.5">~</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                      {r.message_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      <span
                        className={
                          r.my_msg_count === 0 && r.message_count > 0
                            ? "text-amber-600 dark:text-amber-400 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {r.my_msg_count.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                      {r.url_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right pr-4 tabular-nums text-muted-foreground text-xs">
                      {r.last_timestamp
                        ? formatDistanceToNow(new Date(r.last_timestamp * 1000), { addSuffix: true })
                        : "never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {candidates.length > 200 && (
              <p className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                Showing first 200 of {candidates.length}. Archive a batch, then this list will refresh.
              </p>
            )}
          </div>
        )}

        {archived.length > 0 && (
          <details className="space-y-2 rounded-md border bg-muted/20">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium flex items-center justify-between">
              <span>
                {archived.length.toLocaleString()} archived session{archived.length === 1 ? "" : "s"}
              </span>
              <span className="text-xs text-muted-foreground">click to expand</span>
            </summary>
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Last active</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archived.map((r) => (
                    <TableRow key={r.username}>
                      <TableCell className="pl-4">
                        <Link
                          href={`/contacts/${encodeURIComponent(r.username)}`}
                          className="hover:underline"
                        >
                          {r.display_name || r.username}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {r.chat_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {r.last_timestamp ? format(new Date(r.last_timestamp * 1000), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => restoreOne(r.username)}
                          className="gap-1.5 h-7"
                        >
                          <RotateCcw className="size-3" />
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function HandleEditor({
  handles,
  rankings,
  busy,
  onSave,
}: {
  handles: string[];
  rankings: Ranking[];
  busy: boolean;
  onSave: (h: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(handles.join("\n"));

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setDraft(handles.join("\n"));
      }}
    >
      <PopoverTrigger
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent transition-colors"
      >
        Edit
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <div className="text-sm font-medium">Your message identity</div>
          <p className="text-xs text-muted-foreground mt-1">
            One handle per line. Messages whose <span className="font-mono">sender</span> matches any of these are
            counted as yours.
          </p>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          placeholder="(empty line for empty sender)
YXJ"
        />
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Top senders in your indexed data ({rankings.length})
          </summary>
          <div className="mt-2 space-y-1 max-h-40 overflow-auto">
            {rankings.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  const lines = new Set(draft.split("\n"));
                  lines.add(r.sender);
                  setDraft([...lines].join("\n"));
                }}
                className="w-full flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-accent text-left"
              >
                <span className="font-mono truncate">{r.sender || "(empty)"}</span>
                <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                  {r.distinct_chats}c · {r.msgs}m
                </span>
              </button>
            ))}
          </div>
        </details>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              const next = draft
                .split("\n")
                .map((s) => s.trimEnd())
                .filter((_, i, arr) => arr.indexOf(_) === i);
              onSave(next);
              setOpen(false);
            }}
          >
            Save & recompute
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
