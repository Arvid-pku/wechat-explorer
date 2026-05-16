/**
 * Generic horizontal bar list: one row per item, label on the left, bar in the
 * middle, count on the right. Optional link wrapping the row.
 */

import Link from "next/link";

interface Row {
  label: string;
  n: number;
  href?: string;
  sub?: string;
}

interface Props {
  rows: Row[];
  /** Truncate the bar's label to N chars. */
  truncateAt?: number;
  /** Tint primary/muted. */
  tone?: "primary" | "muted";
}

export function HorizontalBars({ rows, truncateAt = 32, tone = "primary" }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here.</p>;
  }
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => {
        const inner = (
          <div className="group grid grid-cols-[1fr_minmax(40px,_56px)] items-center gap-3 px-2 py-1 -mx-2 rounded hover:bg-accent/50">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-sm font-medium truncate" title={r.label}>
                <span className="truncate">{truncate(r.label, truncateAt)}</span>
              </div>
              {r.sub && <div className="text-[11px] text-muted-foreground truncate">{r.sub}</div>}
              <div
                className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden"
                aria-hidden
              >
                <div
                  className={tone === "primary" ? "h-full bg-primary/70" : "h-full bg-foreground/30"}
                  style={{ width: `${(r.n / max) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-sm tabular-nums text-right text-muted-foreground">
              {r.n.toLocaleString()}
            </div>
          </div>
        );
        return (
          <li key={`${r.label}-${i}`}>
            {r.href ? <Link href={r.href}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
