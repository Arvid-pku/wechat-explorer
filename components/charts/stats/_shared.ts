// Shared constants for the per-chart Recharts wrappers under
// components/charts/stats/. Pulled out so each chart file can stay small
// (and so a future tree-shake works at the file granularity rather than
// hauling the whole 8-chart bundle just to render one donut).

export const TOOLTIP_STYLE = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--color-foreground)",
};

// Stable, colorblind-friendly palette. First entry is the primary tone.
export const PALETTE = [
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

export function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}
