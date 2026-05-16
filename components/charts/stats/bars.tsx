"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts";

import { TOOLTIP_STYLE, fmt } from "./_shared";

interface BarDatum {
  label: string;
  value: number;
  value2?: number; // optional second series (stacked)
}

export function VerticalBars({
  data,
  height = 200,
  seriesLabels,
}: {
  data: BarDatum[];
  height?: number;
  seriesLabels?: [string] | [string, string];
}) {
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  const stacked = data.some((d) => d.value2 !== undefined);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Bar
          dataKey="value"
          name={seriesLabels?.[0] ?? "Count"}
          fill="var(--color-primary)"
          radius={[3, 3, 0, 0]}
          stackId={stacked ? "s" : undefined}
          isAnimationActive={false}
        />
        {stacked && (
          <Bar
            dataKey="value2"
            name={seriesLabels?.[1] ?? "Other"}
            fill="var(--color-muted-foreground)"
            opacity={0.4}
            stackId="s"
            isAnimationActive={false}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Single-series line on top of a bar, useful for "count + rolling average"
// dashboards. Shares the bars file because it's primarily a bar chart with a
// trendline.
export function LineWithBars({
  data,
  height = 220,
}: {
  data: { label: string; n: number }[];
  height?: number;
}) {
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Bar
          dataKey="n"
          name="Count"
          fill="var(--color-primary)"
          opacity={0.6}
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="n"
          stroke="var(--color-primary)"
          strokeWidth={1.6}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
