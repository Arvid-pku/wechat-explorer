"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  Treemap,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";

const TOOLTIP_STYLE = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--color-foreground)",
};

// Stable, colorblind-friendly palette. First entry is the primary tone.
const PALETTE = [
  "var(--color-primary)",
  "#5e81f4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
  "#6b7280",
  "#0ea5e9",
  "#84cc16",
  "#eab308",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

// ───── Donut ────────────────────────────────────────────────────────────────
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
            formatter={(value) => <span style={{ color: "var(--color-muted-foreground)" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: 40 }}>
          <span className="text-xs text-muted-foreground">{centerLabel.title}</span>
          <span className="text-2xl font-semibold tabular-nums">{centerLabel.value}</span>
        </div>
      )}
    </div>
  );
}

// ───── Vertical bar ─────────────────────────────────────────────────────────
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
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  const stacked = data.some((d) => d.value2 !== undefined);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
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
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Bar dataKey="value" name={seriesLabels?.[0] ?? "Count"} fill="var(--color-primary)" radius={[3, 3, 0, 0]} stackId={stacked ? "s" : undefined} isAnimationActive={false} />
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
      </BarChart>
    </ResponsiveContainer>
  );
}

// ───── Area chart over time ─────────────────────────────────────────────────
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
        <Area type="monotone" dataKey="a" name={seriesLabels[0]} stroke="var(--color-primary)" fill="url(#sa-a)" stackId="1" isAnimationActive={false} />
        <Area type="monotone" dataKey="b" name={seriesLabels[1]} stroke="var(--color-muted-foreground)" fill="url(#sa-b)" stackId="1" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ───── Single-series line + rolling ─────────────────────────────────────────
export function LineWithBars({
  data,
  height = 220,
}: {
  data: { label: string; n: number }[];
  height?: number;
}) {
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={32} />
        <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Bar dataKey="n" name="Count" fill="var(--color-primary)" opacity={0.6} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Line type="monotone" dataKey="n" stroke="var(--color-primary)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ───── Radial-bar (good for circular hour-of-day visualisation) ─────────────
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
      <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="95%" data={rows} startAngle={90} endAngle={-270}>
        <PolarGrid stroke="var(--color-border)" />
        <PolarAngleAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
        <RadialBar dataKey="total" cornerRadius={4} fill="var(--color-primary)" isAnimationActive={false} background={{ fill: "var(--color-muted)", opacity: 0.3 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

// ───── Treemap (good for domains) ───────────────────────────────────────────
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
        content={(props: { x?: number; y?: number; width?: number; height?: number; index?: number; depth?: number; name?: string; value?: number }) => {
          const { x = 0, y = 0, width = 0, height = 0, index = 0, depth = 1, name = "", value = 0 } = props;
          if (depth !== 1) return <g />;
          const fill = PALETTE[index % PALETTE.length];
          return (
            <g>
              <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--color-background)" strokeWidth={2} />
              {width > 60 && height > 26 ? (
                <text x={x + 6} y={y + 16} fontSize={11} fill="white" style={{ pointerEvents: "none" }}>
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
