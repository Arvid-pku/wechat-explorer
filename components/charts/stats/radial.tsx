"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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
  if (!data || data.length === 0) return null;
  const rows = data.map((d) => ({
    name: String(d.hour).padStart(2, "0"),
    total: d.mine + d.theirs,
    mine: d.mine,
    theirs: d.theirs,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadialBarChart
        cx="50%"
        cy="50%"
        innerRadius="20%"
        outerRadius="95%"
        data={rows}
        startAngle={90}
        endAngle={-270}
      >
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
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}
