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

import { EXPORT_CHART_WIDTH, useExportMode } from "@/components/export-mode";
import { ServerBars, ServerLines } from "@/lib/server-charts";
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
  const isExport = useExportMode();
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  const stacked = data.some((d) => d.value2 !== undefined);
  const body = (
    <>
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
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(Number(v))} />
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
    </>
  );
  const margin = { top: 8, right: 8, left: 0, bottom: 4 };
  if (isExport) {
    return (
      <div style={{ width: EXPORT_CHART_WIDTH, height, margin: "0 auto" }}>
        <ServerBars
          data={data.map((d) => ({
            label: d.label,
            values: stacked ? [d.value, d.value2 ?? 0] : [d.value],
          }))}
          series={
            stacked
              ? [
                  { label: seriesLabels?.[0] ?? "Count" },
                  { label: seriesLabels?.[1] ?? "Other", color: "var(--color-muted-foreground)" },
                ]
              : [{ label: seriesLabels?.[0] ?? "Count" }]
          }
          stacked={stacked}
          width={EXPORT_CHART_WIDTH}
          height={height}
        />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={margin}>{body}</BarChart>
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
  const isExport = useExportMode();
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  const body = (
    <>
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
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(Number(v))} />
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
    </>
  );
  const margin = { top: 8, right: 8, left: 0, bottom: 4 };
  if (isExport) {
    return (
      <div style={{ width: EXPORT_CHART_WIDTH, height, margin: "0 auto" }}>
        <ServerBars
          data={data.map((d) => ({ label: d.label, values: [d.n] }))}
          series={[{ label: "Count" }]}
          width={EXPORT_CHART_WIDTH}
          height={height}
        />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={margin}>
        {body}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
