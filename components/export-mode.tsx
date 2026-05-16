"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Set by the root layout when the request carries `x-export-mode: 1` (the
 * `/api/export/page` route injects this when it server-fetches a page).
 *
 * Client chart wrappers read this flag and swap their default
 * `<ResponsiveContainer width="100%">` for a fixed-pixel container — Recharts
 * needs a measured DOM to paint, which it doesn't have during SSR, so
 * "100%" containers always export blank. A fixed width lets Recharts SSR
 * its real SVG output instead.
 */
const ExportModeContext = createContext(false);

export function ExportModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <ExportModeContext.Provider value={value}>{children}</ExportModeContext.Provider>
  );
}

export function useExportMode(): boolean {
  return useContext(ExportModeContext);
}

/**
 * Default export viewport. Picked so a 720px-wide chart sits comfortably in
 * the ~980px reading width that the recap HTML export already uses, and
 * still fits A4 / Letter when printed.
 */
export const EXPORT_CHART_WIDTH = 720;
export const EXPORT_CHART_WIDTH_SQUARE = 360;
