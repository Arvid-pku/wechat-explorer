/**
 * Inline word cloud: spans sized by weight, clamped to a reasonable font-size
 * range, hover shows count.
 *
 * Each word links to the search page so the user can verify context.
 */

import Link from "next/link";
import type { ScoredWord } from "@/lib/text";

interface Props {
  words: ScoredWord[];
  /** Whether to link words to /search?q=... */
  linkable?: boolean;
  /** Max words to render. */
  limit?: number;
}

export function KeywordCloud({ words, linkable = true, limit }: Props) {
  const w = limit ? words.slice(0, limit) : words;
  if (w.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough text to build a cloud.</p>;
  }
  const min = Math.min(...w.map((x) => x.weight));
  const max = Math.max(...w.map((x) => x.weight));
  const range = max - min || 1;
  // map weight → 11..28px font-size
  const size = (weight: number) => 11 + Math.round(((weight - min) / range) * 17);

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-baseline">
      {w.map((sw, i) => {
        const fs = size(sw.weight);
        const opacity = 0.55 + ((sw.weight - min) / range) * 0.45;
        const body = (
          <span
            key={sw.word}
            className="font-medium hover:underline"
            style={{
              fontSize: `${fs}px`,
              lineHeight: 1.1,
              opacity,
              color: "var(--color-foreground)",
            }}
            title={`${sw.word} · ${sw.count}× · score ${sw.weight.toFixed(1)}`}
          >
            {sw.word}
          </span>
        );
        if (!linkable) return <span key={`${sw.word}-${i}`}>{body}</span>;
        return (
          <Link key={`${sw.word}-${i}`} href={`/search?q=${encodeURIComponent(sw.word)}`}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}
