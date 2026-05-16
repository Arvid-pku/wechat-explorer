"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { BarChart3, Users, LinkIcon, Search, CalendarDays, BookOpen, Network, Settings, Sparkles, UserCircle2 } from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export function CommandPalette({ open, setOpen }: CommandPaletteProps) {
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function searchTo(query: string) {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search messages…" value={q} onValueChange={setQ} />
      <CommandList>
        <div className="px-2 pt-1.5 pb-1 text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-3 flex-wrap">
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">g h</kbd> overview</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">g c</kbd> contacts</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">g k</kbd> calendar</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">g y</kbd> recap</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">j</kbd>/<kbd className="rounded border bg-muted px-1.5 py-0.5">k</kbd> nav rows</span>
        </div>
        <CommandEmpty>
          {q.trim() ? (
            <button
              onClick={() => searchTo(q)}
              className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded"
            >
              Search messages for <span className="font-medium">&quot;{q}&quot;</span> →
            </button>
          ) : (
            <span>No results.</span>
          )}
        </CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/")}>
            <BarChart3 className="mr-2 size-4" />
            Overview
          </CommandItem>
          <CommandItem onSelect={() => go("/me")}>
            <UserCircle2 className="mr-2 size-4" />
            You (personal stats)
          </CommandItem>
          <CommandItem onSelect={() => go("/contacts")}>
            <Users className="mr-2 size-4" />
            Contacts
          </CommandItem>
          <CommandItem onSelect={() => go("/links")}>
            <LinkIcon className="mr-2 size-4" />
            Links
          </CommandItem>
          <CommandItem onSelect={() => go("/search")}>
            <Search className="mr-2 size-4" />
            Search
          </CommandItem>
          <CommandItem onSelect={() => go("/calendar")}>
            <CalendarDays className="mr-2 size-4" />
            Calendar
          </CommandItem>
          <CommandItem onSelect={() => go("/reading")}>
            <BookOpen className="mr-2 size-4" />
            Reading queue
          </CommandItem>
          <CommandItem onSelect={() => go("/graph")}>
            <Network className="mr-2 size-4" />
            Graph
          </CommandItem>
          <CommandItem onSelect={() => go(`/recap/${new Date().getFullYear()}`)}>
            <Sparkles className="mr-2 size-4" />
            Year in Review
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings className="mr-2 size-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        {q.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => searchTo(q)}>
                <Search className="mr-2 size-4" />
                Search messages for &quot;{q}&quot;
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
