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
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
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
            formatter={(v: number, name: string) => [fmt(v), name]}
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
        </PieChart>
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
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={data}
        dataKey="value"
        stroke="var(--color-background)"
        fill="var(--color-primary)"
        isAnimationActive={false}
        content={(props: {
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
        }}
      />
    </ResponsiveContainer>
  );
}
