/**
 * Two 24-cell strips (you / them), colored by intensity.
 * Server component-safe — pure SVG, no client JS.
 */

interface Props {
  data: { hour: number; mine: number; theirs: number }[];
}

export function HourlyGrid({ data }: Props) {
  const maxMine = data.reduce((a, b) => Math.max(a, b.mine), 0) || 1;
  const maxTheirs = data.reduce((a, b) => Math.max(a, b.theirs), 0) || 1;

  return (
    <div className="space-y-3">
      <Row label="You" data={data.map((d) => ({ hour: d.hour, n: d.mine }))} max={maxMine} primary />
      <Row label="Them" data={data.map((d) => ({ hour: d.hour, n: d.theirs }))} max={maxTheirs} />
      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] pl-10 text-[9px] text-muted-foreground tabular-nums">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center">
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  data,
  max,
  primary,
}: {
  label: string;
  data: { hour: number; n: number }[];
  max: number;
  primary?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 shrink-0 text-xs text-muted-foreground">{label}</div>
      <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
        {data.map((d) => {
          const t = Math.min(1, d.n / max);
          const bg = primary
            ? `rgba(20, 20, 20, ${0.08 + 0.85 * t})`
            : `rgba(100, 116, 139, ${0.08 + 0.7 * t})`;
          return (
            <div
              key={d.hour}
              className="aspect-square min-w-0 rounded-sm"
              style={{ background: bg }}
              title={`${String(d.hour).padStart(2, "0")}:00 — ${d.n.toLocaleString()} msgs`}
            />
          );
        })}
      </div>
    </div>
  );
}
