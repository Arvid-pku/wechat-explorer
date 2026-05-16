/**
 * Reply latency histogram + small line chart for latency-over-time.
 *
 * Buckets are precomputed by `lib/latency.ts` (`bucketLatencies`). Histogram
 * renders as horizontal bars with the label on the left.
 */

import type { LatencyBucket } from "@/lib/latency";

interface HistProps {
  data: LatencyBucket[];
  title?: string;
  /** Optional accent color. */
  tone?: "primary" | "muted";
  /** Optional median label (formatted). */
  median?: string;
}

export function LatencyHist({ data, title, tone = "primary", median }: HistProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No latency data.</p>;
  }
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <div className="space-y-1">
      {title && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{title}</span>
          {median && <span className="tabular-nums">median {median}</span>}
        </div>
      )}
      {data.map((b) => (
        <div key={b.label} className="grid grid-cols-[60px_1fr_48px] items-center gap-2 text-xs">
          <span className="text-right text-muted-foreground tabular-nums">{b.label}</span>
          <div className="h-3 rounded-sm bg-muted overflow-hidden">
            <div
              className={
                tone === "primary"
                  ? "h-full bg-primary/70"
                  : "h-full bg-foreground/40"
              }
              style={{ width: `${(b.n / max) * 100}%` }}
            />
          </div>
          <span className="text-right tabular-nums text-muted-foreground">{b.n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

interface TrendRow {
  month: string;
  themToYouMedianSec: number;
  youToThemMedianSec: number;
  count: number;
}

export function LatencyTrend({
  data,
  height = 140,
}: {
  data: TrendRow[];
  height?: number;
}) {
  const filtered = data.filter((d) => d.count > 4);
  if (filtered.length < 2) return null;

  const width = 720;
  const padL = 40;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  // log-ish y axis since latencies span 1m..days
  const yScale = (sec: number) => {
    if (sec <= 0) return innerH;
    const log = Math.log10(sec); // 0..6
    const norm = Math.max(0, Math.min(1, (log - 1) / 5)); // 10s..1e6s
    return innerH - norm * innerH;
  };

  const xFor = (i: number) => padL + (i / Math.max(1, filtered.length - 1)) * innerW;

  const themPts = filtered.map((d, i) => ({ x: xFor(i), y: padT + yScale(d.themToYouMedianSec) }));
  const youPts = filtered.map((d, i) => ({ x: xFor(i), y: padT + yScale(d.youToThemMedianSec) }));

  const yticks = [60, 300, 1800, 3600, 14400, 86400, 259200];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {yticks.map((sec) => {
        const y = padT + yScale(sec);
        const label = sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 86400 ? `${Math.round(sec / 3600)}h` : `${Math.round(sec / 86400)}d`;
        return (
          <g key={sec}>
            <line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="2 3" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={9} fill="var(--color-muted-foreground)">
              {label}
            </text>
          </g>
        );
      })}
      <Path pts={themPts} stroke="var(--color-primary)" />
      <Path pts={youPts} stroke="var(--color-chart-4)" />
      {filtered.map((d, i) => (
        <text
          key={d.month}
          x={xFor(i)}
          y={height - 6}
          textAnchor="middle"
          fontSize={8}
          fill="var(--color-muted-foreground)"
        >
          {i % Math.max(1, Math.ceil(filtered.length / 12)) === 0 ? d.month.slice(5) : ""}
        </text>
      ))}
      <g transform={`translate(${padL + 4}, ${padT + 4})`}>
        <rect width="160" height="22" fill="var(--color-background)" opacity={0.85} rx={4} />
        <circle cx={8} cy={8} r={3} fill="var(--color-primary)" />
        <text x={16} y={11} fontSize={10} fill="var(--color-foreground)">them → you (median)</text>
        <circle cx={8} cy={18} r={3} fill="var(--color-chart-4)" />
        <text x={16} y={21} fontSize={10} fill="var(--color-foreground)">you → them</text>
      </g>
    </svg>
  );
}

function Path({ pts, stroke }: { pts: { x: number; y: number }[]; stroke: string }) {
  if (pts.length === 0) return null;
  return (
    <>
      <path
        d={pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={stroke} />
      ))}
    </>
  );
}
