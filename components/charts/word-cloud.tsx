/**
 * Pure-server word cloud. Sizes each word by its TF-IDF weight (or count)
 * relative to the top entry. Each word links to /search?q=<word>.
 */
import Link from "next/link";
import type { ScoredWord } from "@/lib/text";

interface Props {
  words: ScoredWord[];
  minSize?: number;
  maxSize?: number;
}

export function WordCloud({ words, minSize = 11, maxSize = 24 }: Props) {
  if (words.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough text in this chat to extract topics yet.
      </p>
    );
  }
  const top = words[0].weight || 1;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 items-baseline leading-tight">
      {words.map((w) => {
        const t = Math.max(0, Math.min(1, w.weight / top));
        const size = minSize + t * (maxSize - minSize);
        const opacity = 0.55 + 0.45 * t;
        return (
          <Link
            key={w.word}
            href={`/search?q=${encodeURIComponent(w.word)}`}
            className="font-medium hover:text-primary transition-colors break-all"
            style={{ fontSize: `${size}px`, opacity }}
            title={`${w.count.toLocaleString()} mentions`}
          >
            {w.word}
          </Link>
        );
      })}
    </div>
  );
}
