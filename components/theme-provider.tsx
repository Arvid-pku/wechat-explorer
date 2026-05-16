"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Minimal theme provider, replacing `next-themes` here because Next.js 16
 * warns when next-themes injects a `<script>` into the React tree
 * ("Scripts inside React components are never executed when rendering on
 * the client. Consider using template tag instead").
 *
 * We keep the same `next-themes`-style API surface that the rest of the app
 * uses (`useTheme()` returns `{ theme, resolvedTheme, setTheme }` with
 * values "light" | "dark" | "system"). Anti-FOUC is handled by the small
 * script in app/layout.tsx that runs before React hydrates.
 */
export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "wechat-explorer:theme";

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyClass(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

interface Props {
  children: ReactNode;
  /** "light" | "dark" | "system". */
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = "light" }: Props) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolved, setResolved] = useState<"light" | "dark">(
    defaultTheme === "dark" ? "dark" : "light",
  );

  // After mount, hydrate from storage + system preference.
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    const effective: "light" | "dark" =
      stored === "system" ? (systemPrefersDark() ? "dark" : "light") : stored;
    setResolved(effective);
    applyClass(effective);
  }, []);

  // Watch system pref while in "system" mode.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const eff: "light" | "dark" = mq.matches ? "dark" : "light";
      setResolved(eff);
      applyClass(eff);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    const eff: "light" | "dark" =
      next === "system" ? (systemPrefersDark() ? "dark" : "light") : next;
    setResolved(eff);
    applyClass(eff);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Allow consumers to call before mount; return a safe default.
    return {
      theme: "light",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return ctx;
}
