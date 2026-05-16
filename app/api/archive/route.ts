import { NextResponse } from "next/server";
import { archiveSessions, restoreSessions } from "@/lib/queries";
import { bumpArchiveEpoch } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { action?: "archive" | "restore"; usernames?: string[]; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { action, usernames, reason } = body;
  if (!Array.isArray(usernames) || usernames.length === 0) {
    return NextResponse.json({ error: "usernames must be a non-empty array" }, { status: 400 });
  }
  if (action !== "archive" && action !== "restore") {
    return NextResponse.json({ error: "action must be 'archive' or 'restore'" }, { status: 400 });
  }
  const n =
    action === "archive"
      ? archiveSessions(usernames, reason ?? "manual")
      : restoreSessions(usernames);
  // Bump the archive epoch so every cached aggregate that respected
  // EXCLUDED_SUBQUERY (overview, me-stats, recap, year keywords…) is
  // recomputed on its next read.
  if (n > 0) bumpArchiveEpoch();
  return NextResponse.json({ changed: n });
}
