import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { ONBOARDING_ACTIONS } from "@/lib/onboarding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream the output of a fixed onboarding action as SSE so the UI can show
 * progress in real time. `action` must be a key from ONBOARDING_ACTIONS —
 * the caller never composes the command string.
 *
 * `requiresSudo: true` actions are wrapped with
 *   osascript -e 'do shell script "..." with administrator privileges'
 * which triggers the standard macOS password dialog. The OS handles auth.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "";
  const spec = ONBOARDING_ACTIONS[action];
  if (!spec) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Build the actual command. For sudo actions we wrap in osascript so the
  // privileged step shows the system dialog instead of needing a terminal.
  let cmd: string;
  let args: string[];
  if (spec.requiresSudo) {
    // Escape any embedded quotes in the AppleScript string literal.
    const escaped = spec.shell.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    cmd = "osascript";
    args = [
      "-e",
      `do shell script "${escaped}" with administrator privileges`,
    ];
  } else {
    cmd = "/bin/sh";
    args = ["-c", spec.shell];
  }

  // Extend PATH so Homebrew binaries are reachable when launched from a
  // double-clicked .app (Finder starts processes with a minimal PATH).
  const env = {
    ...process.env,
    PATH: [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      process.env.PATH ?? "",
    ]
      .filter(Boolean)
      .join(":"),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({ stage: "start", action, description: spec.description });

      const proc = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
      proc.stdout.on("data", (d) => send({ stage: "stdout", chunk: d.toString() }));
      proc.stderr.on("data", (d) => send({ stage: "stderr", chunk: d.toString() }));
      proc.on("error", (err) => {
        send({ stage: "error", message: err.message });
        closed = true;
        controller.close();
      });
      proc.on("exit", (code, signal) => {
        send({
          stage: "done",
          code,
          signal,
          // osascript exits 1 with "User cancelled" / "User canceled" if the
          // user dismisses the password dialog; surface that politely.
          userCancelled:
            spec.requiresSudo &&
            code !== 0,
        });
        closed = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
