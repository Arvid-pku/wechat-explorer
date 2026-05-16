/**
 * Pure-SVG chart primitives. No state, no effects, no DOM measurement —
 * every chart renders to inline SVG during SSR and survives the
 * `<script>`-stripping export pass intact.
 *
 * Used by the chart wrappers under `components/charts/` when the
 * `ExportModeProvider` says we're rendering for the export. Live mode keeps
 * Recharts (which produces an interactive chart on the client).
 *
 * Design notes:
 * - All charts are sized in pixels — callers hand in width + height. No
 *   ResponsiveContainer dance.
 * - The palette + tooltip styles mirror `components/charts/stats/_shared.ts`
 *   so an exported chart looks visually consistent with the live one.
 * - The components are server-friendly (`"use client"` not required) — they
 *   work both during SSR and inside a "use client" parent.
 */

import { PALETTE } from "@/components/charts/stats/_shared";

const AXIS_COLOR = "var(--color-border)";
const TICK_COLOR = "var(--color-muted-foreground)";
const TICK_FONT_SIZE = 10;

function fmt(n: number): string {
  return new Intl.NumberFormat("en").format(Math.round(n));
}

/** Nice round number ≥ value, useful for y-axis ticks. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * pow;
}

function yTicks(max: number, n = 4): number[] {
  const ceil = niceCeil(max);
  const step = ceil / n;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(step * i));
}

interface BarsDatum {
  label: string;
  values: number[]; // one entry per series
}

interface BarsProps {
  data: BarsDatum[];
  width: number;
  height: number;
  /** Per-series label, drives the legend + tooltips. */
  series: { label: string; color?: string }[];
  /** When true, series stack instead of grouping side-by-side. */
  stacked?: boolean;
  /** Show a legend strip above the chart. Default true when series.length > 1. */
  legend?: boolean;
  /** Tick formatter for the x labels (e.g. "2024-12" → "Dec"). */
  formatXLabel?: (label: string, i: number) => string;
}

/**
 * Vertical bar chart, grouped or stacked. Drives VerticalBars,
 * LineWithBars, MonthlyActivityChart.
 */
