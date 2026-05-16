import Link from "next/link";
import { Archive } from "lucide-react";

/**
 * Pill-style "Include archived" toggle shared by the search / links /
 * calendar / reading / recap pages. Server-rendered, navigates by setting
 * `archived=1` in the URL — no client component needed.
 *
 * Pass the current value plus a function that produces the next URL.
 */
export function ArchivedToggle({
  on,
  href,
  className,
}: {
  on: boolean;
  /** URL when the toggle is clicked. */
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
          on
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent"
        }` + (className ? ` ${className}` : "")
      }
      title={on ? "Showing archived" : "Click to include archived"}
    >
      <Archive className="size-3.5" />
      {on ? "Archived shown" : "Include archived"}
    </Link>
  );
}

/**
 * Tiny helper for building "toggle the archived param" URLs. Keeps the rest
 * of the existing searchParams in place.
 */
export function buildArchivedToggleHref(
  base: string,
  sp: Record<string, string | undefined>,
  currentOn: boolean,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "archived") next.set(k, v);
  }
  if (!currentOn) next.set("archived", "1");
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}
