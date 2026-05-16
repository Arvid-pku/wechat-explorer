"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface Props {
  data: { ym: string; mine: number; theirs: number }[];
}

export function MonthlyActivityChart({ data }: Props) {
  return (
    <div className="h-[220px] min-h-[220px] w-full">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="ym"
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
            tickFormatter={(v: string) => v.slice(2)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={36}
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
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            iconSize={10}
            iconType="square"
          />
          <Bar dataKey="mine" name="You" stackId="a" fill="var(--color-primary)" radius={[0, 0, 0, 0]} />
          <Bar
            dataKey="theirs"
            name="Them"
            stackId="a"
            fill="var(--color-muted-foreground)"
            fillOpacity={0.5}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
