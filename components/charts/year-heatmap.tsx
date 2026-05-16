"use client";

import { useMemo } from "react";
import { format, getDay, startOfYear, endOfYear, eachDayOfInterval } from "date-fns";

interface Props {
  year: number;
  data: { day: string; n: number }[];
  selected?: string;
  onSelect?: (day: string) => void;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function YearHeatmap({ year, data, selected, onSelect }: Props) {
  const { weeks, max, monthHeaders } = useMemo(() => {
    const map = new Map(data.map((r) => [r.day, r.n]));
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(start);
    const days = eachDayOfInterval({ start, end });

    let max = 0;
    for (const v of map.values()) if (v > max) max = v;

    // Fill leading days so column 0 starts on Sunday (0)
    const leading = getDay(start);
    const padded: (Date | null)[] = [];
    for (let i = 0; i < leading; i++) padded.push(null);
    padded.push(...days);

    // Group into columns of 7 (Sun-Sat)
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }

    // Determine month boundaries — show label on weeks where the month starts
    const monthHeaders: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((wk, idx) => {
      const first = wk.find((d): d is Date => d !== null);
      if (!first) return;
      const m = first.getMonth();
      if (m !== lastMonth && first.getDate() <= 7) {
        monthHeaders.push({ col: idx, label: MONTH_LABELS[m] });
        lastMonth = m;
      }
    });

    return { weeks, max, monthHeaders, map };
  }, [year, data]);

  function bucket(n: number) {
    if (n === 0 || !n) return 0;
    if (max <= 4) return Math.min(4, n);
    const r = n / max;
    if (r < 0.05) return 1;
    if (r < 0.2) return 2;
    if (r < 0.5) return 3;
    return 4;
  }

  const map = new Map(data.map((r) => [r.day, r.n]));

  const cell = 12;
  const gap = 3;
  const width = weeks.length * (cell + gap);
  const height = 7 * (cell + gap);

  return (
    <div className="overflow-x-auto">
      <svg width={width + 24} height={height + 24}>
        {monthHeaders.map((m) => (
          <text
            key={`${m.col}-${m.label}`}
            x={m.col * (cell + gap) + 24}
            y={10}
            className="fill-muted-foreground"
            fontSize={10}
          >
            {m.label}
          </text>
        ))}
        {["Mon", "Wed", "Fri"].map((d, i) => (
          <text key={d} x={0} y={(i * 2 + 1) * (cell + gap) + 16} className="fill-muted-foreground" fontSize={9}>
            {d}
          </text>
        ))}
        {weeks.map((wk, x) =>
          wk.map((day, y) => {
            if (!day) return null;
            const iso = format(day, "yyyy-MM-dd");
            const n = map.get(iso) ?? 0;
            const b = bucket(n);
            const isSelected = selected === iso;
            return (
              <rect
                key={iso}
                x={x * (cell + gap) + 24}
                y={y * (cell + gap) + 16}
                width={cell}
                height={cell}
                rx={2}
                ry={2}
                className={`cursor-pointer transition-opacity hover:opacity-80 ${
                  ["fill-muted", "fill-emerald-200 dark:fill-emerald-900/60", "fill-emerald-400 dark:fill-emerald-700", "fill-emerald-500 dark:fill-emerald-500", "fill-emerald-600 dark:fill-emerald-400"][b]
                }`}
                stroke={isSelected ? "currentColor" : "transparent"}
                strokeWidth={isSelected ? 1.5 : 0}
                onClick={() => onSelect?.(iso)}
              >
                <title>{`${iso}: ${n} messages`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="size-2.5 rounded-sm bg-muted" />
        <div className="size-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
        <div className="size-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-700" />
        <div className="size-2.5 rounded-sm bg-emerald-500" />
        <div className="size-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400" />
        <span>More</span>
      </div>
    </div>
  );
}
