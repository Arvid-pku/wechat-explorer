"use client";

import { Download } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "./i18n-provider";

/**
 * Header-mounted "Export HTML" button. Builds an absolute download link to
 * `/api/export/page?path=<current>` preserving the current pathname + search
 * params, so users get exactly the view they're looking at right now.
 *
 * Hidden on routes that don't make sense to export (`/api/*`, `/debug`).
 */
export function ExportHtmlButton() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const { t } = useLocale();

  if (!pathname || pathname.startsWith("/api/") || pathname === "/debug") {
    return null;
  }

  const qs = sp.toString();
  const fullPath = qs ? `${pathname}?${qs}` : pathname;
  const href = `/api/export/page?path=${encodeURIComponent(fullPath)}`;

  return (
    <a
      href={href}
      className="inline-flex size-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={t("export.button")}
      title={t("export.title")}
    >
      <Download className="size-4" />
    </a>
  );
}
