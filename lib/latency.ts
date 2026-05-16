/**
 * Reply latency utilities.
 *
 * Given a chronologically-ordered message stream and the set of "me" handles,
 * compute reply latency in both directions. A reply is only counted when the
 * sender alternates (mine -> theirs or theirs -> mine). Consecutive same-side
 * messages are collapsed. Gaps longer than `maxGapSec` are treated as new
 * conversations and not counted.
 */

export interface LatencyMessage {
  sender: string;
  timestamp: number;
}

export interface LatencyResult {
  /** Time it takes them to reply to you (sec). */
  themToYou: number[];
  /** Time it takes you to reply to them (sec). */
  youToThem: number[];
}

/**
 * Compute the latency arrays. `messages` should be ordered ascending by ts.
 * Pass `meHandles` (lowercased ideally; we match exact strings).
 *
 * Default `maxGapSec` = 7 days (604_800). Anything longer than this is treated
 * as the start of a new conversation, not a "late reply."
 */
export function computeLatencies(
  messages: LatencyMessage[],
  meHandles: string[],
  opts: { maxGapSec?: number } = {},
): LatencyResult {
  const maxGap = opts.maxGapSec ?? 7 * 24 * 3600;
  const meSet = new Set(meHandles);
  const themToYou: number[] = [];
  const youToThem: number[] = [];

  let lastSide: "me" | "them" | null = null;
  let lastTs = 0;

  for (const m of messages) {
    const isMe = meSet.has(m.sender);
    const side: "me" | "them" = isMe ? "me" : "them";

    if (lastSide !== null && side !== lastSide) {
      const dt = m.timestamp - lastTs;
      if (dt > 0 && dt <= maxGap) {
        if (side === "me") {
          // they sent, then I replied → youToThem(?)
          // Actually: them spoke at lastTs, me spoke now → I took dt to reply to them.
          youToThem.push(dt);
        } else {
          // me spoke at lastTs, them spoke now → they took dt to reply.
          themToYou.push(dt);
        }
      }
    }

    lastSide = side;
    lastTs = m.timestamp;
  }

  return { themToYou, youToThem };
}

/**
 * Bucket a list of latencies into histogram bins (seconds).
 *
 * Returns labelled buckets in human terms:
 *  - <1m, 1–5m, 5–15m, 15m–1h, 1–4h, 4–12h, 12–24h, 1–3d, >3d
 */
export interface LatencyBucket {
  label: string;
  min: number;
  max: number;
  n: number;
}

export const LATENCY_BUCKET_DEF: { label: string; min: number; max: number }[] = [
  { label: "<1m", min: 0, max: 60 },
  { label: "1–5m", min: 60, max: 5 * 60 },
  { label: "5–15m", min: 5 * 60, max: 15 * 60 },
  { label: "15m–1h", min: 15 * 60, max: 60 * 60 },
  { label: "1–4h", min: 60 * 60, max: 4 * 60 * 60 },
  { label: "4–12h", min: 4 * 60 * 60, max: 12 * 60 * 60 },
  { label: "12–24h", min: 12 * 60 * 60, max: 24 * 60 * 60 },
  { label: "1–3d", min: 24 * 60 * 60, max: 3 * 24 * 60 * 60 },
  { label: ">3d", min: 3 * 24 * 60 * 60, max: Number.POSITIVE_INFINITY },
];

export function bucketLatencies(latencies: number[]): LatencyBucket[] {
  const out: LatencyBucket[] = LATENCY_BUCKET_DEF.map((b) => ({ ...b, n: 0 }));
  for (const dt of latencies) {
    for (const b of out) {
      if (dt >= b.min && dt < b.max) {
        b.n++;
        break;
      }
    }
  }
  return out;
}

/**
 * Median + p25/p75 of a latency array (in seconds).
 */
export function latencyStats(values: number[]): { median: number; p25: number; p75: number; count: number } {
  if (values.length === 0) return { median: 0, p25: 0, p75: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    median: pick(0.5),
    p25: pick(0.25),
    p75: pick(0.75),
    count: sorted.length,
  };
}

/**
 * Format seconds as a short human string ("12s", "3m", "2h", "1.4d").
 */
export function formatLatency(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}
