"use client";

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { PALETTE, TOOLTIP_STYLE, fmt } from "./_shared";

interface TimeSeriesDatum {
  label: string;
  a: number;
  b?: number;
}

export function StackedArea({
  data,
  height = 220,
  seriesLabels = ["You", "Them"],
}: {
  data: TimeSeriesDatum[];
  height?: number;
  seriesLabels?: [string, string];
}) {
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="sa-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="sa-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-muted-foreground)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-muted-foreground)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={36}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Legend verticalAlign="top" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="a"
          name={seriesLabels[0]}
          stroke="var(--color-primary)"
          fill="url(#sa-a)"
          stackId="1"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="b"
          name={seriesLabels[1]}
          stroke="var(--color-muted-foreground)"
          fill="url(#sa-b)"
          stackId="1"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TwoSeriesLine({
  data,
  height = 220,
  seriesLabels = ["You", "Them"],
}: {
  data: TimeSeriesDatum[];
  height?: number;
  seriesLabels?: [string, string];
}) {
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={36}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Legend verticalAlign="top" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="a"
          name={seriesLabels[0]}
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="b"
          name={seriesLabels[1]}
          stroke="var(--color-muted-foreground)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Multi-line chart for "top N chats over time" views. `data` is pivoted: each
 * entry has a `label` for the x-axis and one numeric property per series key.
 * `series` defines which keys to plot and what label to show in the legend.
 */
export function MultiLine({
  data,
  series,
  height = 240,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  height?: number;
}) {
  if (!data || data.length === 0 || series.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={36}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Legend
          verticalAlign="top"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
        />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
