/**
 * Pure-SVG sparkline. No external lib, no JS runtime — renders as part of the
 * server-component tree. Good for inline cells in tables.
 */

interface Props {
  /** Numeric series, oldest → newest. */
  data: number[];
  /** SVG width in px. Default 80. */
  width?: number;
  /** SVG height in px. Default 24. */
  height?: number;
  /** Stroke color (CSS). Default uses currentColor. */
  stroke?: string;
  /** Optional fill color (CSS) under the line. */
  fill?: string;
  /** Stroke width in px. Default 1.4. */
  strokeWidth?: number;
  /** Highlight the last data point with a dot. Default true. */
  showLast?: boolean;
  /** Optional className. */
  className?: string;
  /** Optional title for native tooltip. */
  title?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  stroke,
  fill,
  strokeWidth = 1.4,
  showLast = true,
  className,
  title,
}: Props) {
  if (!data || data.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    fill && data.length > 1
      ? `${path} L ${points[points.length - 1][0].toFixed(2)} ${height} L 0 ${height} Z`
      : null;
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {areaPath && <path d={areaPath} fill={fill} />}
      <path
        d={path}
        fill="none"
        stroke={stroke ?? "currentColor"}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showLast && last && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={1.6}
          fill={stroke ?? "currentColor"}
        />
      )}
    </svg>
  );
}
