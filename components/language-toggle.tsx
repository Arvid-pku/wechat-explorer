"use client";

import { Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useLocale } from "./i18n-provider";

/**
 * Tiny header-mounted dropdown that flips the active locale. Persists via
 * the `we-locale` cookie set in `LocaleProvider.setLocale`, which also
 * forces a reload so every server component re-renders with the new
 * dictionary on the next paint.
 */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Toggle language / 切换语言"
        className="inline-flex size-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={LOCALE_LABELS[locale]}
      >
        <Languages className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l: Locale) => (
          <DropdownMenuItem key={l} onClick={() => setLocale(l)}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block size-1.5 rounded-full ${l === locale ? "bg-primary" : "bg-transparent"}`}
              />
              {LOCALE_LABELS[l]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
