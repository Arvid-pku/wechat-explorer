"use client";

import Link from "next/link";

interface Props {
  rows: { domain_group: string; n: number }[];
}

export function TopDomainsBar({ rows }: Props) {
  const max = rows.reduce((a, b) => Math.max(a, b.n), 0) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Link
          key={r.domain_group}
          href={`/links/${encodeURIComponent(r.domain_group)}`}
          className="group block rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium group-hover:text-primary truncate">{r.domain_group}</span>
            <span className="text-muted-foreground tabular-nums">{r.n.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary/70 group-hover:bg-primary transition-all"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
