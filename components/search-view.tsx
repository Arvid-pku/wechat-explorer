"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
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

export function SearchView() {
  const router = useRouter();
  const sp = useSearchParams();
  const initial = sp.get("q") ?? "";
  const [value, setValue] = useState(initial);

  useEffect(() => setValue(sp.get("q") ?? ""), [sp]);

  const debounced = useDebounced(value, 250);

  const { data, isFetching, error } = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      if (!debounced.trim()) return { results: [] as Result[] };
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}&limit=80`);
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

  return (
    <div className="space-y-4">
      <div>
        <Input
          autoFocus
          placeholder="Search messages…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 text-base"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Powered by SQLite FTS5 with trigram tokenizer — works for Chinese substrings as well.
        </p>
      </div>

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
                        href={`/search?q=${encodeURIComponent(r.sender)}`}
                        className="hover:text-foreground hover:underline"
                        title={`Search for ${r.sender}`}
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
                    <Link
                      href={(() => {
                        const d = new Date(r.timestamp * 1000);
                        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        return `/calendar?year=${d.getFullYear()}&day=${day}`;
                      })()}
                      className="tabular-nums hover:text-foreground hover:underline"
                      title="Open this day in the calendar"
                    >
                      {format(new Date(r.timestamp * 1000), "MMM d, yyyy HH:mm")}
                    </Link>
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
