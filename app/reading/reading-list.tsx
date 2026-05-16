"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export interface ReadingItem {
  id: number;
  url: string;
  domain_group: string;
  chat_display: string;
  chat_username: string | null;
  sender: string;
  timestamp: number;
  preview: string;
}

type FilterKey = "all" | "unread" | "read";

function dayParam(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function ReadingList({
  items,
  readIds,
  filter,
}: {
  items: ReadingItem[];
  readIds: number[];
  filter: FilterKey;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic state — seeded from server; mutations apply immediately, the
  // server refresh catches up afterwards.
  const [readSet, setReadSet] = useState<Set<number>>(() => new Set(readIds));
  const [pending, setPending] = useState<Set<number>>(new Set());

  const visible = useMemo(() => {
    if (filter === "unread") return items.filter((it) => !readSet.has(it.id));
    if (filter === "read") return items.filter((it) => readSet.has(it.id));
    return items;
  }, [items, readSet, filter]);

  async function toggle(item: ReadingItem) {
    const wasRead = readSet.has(item.id);
    const nextRead = !wasRead;
    // Optimistic local flip.
    setReadSet((prev) => {
      const next = new Set(prev);
      if (nextRead) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    setPending((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlId: item.id, read: nextRead }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success(nextRead ? "Marked read" : "Marked unread");
      startTransition(() => router.refresh());
    } catch (err) {
      // Rollback.
      setReadSet((prev) => {
        const next = new Set(prev);
        if (wasRead) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
      toast.error((err as Error).message || "Failed to update");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (visible.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-muted-foreground">
        {items.length === 0
          ? "Nothing here yet."
          : filter === "unread"
            ? "Inbox zero. Nothing unread."
            : "No items marked read yet."}
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {visible.map((u) => {
        const isRead = readSet.has(u.id);
        const isPending = pending.has(u.id);
        return (
          <div
            key={u.id}
            className={`px-6 py-3 hover:bg-accent/40 flex items-start gap-3 transition-opacity ${
              isRead ? "opacity-50" : ""
            } ${isPending ? "pointer-events-none" : ""}`}
            data-jk-row
          >
            <div className="pt-0.5">
              <Checkbox
                checked={isRead}
                onCheckedChange={() => toggle(u)}
                disabled={isPending}
                aria-label={isRead ? "Mark unread" : "Mark read"}
              />
            </div>
            <div className="min-w-0 flex-1">
              <a
                href={u.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm font-medium hover:underline inline-flex items-start gap-1 break-words ${
                  isRead ? "line-through text-muted-foreground" : ""
                }`}
              >
                <span>{u.preview?.replace(/\[链接\]\s*/, "") || u.url}</span>
                <ExternalLink className="size-3 shrink-0 mt-0.5 text-muted-foreground" />
              </a>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <Link
                  href={`/links/${encodeURIComponent(u.domain_group)}`}
                  className="hover:text-foreground"
                  title={`All ${u.domain_group} links`}
                >
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal hover:bg-accent cursor-pointer"
                  >
                    {u.domain_group}
                  </Badge>
                </Link>
                {u.sender ? (
                  <Link
                    href={`/links/${encodeURIComponent(u.domain_group)}?sender=${encodeURIComponent(u.sender)}`}
                    className="hover:text-foreground hover:underline"
                    title={`All ${u.domain_group} from ${u.sender}`}
                  >
                    {u.sender}
                  </Link>
                ) : (
                  <span>—</span>
                )}
                <span>·</span>
                {u.chat_username ? (
                  <Link
                    href={`/contacts/${encodeURIComponent(u.chat_username)}`}
                    className="truncate max-w-[40ch] hover:text-foreground hover:underline"
                    title={`Open ${u.chat_display}`}
                  >
                    {u.chat_display}
                  </Link>
                ) : (
                  <Link
                    href={`/links/${encodeURIComponent(u.domain_group)}?chat=${encodeURIComponent(u.chat_display)}`}
                    className="truncate max-w-[40ch] hover:text-foreground hover:underline"
                    title={`All ${u.domain_group} in ${u.chat_display}`}
                  >
                    {u.chat_display}
                  </Link>
                )}
                <span>·</span>
                <Link
                  href={`/calendar?year=${dayParam(u.timestamp).slice(0, 4)}&day=${dayParam(u.timestamp)}`}
                  className="tabular-nums hover:text-foreground hover:underline"
                  title="Open this day in the calendar"
                >
                  {format(new Date(u.timestamp * 1000), "MMM d, HH:mm")}
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