export function ServerBars({
  data,
  width,
  height,
  series,
  stacked = false,
  legend,
  formatXLabel = (l) => l,
}: BarsProps) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const showLegend = (legend ?? series.length > 1) && series.length > 0;
  const legendH = showLegend ? 18 : 0;
  const padL = 40;
  const padR = 12;
  const padT = 8 + legendH;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = stacked
    ? Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0)))
    : Math.max(1, ...data.flatMap((d) => d.values));
  const ticks = yTicks(max);
  const yScale = (v: number) => padT + innerH - (v / niceCeil(max)) * innerH;
  const slotW = innerW / data.length;
  const groupW = slotW * 0.7;
  const seriesGap = stacked ? 0 : 1;
  const barW = stacked ? groupW : (groupW - seriesGap * (series.length - 1)) / series.length;

  // Pick label tick stride so labels don't overlap on dense charts.
  const targetLabels = Math.max(4, Math.min(data.length, Math.floor(innerW / 60)));
  const stride = Math.max(1, Math.ceil(data.length / targetLabels));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      style={{ overflow: "visible" }}
    >
      {showLegend && (
        <g>
          {series.map((s, i) => {
            const x = padL + i * 92;
            return (
              <g key={s.label} transform={`translate(${x}, 4)`}>
                <rect width={9} height={9} rx={2} fill={s.color ?? PALETTE[i % PALETTE.length]} />
                <text x={14} y={9} fontSize={11} fill={TICK_COLOR}>
                  {s.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
      {/* Y axis ticks + gridlines */}
      {ticks.map((t) => {
        const y = yScale(t);
        return (
          <g key={t}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y}
              y2={y}
              stroke={AXIS_COLOR}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={TICK_FONT_SIZE}
              fill={TICK_COLOR}
            >
              {fmt(t)}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const cx = padL + (i + 0.5) * slotW;
        let stackY = padT + innerH;
        return (
          <g key={`${d.label}-${i}`}>
            {d.values.map((v, j) => {
              const color = series[j]?.color ?? PALETTE[j % PALETTE.length];
              if (stacked) {
                const h = (v / niceCeil(max)) * innerH;
                const y = stackY - h;
                stackY = y;
                return (
                  <rect
                    key={j}
                    x={cx - barW / 2}
                    y={y}
                    width={barW}
                    height={Math.max(0, h)}
                    fill={color}
                    opacity={j === 0 ? 0.85 : 0.55}
                  >
                    <title>{`${formatXLabel(d.label, i)} · ${series[j]?.label ?? ""}: ${fmt(v)}`}</title>
                  </rect>
                );
              }
              const x = cx - groupW / 2 + j * (barW + seriesGap);
              const h = (v / niceCeil(max)) * innerH;
              const y = padT + innerH - h;
              return (
                <rect
                  key={j}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(0, h)}
                  fill={color}
                  opacity={0.85}
                >
                  <title>{`${formatXLabel(d.label, i)} · ${series[j]?.label ?? ""}: ${fmt(v)}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {/* X labels */}
      {data.map((d, i) =>
        i % stride === 0 ? (
          <text
            key={d.label}
            x={padL + (i + 0.5) * slotW}
            y={height - 8}
            textAnchor="middle"
            fontSize={TICK_FONT_SIZE}
            fill={TICK_COLOR}
          >
            {formatXLabel(d.label, i)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

interface LinesProps {
  data: { label: string; values: number[] }[];
  width: number;
  height: number;
  series: { label: string; color?: string; strokeWidth?: number }[];
  legend?: boolean;
  /** Fill area below the line for visual heft (StackedArea-style). */
  fill?: boolean;
  formatXLabel?: (label: string, i: number) => string;
}

/**
 * Multi-series line chart. Drives TwoSeriesLine, MultiLine, StackedArea
 * (as a non-stacked overlay), ActivityChart (single line + faint area).
 */
export function ServerLines({
  data,
  width,
  height,
  series,
  legend,
  fill = false,
  formatXLabel = (l) => l,
}: LinesProps) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const showLegend = (legend ?? series.length > 1) && series.length > 0;
  const legendH = showLegend ? 18 : 0;
  const padL = 40;
  const padR = 12;
  const padT = 8 + legendH;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const ticks = yTicks(max);
  const yScale = (v: number) => padT + innerH - (v / niceCeil(max)) * innerH;
  const xScale = (i: number) =>
    data.length === 1 ? padL + innerW / 2 : padL + (i / (data.length - 1)) * innerW;

  const targetLabels = Math.max(4, Math.min(data.length, Math.floor(innerW / 64)));
  const stride = Math.max(1, Math.ceil(data.length / targetLabels));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      style={{ overflow: "visible" }}
    >
      {showLegend && (
        <g>
          {series.map((s, i) => {
            const x = padL + i * 96;
            return (
              <g key={s.label} transform={`translate(${x}, 4)`}>
                <rect width={9} height={9} rx={2} fill={s.color ?? PALETTE[i % PALETTE.length]} />
                <text x={14} y={9} fontSize={11} fill={TICK_COLOR}>
                  {s.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
      {ticks.map((t) => {
        const y = yScale(t);
        return (
          <g key={t}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y}
              y2={y}
              stroke={AXIS_COLOR}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={TICK_FONT_SIZE}
              fill={TICK_COLOR}
            >
              {fmt(t)}
            </text>
          </g>
        );
      })}
      {series.map((s, sIdx) => {
        const color = s.color ?? PALETTE[sIdx % PALETTE.length];
        const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.values[sIdx] ?? 0) }));
        const path = points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");
        const baselineY = padT + innerH;
        const areaPath =
          points.length > 0
            ? `${path} L ${points[points.length - 1].x.toFixed(1)} ${baselineY} L ${points[0].x.toFixed(1)} ${baselineY} Z`
            : "";
        return (
          <g key={s.label}>
            {fill && (
              <path d={areaPath} fill={color} fillOpacity={0.15} stroke="none" />
            )}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={s.strokeWidth ?? 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.length <= 60 &&
              points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={2}
                  fill={color}
                >
                  <title>{`${formatXLabel(data[i].label, i)} · ${s.label}: ${fmt(data[i].values[sIdx] ?? 0)}`}</title>
                </circle>
              ))}
          </g>
        );
      })}
      {data.map((d, i) =>
        i % stride === 0 ? (
          <text
            key={d.label}
            x={xScale(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize={TICK_FONT_SIZE}
            fill={TICK_COLOR}
          >
            {formatXLabel(d.label, i)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

interface PieProps {
  data: { name: string; value: number; color?: string }[];
  width: number;
  height: number;
  /** Inner-radius / outer-radius ratio. 0 = solid pie, 0.6 = donut. */
  innerRatio?: number;
  legend?: boolean;
  centerLabel?: { title: string; value: string };
}

/**
 * Donut / pie. Inner ratio defaults to 0.58 to match the live Donut wrapper.
 */
export function ServerPie({
  data,
  width,
  height,
  innerRatio = 0.58,
  legend = true,
  centerLabel,
}: PieProps) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const legendH = legend ? 60 : 12;
  const radius = Math.min(width, height - legendH) / 2 - 6;
  const cx = width / 2;
  const cy = (height - legendH) / 2 + 4;
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const innerR = radius * innerRatio;

  let startAngle = -Math.PI / 2; // 12 o'clock
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const x1 = cx + Math.cos(startAngle) * radius;
    const y1 = cy + Math.sin(startAngle) * radius;
    const x2 = cx + Math.cos(endAngle) * radius;
    const y2 = cy + Math.sin(endAngle) * radius;
    const ix1 = cx + Math.cos(startAngle) * innerR;
    const iy1 = cy + Math.sin(startAngle) * innerR;
    const ix2 = cx + Math.cos(endAngle) * innerR;
    const iy2 = cy + Math.sin(endAngle) * innerR;
    const large = angle > Math.PI ? 1 : 0;
    // Outer arc → inner arc reversed → close. Donut wedge.
    const path = `M ${x1.toFixed(2)} ${y1.toFixed(2)}
      A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
      L ${ix2.toFixed(2)} ${iy2.toFixed(2)}
      A ${innerR} ${innerR} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;
    const color = d.color ?? PALETTE[i % PALETTE.length];
    startAngle = endAngle;
    return { ...d, path, color };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      style={{ overflow: "visible" }}
    >
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color}>
          <title>{`${s.name}: ${fmt(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
        </path>
      ))}
      {centerLabel && (
        <g textAnchor="middle">
          <text x={cx} y={cy - 4} fontSize={11} fill={TICK_COLOR}>
            {centerLabel.title}
          </text>
          <text x={cx} y={cy + 16} fontSize={22} fontWeight={600} fill="currentColor">
            {centerLabel.value}
          </text>
        </g>
      )}
      {legend && (
        <g transform={`translate(8, ${height - legendH + 8})`}>
          {slices.slice(0, 8).map((s, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            return (
              <g key={i} transform={`translate(${col * (width / 2 - 16)}, ${row * 16})`}>
                <rect width={9} height={9} rx={2} fill={s.color} />
                <text x={14} y={9} fontSize={11} fill={TICK_COLOR}>
                  {`${s.name} · ${fmt(s.value)}`}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

interface HBarsProps {
  data: { label: string; n: number }[];
  width: number;
  height: number;
  /** Color tone (matches the live LatencyHistogram). */
  tone?: "primary" | "muted";
}

/** Horizontal bar list — used by latency histograms. */
export function ServerHorizontalBars({
  data,
  width,
  height,
  tone = "primary",
}: HBarsProps) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const labelW = 64;
  const countW = 48;
  const innerW = width - labelW - countW - 12;
  const max = Math.max(1, ...data.map((d) => d.n));
  const rowH = (height - 4) / data.length;
  const fill = tone === "primary" ? "var(--color-primary)" : "var(--color-muted-foreground)";
  const opacity = tone === "primary" ? 0.85 : 0.55;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      style={{ overflow: "visible" }}
    >
      {data.map((d, i) => {
        const y = i * rowH + 2;
        const barH = rowH * 0.6;
        const barW = (d.n / max) * innerW;
        return (
          <g key={d.label}>
            <text
              x={labelW - 6}
              y={y + barH / 2 + 3}
              textAnchor="end"
              fontSize={TICK_FONT_SIZE}
              fill={TICK_COLOR}
            >
              {d.label}
            </text>
            <rect
              x={labelW}
              y={y + (rowH - barH) / 2}
              width={Math.max(0, barW)}
              height={barH}
              fill={fill}
              opacity={opacity}
              rx={2}
            >
              <title>{`${d.label}: ${fmt(d.n)}`}</title>
            </rect>
            <text
              x={labelW + innerW + 8}
              y={y + barH / 2 + 3}
              fontSize={TICK_FONT_SIZE}
              fill={TICK_COLOR}
            >
              {fmt(d.n)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 24-cell hour-of-day grid — replaces HourRadial in export (radial geometry
 * is hard to print and adds little signal vs a linear strip).
 */
export function ServerHourStrip({
  data,
  width,
  height,
}: {
  data: { hour: number; mine: number; theirs: number }[];
  width: number;
  height: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.mine + d.theirs));
  const padL = 24;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const cellW = innerW / 24;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      style={{ overflow: "visible" }}
    >
      {data.map((d, i) => {
        const total = d.mine + d.theirs;
        const h = (total / max) * innerH;
        const x = padL + i * cellW;
        const y = padT + innerH - h;
        const mineH = (d.mine / max) * innerH;
        const theirsH = (d.theirs / max) * innerH;
        return (
          <g key={d.hour}>
            <rect
              x={x + 1}
              y={padT + innerH - theirsH}
              width={cellW - 2}
              height={theirsH}
              fill="var(--color-muted-foreground)"
              opacity={0.45}
            />
            <rect
              x={x + 1}
              y={y}
              width={cellW - 2}
              height={mineH}
              fill="var(--color-primary)"
              opacity={0.85}
            >
              <title>{`${String(d.hour).padStart(2, "0")}:00 — you ${fmt(d.mine)} · them ${fmt(d.theirs)}`}</title>
            </rect>
            {i % 3 === 0 && (
              <text
                x={x + cellW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={TICK_FONT_SIZE}
                fill={TICK_COLOR}
              >
                {String(d.hour).padStart(2, "0")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
