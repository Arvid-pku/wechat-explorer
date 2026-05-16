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

interface Props {
  data: { label: string; n: number }[];
  tone: "primary" | "muted";
}

export function LatencyHistogram({ data, tone }: Props) {
  const fill = tone === "primary" ? "var(--color-primary)" : "var(--color-muted-foreground)";
  const fillOpacity = tone === "primary" ? 0.9 : 0.5;
  return (
    <div className="h-[160px] min-h-[160px] w-full">
      <ResponsiveContainer width="100%" height={160} minWidth={0}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--color-foreground)",
            }}
            cursor={{ fill: "var(--color-accent)", fillOpacity: 0.4 }}
            formatter={(v) => [`${v} replies`, ""]}
          />
          <Bar dataKey="n" fill={fill} fillOpacity={fillOpacity} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
