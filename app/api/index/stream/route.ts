import { runDeepIndex, runQuickIndex, type IndexerProgress } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // better-sqlite3 needs the node runtime

/**
 * Server-Sent-Events-style streaming index endpoint. Long indexing runs
 * (deep / full) used to block the settings page on a single POST that didn't
 * return until everything finished. This route emits one JSON line per
 * progress event so the client can show live status without polling.
 *
 * Wire format: each event is `data: <json>\n\n` (SSE). The client reads the
 * stream via `fetch().body.getReader()` — EventSource doesn't support POST.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "quick";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller already closed (client disconnected); ignore.
          closed = true;
        }
      };
      const onProgress = (p: IndexerProgress) => send(p);

      const startMs = Date.now();
      send({ stage: "start", detail: mode });
      try {
        if (mode === "deep") {
          const r = await runDeepIndex(
            { recentDays: 365, types: ["private", "group"] },
            onProgress,
          );
          send({
            stage: "done",
            detail: `${r.sessionsProcessed} chats in ${(
              (Date.now() - startMs) / 1000
            ).toFixed(1)}s`,
          });
        } else {
          const r = await runQuickIndex(onProgress);
          send({
            stage: "done",
            detail: `${r.sessions} sessions · ${r.contacts} contacts · ${r.links} links in ${(
              r.elapsedMs / 1000
            ).toFixed(1)}s`,
          });
        }
      } catch (err) {
        send({ stage: "error", detail: (err as Error).message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      // Prevent Nginx / other proxies from buffering — even though we're
      // local-only today, keep the deployment-safe default.
      "x-accel-buffering": "no",
    },
  });
}
