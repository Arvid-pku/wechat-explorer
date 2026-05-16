import Link from "next/link";
import { Archive } from "lucide-react";
import { t, type Locale } from "@/lib/i18n";

/**
 * Pill that toggles the "include archived chats" URL parameter on list pages
 * (search / links / calendar / reading / recap / stats). Server-rendered;
 * navigates by setting `archived=1`. Different from `ArchiveSessionButton`,
 * which actually flips a single session's archived state via the API.
 *
 * Accepts an optional `locale` so server pages that have already resolved it
 * can hand it in. Defaults to English when omitted (callers that haven't
 * migrated yet keep their pre-i18n behaviour).
 */
export function ArchivedFilterPill({
  on,
  href,
  className,
  locale = "en",
}: {
  on: boolean;
  /** URL when the toggle is clicked. */
  href: string;
  className?: string;
  locale?: Locale;
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
      title={on
        ? (locale === "zh" ? "已显示归档会话" : "Showing archived")
        : (locale === "zh" ? "点击以包含归档会话" : "Click to include archived")}
    >
      <Archive className="size-3.5" />
      {on ? t("common.archivedShown", locale) : t("common.includeArchived", locale)}
    </Link>
  );
}

/**
 * Build the "toggle archived param" URL while preserving the rest of the
 * current searchParams.
 */
export function buildArchivedFilterHref(
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
