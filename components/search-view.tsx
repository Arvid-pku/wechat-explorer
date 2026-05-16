"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Archive, UserCircle2, X } from "lucide-react";
import Link from "next/link";

interface Result {
  id: number;
  chat_username: string | null;
  chat_display: string;
  sender: string;
  msg_type: string;
  content: string;
  timestamp: number;
  snippet: string;
}

export function SearchView({
  scopeUsername,
  scopeDisplay,
}: {
  scopeUsername?: string | null;
  scopeDisplay?: string | null;
} = {}) {
  const router = useRouter();
  const sp = useSearchParams();
  const qParam = sp.get("q") ?? "";
  const chatParam = sp.get("chat") ?? "";
  const includeArchived = sp.get("archived") === "1";
  const [value, setValue] = useState(qParam);

  const debounced = useDebounced(value, 250);

  // Only sync the input from the URL when it changed externally — e.g. user
  // clicked a search-result sender link or pasted a /search?q=… URL. Comparing
  // against `debounced` (our own last write) avoids the race where each
  // keystroke causes useSearchParams to hand back a new object reference and
  // overwrites the in-flight value with the stale URL param. That race made
  // the input feel "stuck" — characters typed during the debounce window were
  // immediately reverted.
  useEffect(() => {
    if (qParam !== debounced) setValue(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["search", debounced, includeArchived, chatParam],
    queryFn: async () => {
      if (!debounced.trim()) return { results: [] as Result[] };
      const params = new URLSearchParams({ q: debounced, limit: "80" });
      if (includeArchived) params.set("archived", "1");
      if (chatParam) params.set("chat", chatParam);
      const res = await fetch(`/api/search?${params.toString()}`);
      return res.json() as Promise<{ results: Result[] }>;
    },
    enabled: true,
    staleTime: 30_000,
  });

  useEffect(() => {
    const next = new URLSearchParams(sp.toString());
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    const target = `/search${next.toString() ? `?${next.toString()}` : ""}`;
    router.replace(target, { scroll: false });
  }, [debounced, router, sp]);

  function toggleArchived() {
    const next = new URLSearchParams(sp.toString());
    if (includeArchived) next.delete("archived");
    else next.set("archived", "1");
    router.replace(`/search${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  }

  function clearChatScope() {
    const next = new URLSearchParams(sp.toString());
    next.delete("chat");
    router.replace(`/search${next.toString() ? `?${next.toString()}` : ""}`, {
      scroll: false,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Input
            autoFocus
            placeholder="Search messages…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <button
          onClick={toggleArchived}
          className={
            `inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              includeArchived
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent"
            }`
          }
          title={
            includeArchived
              ? "Including archived chats in results"
              : "Click to also search archived chats"
          }
        >
          <Archive className="size-3.5" />
          {includeArchived ? "Archived shown" : "Include archived"}
        </button>
      </div>
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
          <button
            onClick={clearChatScope}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Clear chat filter"
          >
            <X className="size-3" /> clear
          </button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Powered by SQLite FTS5 with trigram tokenizer — short CJK queries fall back to LIKE.
      </p>

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {!debounced.trim() ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Type at least one character to search across {""}
            <strong>indexed messages</strong>.
          </CardContent>
        </Card>
      ) : isFetching && !data ? (
        <SkeletonList />
      ) : (
        <Card className="p-0 overflow-hidden">
          <CardContent className="p-0 divide-y divide-border/40">
            {(data?.results ?? []).length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                No matches for &quot;{debounced}&quot;.
              </p>
            ) : (
              data!.results.map((r) => (
                <div key={r.id} className="px-6 py-3 hover:bg-accent/40">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {r.chat_username ? (
                      <Link
                        href={`/contacts/${encodeURIComponent(r.chat_username)}`}
                        className="font-medium text-foreground hover:underline truncate max-w-[40ch]"
                      >
                        {r.chat_display}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground truncate max-w-[40ch]">
                        {r.chat_display}
                      </span>
                    )}
                    <span>·</span>
                    {r.sender ? (
                      <Link
                        href={
                          chatParam
                            ? `/search?q=${encodeURIComponent(r.sender)}&chat=${encodeURIComponent(chatParam)}`
                            : `/search?q=${encodeURIComponent(r.sender)}`
                        }
                        className="hover:text-foreground hover:underline"
                        title={
                          chatParam
                            ? `Search for ${r.sender} within this chat`
                            : `Search for ${r.sender}`
                        }
                      >
                        {r.sender}
                      </Link>
                    ) : (
                      <span>—</span>
                    )}
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {r.msg_type}
                    </Badge>
                    <span>·</span>
                    {(() => {
                      const d = new Date(r.timestamp * 1000);
                      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      // Carry chat scope to calendar too — user clicked into
                      // this chat's results, they probably want the calendar
                      // scoped the same way.
                      const calChat = chatParam || r.chat_username;
                      const calHref = calChat
                        ? `/calendar?year=${d.getFullYear()}&day=${day}&chat=${encodeURIComponent(calChat)}`
                        : `/calendar?year=${d.getFullYear()}&day=${day}`;
                      return (
                        <>
                          <Link
                            href={`/messages/${r.id}`}
                            className="tabular-nums hover:text-foreground hover:underline"
                            title={`Permalink · also opens day ${day} via the calendar link`}
                          >
                            {format(d, "MMM d, yyyy HH:mm")}
                          </Link>
                          <Link
                            href={calHref}
                            className="text-muted-foreground/70 hover:text-foreground hover:underline text-[10px]"
                            title="Open this day in the calendar"
                          >
                            day
                          </Link>
                        </>
                      );
                    })()}
                  </div>
                  <p
                    className="text-sm mt-1 break-words [&_mark]:bg-amber-200/60 [&_mark]:rounded [&_mark]:px-0.5 [&_mark]:text-foreground dark:[&_mark]:bg-amber-500/30"
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border/40">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-6 py-3 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function useDebounced<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
