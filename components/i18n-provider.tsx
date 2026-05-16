"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  t,
  type Locale,
  type TKey,
} from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TKey) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => t(key, DEFAULT_LOCALE),
});

/**
 * Wraps the app in a locale context. The initial `locale` is resolved on the
 * server (via the `we-locale` cookie) and passed in; the client component
 * only owns the write path (which also flips the cookie + reloads so server
 * components re-render with the new dictionary).
 */
export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const setLocale = useCallback((next: Locale) => {
    // Persist via cookie so server-rendered routes pick it up next request.
    // 1 year is plenty for a UI preference; SameSite=Lax keeps it safe.
    document.cookie = `${LOCALE_COOKIE}=${next}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    // Reload so every server component re-renders with the new locale.
    if (typeof window !== "undefined") window.location.reload();
  }, []);
  const value = useMemo<LocaleContextValue>(
    () => ({ locale: initial, setLocale, t: (k) => t(k, initial) }),
    [initial, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
