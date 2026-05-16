"use client";

import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";

interface Props {
  data: { day: string; n: number }[];
}

export function ActivityChart({ data }: Props) {
  const filled = fillGaps(data);
  return (
    <div className="h-[220px] min-h-[220px] w-full">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <AreaChart data={filled} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
            tickFormatter={(v: string) => format(parseISO(v), "MMM d")}
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
            labelFormatter={(v) => format(parseISO(String(v)), "EEE, MMM d, yyyy")}
            formatter={(v) => [v, "messages"]}
          />
          <Area
            type="monotone"
            dataKey="n"
            stroke="var(--color-primary)"
            strokeWidth={1.5}
            fill="url(#actGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function fillGaps(rows: { day: string; n: number }[]): { day: string; n: number }[] {
  if (rows.length === 0) return rows;
  const map = new Map(rows.map((r) => [r.day, r.n]));
  const start = new Date(rows[0].day);
  const end = new Date(rows[rows.length - 1].day);
  const out: { day: string; n: number }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    out.push({ day: key, n: map.get(key) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
