/**
 * Pure-SVG stacked monthly bars + cumulative line.
 *
 * Each month gets a "mine" bar stacked on top of a "theirs" bar. A second
 * y-axis (cumulative) shows running total as a line. Light theme defaults
 * — used both on the live recap page and inlined in the HTML export.
 */

interface MonthlyRow {
  ym: string; // YYYY-MM
  mine: number;
  theirs: number;
  total: number;
}

interface Props {
  data: MonthlyRow[];
  height?: number;
  width?: number;
  /** Hide axes/legends for compact embedding. */
  compact?: boolean;
}

export function MonthlyBars({ data, height = 220, width = 720, compact }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages this year.</p>;
  }
  const padL = compact ? 30 : 36;
  const padR = compact ? 36 : 56;
  const padT = compact ? 8 : 16;
  const padB = compact ? 18 : 28;
  const w = width;
  const h = height;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const maxBar = Math.max(...data.map((d) => d.total), 1);
  let running = 0;
  const cumPoints: { x: number; y: number; cum: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    running += data[i].total;
    const x = padL + (i + 0.5) * (innerW / data.length);
    cumPoints.push({ x, y: 0, cum: running });
  }
  const maxCum = running || 1;
  for (const p of cumPoints) {
    const cumRatio = p.cum / maxCum;
    p.y = padT + innerH - cumRatio * innerH;
  }

  const barW = (innerW / data.length) * 0.6;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxBar * i) / yTicks));

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Monthly activity">
      {/* gridlines */}
      {yTickValues.map((tv, i) => {
        const y = padT + innerH - (tv / maxBar) * innerH;
        return (
          <g key={i}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y}
              y2={y}
              stroke="var(--color-border)"
              strokeDasharray="2 3"
            />
            {!compact && (
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-muted-foreground)"
              >
                {tv.toLocaleString()}
              </text>
            )}
          </g>
        );
      })}

      {/* bars */}
      {data.map((d, i) => {
        const cx = padL + (i + 0.5) * (innerW / data.length);
        const x = cx - barW / 2;
        const theirsH = (d.theirs / maxBar) * innerH;
        const mineH = (d.mine / maxBar) * innerH;
        const yTheirs = padT + innerH - theirsH;
        const yMine = yTheirs - mineH;
        const labelShow = data.length <= 12 || i % 2 === 0;
        return (
          <g key={d.ym}>
            <rect
              x={x}
              y={yTheirs}
              width={barW}
              height={theirsH}
              fill="var(--color-muted-foreground)"
              opacity={0.35}
            >
              <title>{`${d.ym}: them ${d.theirs.toLocaleString()}`}</title>
            </rect>
            <rect
              x={x}
              y={yMine}
              width={barW}
              height={mineH}
              fill="var(--color-primary)"
              opacity={0.85}
            >
              <title>{`${d.ym}: you ${d.mine.toLocaleString()}`}</title>
            </rect>
            {!compact && labelShow && (
              <text
                x={cx}
                y={h - padB + 14}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-muted-foreground)"
              >
                {d.ym.slice(5)}
              </text>
            )}
          </g>
        );
      })}

      {/* cumulative line */}
      <path
        d={cumPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--color-chart-4)"
        strokeWidth={1.5}
      />
      {cumPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--color-chart-4)">
          <title>{`cum: ${p.cum.toLocaleString()} by ${data[i].ym}`}</title>
        </circle>
      ))}

      {/* right-axis cumulative label */}
      {!compact && (
        <text
          x={w - 4}
          y={cumPoints[cumPoints.length - 1].y + 3}
          textAnchor="end"
          fontSize={10}
          fill="var(--color-chart-4)"
        >
          cum {cumPoints[cumPoints.length - 1].cum.toLocaleString()}
        </text>
      )}
    </svg>
  );
}
