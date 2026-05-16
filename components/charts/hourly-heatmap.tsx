/**
 * Inline 24-hour heatmap, one row tall. Renders server-side — no client hooks.
 * Uses `--chart-1` / `--chart-3` via Tailwind utility classes so it respects
 * the active theme.
 */
import type { HourlyBucket } from "@/lib/queries.calendar";

export function HourlyHeatmap({ data }: { data: HourlyBucket[] }) {
  const max = data.reduce((a, b) => Math.max(a, b.n), 0);

  function bucket(n: number): number {
    if (!n) return 0;
    if (max <= 4) return Math.min(4, n);
    const r = n / max;
    if (r < 0.15) return 1;
    if (r < 0.35) return 2;
    if (r < 0.65) return 3;
    return 4;
  }

  const CELL = 18;
  const GAP = 3;
  const width = 24 * (CELL + GAP);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={CELL + 22} aria-label="Hourly activity heatmap">
        {data.map((d, i) => {
          const b = bucket(d.n);
          return (
            <rect
              key={d.hour}
              x={i * (CELL + GAP)}
              y={0}
              width={CELL}
              height={CELL}
              rx={3}
              ry={3}
              className={
                [
                  "fill-muted",
                  "fill-emerald-200 dark:fill-emerald-900/60",
                  "fill-emerald-400 dark:fill-emerald-700",
                  "fill-emerald-500 dark:fill-emerald-500",
                  "fill-emerald-600 dark:fill-emerald-400",
                ][b]
              }
            >
              <title>{`${String(d.hour).padStart(2, "0")}:00 — ${d.n} messages`}</title>
            </rect>
          );
        })}
        {data.map((d, i) =>
          d.hour % 3 === 0 ? (
            <text
              key={`l-${d.hour}`}
              x={i * (CELL + GAP) + CELL / 2}
              y={CELL + 14}
              textAnchor="middle"
              fontSize={9}
              className="fill-muted-foreground tabular-nums"
            >
              {String(d.hour).padStart(2, "0")}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
