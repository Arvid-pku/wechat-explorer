/**
 * Server-rendered keyword cloud. Maps token weight to a clamped 5th–95th
 * percentile range, then to one of six font sizes from text-xs..text-3xl.
 *
 * Each keyword links to /search?q=<word> so the cloud doubles as exploration.
 */
import Link from "next/link";
import type { ScoredWord } from "@/lib/text";

const SIZE_STEPS = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
];

const WEIGHT_STEPS = [
  "font-normal text-muted-foreground",
  "font-normal text-foreground/80",
  "font-medium text-foreground/90",
  "font-medium text-foreground",
  "font-semibold text-foreground",
  "font-semibold text-emerald-600 dark:text-emerald-400",
  "font-bold text-emerald-700 dark:text-emerald-300",
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function KeywordCloud({
  words,
  empty = "Nothing distinctive yet.",
}: {
  words: ScoredWord[];
  empty?: string;
}) {
  if (words.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const weights = words.map((w) => w.weight).sort((a, b) => a - b);
  const lo = percentile(weights, 0.05);
  const hi = percentile(weights, 0.95);
  const span = Math.max(1e-9, hi - lo);

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      {words.map((w) => {
        const clamped = Math.min(hi, Math.max(lo, w.weight));
        const t = (clamped - lo) / span;
        const step = Math.min(SIZE_STEPS.length - 1, Math.max(0, Math.round(t * (SIZE_STEPS.length - 1))));
        const sizeCls = SIZE_STEPS[step];
        const colorCls = WEIGHT_STEPS[step];
        return (
          <Link
            key={w.word}
            href={`/search?q=${encodeURIComponent(w.word)}`}
            className={`${sizeCls} ${colorCls} leading-tight hover:underline transition-colors`}
            title={`${w.count.toLocaleString()} mentions · weight ${w.weight.toFixed(1)}`}
          >
            {w.word}
          </Link>
        );
      })}
    </div>
  );
}
