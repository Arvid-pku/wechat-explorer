"use client";

interface Props {
  rows: { msg_type: string; n: number }[];
}

export function MsgTypeList({ rows }: Props) {
  const total = rows.reduce((a, b) => a + b.n, 0) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = (r.n / total) * 100;
        return (
          <div key={r.msg_type} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate">{r.msg_type || "未分类"}</span>
              <span className="text-muted-foreground tabular-nums text-xs">
                {r.n.toLocaleString()} · {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1 rounded bg-muted overflow-hidden">
              <div className="h-full bg-foreground/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
