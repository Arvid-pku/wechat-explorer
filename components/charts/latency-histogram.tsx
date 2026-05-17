"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { EXPORT_CHART_WIDTH, useExportMode } from "@/components/export-mode";
import { ServerHorizontalBars } from "@/lib/server-charts";
import { TOOLTIP_STYLE } from "@/components/charts/stats/_shared";

interface Props {
  data: { label: string; n: number }[];
  tone: "primary" | "muted";
}

export function LatencyHistogram({ data, tone }: Props) {
  const isExport = useExportMode();
  const fill = tone === "primary" ? "var(--color-primary)" : "var(--color-muted-foreground)";
  const fillOpacity = tone === "primary" ? 0.9 : 0.5;
  const body = (
    <>
      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
        axisLine={false}
        tickLine={false}
        interval={0}
      />
      <YAxis
        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
        axisLine={false}
        tickLine={false}
        width={32}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        cursor={{ fill: "var(--color-accent)", fillOpacity: 0.4 }}
        formatter={(v) => [`${v} replies`, ""]}
      />
      <Bar dataKey="n" fill={fill} fillOpacity={fillOpacity} radius={[2, 2, 0, 0]} />
    </>
  );
  const margin = { top: 4, right: 4, left: 0, bottom: 0 };
  if (isExport) {
    // The live chart is bar-vs-bucket — easier to read as horizontal rows
    // when there's no interactive tooltip to hover.
    return (
      <div style={{ width: EXPORT_CHART_WIDTH, height: 160, margin: "0 auto" }}>
        <ServerHorizontalBars
          data={data}
          width={EXPORT_CHART_WIDTH}
          height={160}
          tone={tone}
        />
      </div>
    );
  }
  return (
    <div className="h-[160px] min-h-[160px] w-full">
      <ResponsiveContainer width="100%" height={160} minWidth={0}>
        <BarChart data={data} margin={margin}>{body}</BarChart>
      </ResponsiveContainer>
    </div>
  );
}
