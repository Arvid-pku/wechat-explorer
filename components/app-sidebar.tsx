"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Users,
  LinkIcon,
  Search,
  CalendarDays,
  BookOpen,
  Network,
  Settings,
  Command as CommandIcon,
  Sparkles,
  UserCircle2,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/i18n-provider";
import type { TKey } from "@/lib/i18n";

// Nav items reference a translation key (`tKey`) rather than a literal label
// — the sidebar resolves them on render via `useLocale`.
const NAV_ITEMS: { href: string; tKey: TKey; icon: typeof BarChart3 }[] = [
  { href: "/", tKey: "nav.overview", icon: BarChart3 },
  { href: "/me", tKey: "nav.you", icon: UserCircle2 },
  { href: "/contacts", tKey: "nav.contacts", icon: Users },
  { href: "/links", tKey: "nav.links", icon: LinkIcon },
  { href: "/search", tKey: "nav.search", icon: Search },
  { href: "/calendar", tKey: "nav.calendar", icon: CalendarDays },
  { href: "/reading", tKey: "nav.reading", icon: BookOpen },
  { href: "/topics", tKey: "nav.topics", icon: TrendingUp },
  { href: "/graph", tKey: "nav.graph", icon: Network },
];

const FOOTER_ITEMS: { href: string; tKey: TKey; icon: typeof Settings }[] = [
  { href: "/settings", tKey: "nav.settings", icon: Settings },
];

interface AppSidebarProps {
  onOpenCommand: () => void;
}

export function AppSidebar({ onOpenCommand }: AppSidebarProps) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  return (
    // `sticky top-0 h-screen` pins the sidebar to the viewport on long pages
    // — Settings (footer item) stays one click away no matter how far down
    // you've scrolled. `overflow-y-auto` lets the nav scroll inside the
    // sidebar if a future entry pushes total height past the viewport.
    // `self-start` is needed so the flex container doesn't stretch the
    // sticky element to the document height (which would defeat sticky).
    <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground sticky top-0 h-screen self-start overflow-y-auto">
      {/* macOS `hiddenInset` shows traffic lights at top-left; the pl-20 keeps
        * the brand text from sitting under them. `data-app-region="drag"` lets
        * the user drag the window from this strip in the packaged Electron
        * build (no-op in plain browsers). */}
      <div
        data-app-region="drag"
        className="flex h-14 items-center gap-2 border-b border-border/60 pl-20 pr-4 font-semibold"
      >
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <span>WeChat Explorer</span>
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        data-app-region="no-drag"
        className="mx-3 mt-3 flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" />
          <span>{locale === "zh" ? "快速搜索…" : "Quick search…"}</span>
        </span>
        <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <nav className="flex-1 px-2 py-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{t(item.tKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-2 pb-3">
        <ul className="space-y-0.5">
          {FOOTER_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{t(item.tKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
