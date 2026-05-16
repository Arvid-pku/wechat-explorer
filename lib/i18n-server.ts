/**
 * Server-side locale resolver. Reads the `we-locale` cookie on each request
 * so server components can call `t(key, locale)` from `lib/i18n.ts` without
 * a global. Cookies are async in Next 16 — `await getServerLocale()`.
 */

import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./i18n";

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}
