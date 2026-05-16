"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Progress {
  stage: string;
  detail?: string;
  current?: number;
  total?: number;
}

export function ReindexButtons() {
  const router = useRouter();
  const [running, setRunning] = useState<"quick" | "deep" | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function trigger(mode: "quick" | "deep") {
    setRunning(mode);
    setProgress(null);
    const tid = toast.loading(`${mode === "quick" ? "Quick" : "Deep"} index starting…`);
    let lastDetail = "";
    try {
      const res = await fetch(`/api/index/stream?mode=${mode}`, { method: "POST" });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim()) as Progress;
            setProgress(payload);
            const label = payload.detail || payload.stage;
            if (label) lastDetail = label;
            if (payload.stage === "done") {
              toast.success(payload.detail ?? "Done.", { id: tid });
            } else if (payload.stage === "error") {
              toast.error(payload.detail ?? "Index failed", { id: tid });
            } else {
              const counter =
                payload.current && payload.total
                  ? ` (${payload.current}/${payload.total})`
                  : "";
              toast.loading(`${payload.stage}${counter}${payload.detail ? ` · ${payload.detail}` : ""}`, {
                id: tid,
              });
            }
          } catch {
            // ignore malformed frames
          }
        }
      }
      router.refresh();
    } catch (err) {
      toast.error(`${(err as Error).message}${lastDetail ? ` (last stage: ${lastDetail})` : ""}`, {
        id: tid,
      });
    } finally {
      setRunning(null);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
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
      {progress && (
        <div className="text-xs text-muted-foreground tabular-nums">
          <span className="font-mono">{progress.stage}</span>
          {progress.current != null && progress.total != null && (
            <span className="ml-2">
              {progress.current}/{progress.total}
            </span>
          )}
          {progress.detail && (
            <span className="ml-2 truncate inline-block max-w-[60ch] align-middle">
              {progress.detail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
