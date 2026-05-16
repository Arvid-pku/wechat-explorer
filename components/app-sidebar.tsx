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
  Settings,
  Command as CommandIcon,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/links", label: "Links", icon: LinkIcon },
  { href: "/search", label: "Search", icon: Search },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/reading", label: "Reading queue", icon: BookOpen },
];

const FOOTER_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
];

interface AppSidebarProps {
  onOpenCommand: () => void;
}

export function AppSidebar({ onOpenCommand }: AppSidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4 font-semibold">
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <span>WeChat Explorer</span>
      </div>

      <button
        onClick={onOpenCommand}
        className="mx-3 mt-3 flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" />
          <span>Quick search…</span>
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
                  <span>{item.label}</span>
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
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
