/**
 * 24-hour activity strip — two rows (you, them) so you can see schedule/sleep
 * patterns at a glance. Cell color scales by row max to keep both visible.
 */

interface HourlyRow {
  hour: number;
  mine: number;
  theirs: number;
}

interface Props {
  data: HourlyRow[];
  /** Optional label override. */
  labels?: { mine: string; theirs: string };
}

export function HourlyGrid({ data, labels }: Props) {
  if (data.length === 0) return null;
  const maxMine = Math.max(...data.map((d) => d.mine), 1);
  const maxTheirs = Math.max(...data.map((d) => d.theirs), 1);
  const labelMine = labels?.mine ?? "you";
  const labelTheirs = labels?.theirs ?? "them";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[64px_1fr] items-center gap-3">
        <div className="text-xs text-muted-foreground text-right tabular-nums">{labelMine}</div>
        <div className="grid grid-cols-24 gap-[2px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {data.map((d) => (
            <Cell key={`me-${d.hour}`} n={d.mine} max={maxMine} hour={d.hour} who="you" tone="primary" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[64px_1fr] items-center gap-3">
        <div className="text-xs text-muted-foreground text-right tabular-nums">{labelTheirs}</div>
        <div className="grid grid-cols-24 gap-[2px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {data.map((d) => (
            <Cell key={`them-${d.hour}`} n={d.theirs} max={maxTheirs} hour={d.hour} who="them" tone="muted" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[64px_1fr] gap-3 text-[10px] text-muted-foreground tabular-nums">
        <div></div>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {data.map((d) => (
            <div key={`l-${d.hour}`} className="text-center">
              {d.hour % 3 === 0 ? String(d.hour).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({
  n,
  max,
  hour,
  who,
  tone,
}: {
  n: number;
  max: number;
  hour: number;
  who: string;
  tone: "primary" | "muted";
}) {
  const r = n === 0 ? 0 : 0.12 + (n / max) * 0.88;
  const bg =
    tone === "primary"
      ? `color-mix(in oklab, var(--color-primary) ${Math.round(r * 100)}%, var(--color-background))`
      : `color-mix(in oklab, var(--color-foreground) ${Math.round(r * 60)}%, var(--color-background))`;
  return (
    <div
      className="h-5 rounded-sm"
      style={{ background: bg, opacity: n === 0 ? 0.18 : 1 }}
      title={`${String(hour).padStart(2, "0")}:00 — ${who}: ${n.toLocaleString()}`}
    />
  );
}
