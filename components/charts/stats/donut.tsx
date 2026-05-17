"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Treemap,
} from "recharts";

import {
  EXPORT_CHART_WIDTH,
  EXPORT_CHART_WIDTH_SQUARE,
  useExportMode,
} from "@/components/export-mode";
import { ServerPie, ServerBars } from "@/lib/server-charts";
import { PALETTE, TOOLTIP_STYLE, fmt } from "./_shared";

interface DonutDatum {
  name: string;
  value: number;
  href?: string;
}

export function Donut({
  data,
  height = 240,
  centerLabel,
}: {
  data: DonutDatum[];
  height?: number;
  /** Big text in the middle (e.g., the total). */
  centerLabel?: { title: string; value: string };
}) {
  const isExport = useExportMode();
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  const pie = (
    <>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        innerRadius="58%"
        outerRadius="90%"
        paddingAngle={1.5}
        strokeWidth={0}
        isAnimationActive={false}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={(v, name) => [fmt(Number(v)), String(name)]}
      />
      <Legend
        verticalAlign="bottom"
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        formatter={(value) => (
          <span style={{ color: "var(--color-muted-foreground)" }}>{value}</span>
        )}
      />
    </>
  );
  // Export mode: render a server-side <ServerPie>. Recharts gates its inner
  // SVG behind a useEffect, so even with explicit width/height it ships an
  // empty wrapper during SSR — useless for the static HTML export.
  if (isExport) {
    return (
      <div
        style={{
          width: EXPORT_CHART_WIDTH_SQUARE,
          height,
          margin: "0 auto",
        }}
      >
        <ServerPie
          data={data.map((d) => ({ name: d.name, value: d.value }))}
          width={EXPORT_CHART_WIDTH_SQUARE}
          height={height}
          centerLabel={centerLabel}
        />
      </div>
    );
  }
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>{pie}</PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingBottom: 40 }}
        >
          <span className="text-xs text-muted-foreground">{centerLabel.title}</span>
          <span className="text-2xl font-semibold tabular-nums">{centerLabel.value}</span>
        </div>
      )}
    </div>
  );
}

// Treemap lives in this file because it shares the same use case ("show a
// share-of-pie distribution"); colocating means a domain-treemap page doesn't
// pull the line/area/radial machinery from the other files.
export function DomainTreemap({
  data,
  height = 280,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  const isExport = useExportMode();
  if (!data || data.length === 0) return null;
  const renderNode = (props: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    index?: number;
    depth?: number;
    name?: string;
    value?: number;
  }) => {
    const {
      x = 0,
      y = 0,
      width = 0,
      height = 0,
      index = 0,
      depth = 1,
      name = "",
      value = 0,
    } = props;
    if (depth !== 1) return <g />;
    const fill = PALETTE[index % PALETTE.length];
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          stroke="var(--color-background)"
          strokeWidth={2}
        />
        {width > 60 && height > 26 ? (
          <text
            x={x + 6}
            y={y + 16}
            fontSize={11}
            fill="white"
            style={{ pointerEvents: "none" }}
          >
            {name}
          </text>
        ) : null}
        {width > 60 && height > 42 ? (
          <text x={x + 6} y={y + 30} fontSize={10} fill="white" opacity={0.8}>
            {fmt(value)}
          </text>
        ) : null}
      </g>
    );
  };
  const commonTreemapProps = {
    data,
    dataKey: "value" as const,
    stroke: "var(--color-background)",
    fill: "var(--color-primary)",
    isAnimationActive: false,
    content: renderNode,
  };
  if (isExport) {
    // Treemap → fall back to a horizontal bar list since the treemap layout
    // engine needs DOM measurement. Same information, prints cleaner.
    return (
      <div style={{ width: EXPORT_CHART_WIDTH, height, margin: "0 auto" }}>
        <ServerBars
          data={data
            .slice()
            .sort((a, b) => b.value - a.value)
            .slice(0, 12)
            .map((d) => ({ label: d.name, values: [d.value] }))}
          series={[{ label: "count" }]}
          width={EXPORT_CHART_WIDTH}
          height={height}
        />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap {...commonTreemapProps} />
    </ResponsiveContainer>
  );
}
