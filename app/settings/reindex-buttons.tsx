"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ReindexButtons() {
  const router = useRouter();
  const [running, setRunning] = useState<"quick" | "deep" | null>(null);

  async function trigger(mode: "quick" | "deep") {
    setRunning(mode);
    const tid = toast.loading(`${mode === "quick" ? "Quick" : "Deep"} index running…`);
    try {
      const res = await fetch(`/api/index?mode=${mode}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Index failed");
      toast.success(
        `Done in ${(body.elapsedMs / 1000).toFixed(1)}s — ${
          mode === "quick"
            ? `${body.sessions} sessions, ${body.links} links`
            : `${body.sessionsProcessed} chats indexed`
        }`,
        { id: tid },
      );
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Button
        variant="default"
        disabled={running !== null}
        onClick={() => trigger("quick")}
        className="gap-1.5"
      >
        {running === "quick" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Quick index
      </Button>
      <Button
        variant="outline"
        disabled={running !== null}
        onClick={() => trigger("deep")}
        className="gap-1.5"
      >
        {running === "deep" ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
        Deep index (recent year)
      </Button>
    </div>
  );
}
