"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import { EXPORT_CHART_WIDTH, useExportMode } from "@/components/export-mode";
import { ServerLines } from "@/lib/server-charts";
import { TOOLTIP_STYLE } from "@/components/charts/stats/_shared";

interface Props {
  data: { day: string; n: number }[];
}

export function ActivityChart({ data }: Props) {
  const isExport = useExportMode();
  const filled = fillGaps(data);
  const smoothed = withRolling(filled, 7);
  const body = (
    <>
      <defs>
        <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="day"
        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        axisLine={false}
        tickLine={false}
        minTickGap={48}
        tickFormatter={(v: string) => format(parseISO(v), "MMM d")}
      />
      <YAxis
        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        axisLine={false}
        tickLine={false}
        width={36}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        labelFormatter={(v) => format(parseISO(String(v)), "EEE, MMM d, yyyy")}
        formatter={(v, name) => [Math.round(Number(v)).toLocaleString(), name === "rolling" ? "7-day avg" : "messages"]}
      />
      <Area
        type="monotone"
        dataKey="n"
        stroke="var(--color-primary)"
        strokeWidth={1}
        strokeOpacity={0.55}
        fill="url(#actGrad)"
        isAnimationActive={false}
      />
      <Line
        type="monotone"
        dataKey="rolling"
        stroke="var(--color-primary)"
        strokeWidth={2.2}
        strokeOpacity={0.95}
        dot={false}
        isAnimationActive={false}
      />
    </>
  );
  const margin = { top: 6, right: 6, left: 0, bottom: 0 };
  if (isExport) {
    // Export = pure SVG via ServerLines. Single rolling line over the
    // 365-day window; the raw daily area is dropped to keep the export
    // legible at print resolution.
    return (
      <div style={{ width: EXPORT_CHART_WIDTH, height: 220, margin: "0 auto" }}>
        <ServerLines
          data={smoothed.map((d) => ({
            label: d.day,
            values: [d.rolling],
          }))}
          series={[{ label: "7-day rolling", strokeWidth: 2 }]}
          width={EXPORT_CHART_WIDTH}
          height={220}
          fill
          formatXLabel={(d, i) => (i % 30 === 0 ? d.slice(0, 7) : "")}
        />
      </div>
    );
  }
  return (
    <div className="h-[220px] min-h-[220px] w-full">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <ComposedChart data={smoothed} margin={margin}>
          {body}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function fillGaps(rows: { day: string; n: number }[]): { day: string; n: number }[] {
  if (rows.length === 0) return rows;
  const map = new Map(rows.map((r) => [r.day, r.n]));
  const start = new Date(rows[0].day);
  const end = new Date(rows[rows.length - 1].day);
  const out: { day: string; n: number }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    out.push({ day: key, n: map.get(key) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function withRolling(rows: { day: string; n: number }[], window: number) {
  const out: { day: string; n: number; rolling: number }[] = [];
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    sum += rows[i].n;
    if (i >= window) sum -= rows[i - window].n;
    const denom = Math.min(window, i + 1);
    out.push({ ...rows[i], rolling: sum / denom });
  }
  return out;
}
