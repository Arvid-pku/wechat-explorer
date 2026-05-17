"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  EXPORT_CHART_WIDTH,
  useExportMode,
} from "@/components/export-mode";
import { ServerHourStrip } from "@/lib/server-charts";
import { TOOLTIP_STYLE, fmt } from "./_shared";

/**
 * Radial-bar chart for circular hour-of-day visualisation. Two-series input
 * (mine/theirs) is collapsed into a single `total` ring for legibility — the
 * tooltip shows each side individually.
 */
export function HourRadial({
  data,
  height = 280,
}: {
  data: { hour: number; mine: number; theirs: number }[];
  height?: number;
}) {
  const isExport = useExportMode();
  if (!data || data.length === 0) return null;
  const rows = data.map((d) => ({
    name: String(d.hour).padStart(2, "0"),
    total: d.mine + d.theirs,
    mine: d.mine,
    theirs: d.theirs,
  }));
  const chartBody = (
    <>
      <PolarGrid stroke="var(--color-border)" />
      <PolarAngleAxis
        type="category"
        dataKey="name"
        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
      />
      <RadialBar
        dataKey="total"
        cornerRadius={4}
        fill="var(--color-primary)"
        isAnimationActive={false}
        background={{ fill: "var(--color-muted)", opacity: 0.3 }}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(Number(v))} />
    </>
  );
  const radialProps = {
    cx: "50%" as const,
    cy: "50%" as const,
    innerRadius: "20%" as const,
    outerRadius: "95%" as const,
    data: rows,
    startAngle: 90,
    endAngle: -270,
  };
  if (isExport) {
    // Radial geometry is hard to print and adds little info over a linear
    // strip; render as a 24-cell stacked hour grid that's easier to scan.
    return (
      <div style={{ width: EXPORT_CHART_WIDTH, height, margin: "0 auto" }}>
        <ServerHourStrip data={data} width={EXPORT_CHART_WIDTH} height={height} />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadialBarChart {...radialProps}>{chartBody}</RadialBarChart>
    </ResponsiveContainer>
  );
}
