"use client";

import Link from "next/link";
import { ChevronDown, ArrowDownAZ, ArrowUpZA, Check, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Notion-style table column header. Renders a button that opens a popover
 * with sort + filter controls inline with the column name. Active sort and
 * non-default filters show small indicators next to the label so users can
 * tell at a glance which columns have something applied.
 *
 * URL state stays the same as before (`sort=`, `type=`, `q=`, `view=`) —
 * popover actions just navigate via `<Link>` to keep server components
 * authoritative; we never duplicate filter state on the client.
 */
export function ColumnHeader({
  label,
  align = "left",
  sortDirection,
  filterActive,
  children,
}: {
  label: string;
  align?: "left" | "right";
  /** "asc" / "desc" / undefined — drawn as ▲/▼ next to the label */
  sortDirection?: "asc" | "desc";
  /** Show a small dot when any non-default filter is applied. */
  filterActive?: boolean;
  /** Popover body. Each action should be a `<Link>` so navigation closes the popover. */
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "group/col -mx-2 px-2 py-1 rounded inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors",
          align === "right" ? "justify-end ml-auto" : "justify-start",
        )}
      >
        <span className="uppercase tracking-wide">{label}</span>
        {sortDirection === "asc" && <ArrowDownAZ className="size-3" />}
        {sortDirection === "desc" && <ArrowUpZA className="size-3" />}
        {filterActive && (
          <span className="size-1.5 rounded-full bg-primary" />
        )}
        <ChevronDown className="size-3 opacity-50 group-hover/col:opacity-100" />
      </PopoverTrigger>
      <PopoverContent
        align={align === "right" ? "end" : "start"}
        className="w-60 p-1.5"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Convenience: one option row inside a column popover. Renders as a
 * `<Link>` so navigation auto-closes the popover. Shows a check on the
 * active option.
 */
export function ColumnOption({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
        active && "font-medium text-foreground",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {active && <Check className="size-3.5 text-primary" />}
    </Link>
  );
}

export function ColumnDivider() {
  return <div className="my-1 h-px bg-border/60" />;
}

export function ColumnSection({ label }: { label: string }) {
  return (
    <p className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
  );
}

/**
 * Filter input for the Name column. Uses a native form GET so we don't have
 * to pass a function prop from the server component (React forbids that for
 * client boundaries). Hidden inputs carry the rest of the current params so
 * submitting only changes `q` and clears `q` when the field is empty.
 *
 * `path` is the route to GET to (e.g. `/contacts`).
 * `name` is the form field name to set (e.g. `q`).
 * `currentParams` is the rest of the URL state to preserve, minus `name`.
 * `clearHref` is a static link used by the X button to drop the param.
 */
export function ColumnSearchInput({
  path,
  name,
  initial,
  currentParams,
  clearHref,
}: {
  path: string;
  name: string;
  initial: string;
  currentParams: Record<string, string>;
  clearHref: string;
}) {
  return (
    <form
      method="get"
      action={path}
      className="flex items-center gap-1 px-1 pt-1"
    >
      {Object.entries(currentParams).map(([k, v]) =>
        k === name ? null : <input key={k} type="hidden" name={k} value={v} />,
      )}
      <Input
        name={name}
        defaultValue={initial}
        placeholder="Filter by name…"
        autoFocus
        className="h-8 text-sm"
      />
      {initial && (
        <Link
          href={clearHref}
          className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          title="Clear filter"
        >
          <X className="size-3.5" />
        </Link>
      )}
    </form>
  );
}
