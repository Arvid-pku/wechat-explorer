"use client";

import { useLocale } from "@/components/i18n-provider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";

/**
 * Settings-page language picker — same effect as the header `LanguageToggle`
 * but rendered as a labelled segmented control inside the Settings card.
 */
export function LanguagePanel() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="inline-flex rounded-md border border-border/60 p-[3px] text-sm">
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={`rounded px-3 py-1 font-medium transition-colors ${
            locale === l
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
