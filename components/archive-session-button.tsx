"use client";

import { Button } from "@/components/ui/button";
import { Archive, RotateCcw, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ArchiveToggle({ username, archived }: { username: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function flip() {
    setBusy(true);
    const action = archived ? "restore" : "archive";
    const tid = toast.loading(`${action === "archive" ? "Archiving" : "Restoring"}…`);
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, usernames: [username], reason: "manual" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(action === "archive" ? "Archived." : "Restored.", { id: tid });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={archived ? "default" : "outline"}
      size="sm"
      onClick={flip}
      disabled={busy}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : archived ? (
        <RotateCcw className="size-3.5" />
      ) : (
        <Archive className="size-3.5" />
      )}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
