"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts:
 *   /        — open the command palette (same as ⌘K)
 *   g h      — go to overview
 *   g m      — go to /me (personal stats)
 *   g c      — contacts
 *   g l      — links
 *   g k      — calendar
 *   g r      — reading
 *   g s      — settings
 *   g g      — graph
 *   g y      — current year recap
 *   j / k    — move focus down/up among rows in the current table/list
 *
 * Shortcuts are disabled while typing in an input/textarea/contenteditable.
 */
export function KeyboardShortcuts({ onOpenCommand }: { onOpenCommand: () => void }) {
  const router = useRouter();

  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function resetG() {
      gPending = false;
      if (gTimer) clearTimeout(gTimer);
      gTimer = null;
    }

    function isTyping(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function getRowList(): HTMLElement[] {
      // Prefer table rows in the main content area.
      const tableRows = Array.from(
        document.querySelectorAll("main table tbody tr") as NodeListOf<HTMLElement>,
      );
      if (tableRows.length > 0) return tableRows;
      // Otherwise look for cards / list items with hover state inside <main>.
      const cards = Array.from(
        document.querySelectorAll("main [data-jk-row]") as NodeListOf<HTMLElement>,
      );
      if (cards.length > 0) return cards;
      // Fallback: links inside the main list-like content.
      return Array.from(
        document.querySelectorAll("main a[href^=\"/\"]") as NodeListOf<HTMLElement>,
      );
    }

    function moveSel(delta: 1 | -1) {
      const rows = getRowList();
      if (rows.length === 0) return;
      const currentIdx = rows.findIndex((r) => r === document.activeElement || r.contains(document.activeElement));
      let nextIdx = currentIdx + delta;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= rows.length) nextIdx = rows.length - 1;
      const next = rows[nextIdx];
      const link = next.querySelector("a[href]") as HTMLAnchorElement | null;
      (link ?? next).focus({ preventScroll: false });
      next.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;

      // The g-prefix combos.
      if (gPending) {
        const target = (() => {
          switch (e.key.toLowerCase()) {
            case "h":
              return "/";
            case "m":
              return "/me";
            case "c":
              return "/contacts";
            case "l":
              return "/links";
            case "k":
              return "/calendar";
            case "r":
              return "/reading";
            case "s":
              return "/settings";
            case "g":
              return "/graph";
            case "t":
              return "/topics";
            case "y":
              return `/recap/${new Date().getFullYear()}`;
            default:
              return null;
          }
        })();
        resetG();
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }

      switch (e.key) {
        case "g":
          if (e.shiftKey) return;
          gPending = true;
          gTimer = setTimeout(resetG, 1200);
          e.preventDefault();
          return;
        case "/":
          e.preventDefault();
          onOpenCommand();
          return;
        case "j":
          e.preventDefault();
          moveSel(1);
          return;
        case "k":
          e.preventDefault();
          moveSel(-1);
          return;
        default:
          return;
      }
    }

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      resetG();
    };
  }, [onOpenCommand, router]);

  return null;
}
