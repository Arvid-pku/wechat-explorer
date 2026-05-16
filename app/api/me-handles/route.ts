import { NextResponse } from "next/server";
import {
  detectMeHandles,
  getMeHandles,
  setMeHandles,
  backfillMyMsgCount,
  refreshDailyCounts,
} from "@/lib/queries";
import { bumpArchiveEpoch } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const { rankings } = detectMeHandles();
  const handles = getMeHandles();
  return NextResponse.json({ handles, rankings });
}

/**
 * Side effects on a successful handle change:
 *   1. backfillMyMsgCount: recomputes the per-session `my_msg_count`.
 *   2. refreshDailyCounts: regenerates the daily rollup whose `mine` column
 *      is computed under the previous me-handles set. Without this the
 *      overview's mine totals stay frozen until the next indexer run.
 *   3. bumpArchiveEpoch: every cached aggregate that reads me-handles
 *      (recap, me-stats, etc) recomputes on its next request.
 */
function applyHandleSideEffects(handles: string[]) {
  const r = backfillMyMsgCount(handles);
  refreshDailyCounts();
  bumpArchiveEpoch();
  return r;
}

export async function POST(request: Request) {
  let body: { handles?: string[]; action?: "redetect" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "redetect") {
    const { handles: detected } = detectMeHandles();
    setMeHandles(detected);
    const r = applyHandleSideEffects(detected);
    return NextResponse.json({ handles: r.handles, rowsUpdated: r.rowsUpdated });
  }

  if (!Array.isArray(body.handles)) {
    return NextResponse.json({ error: "handles must be an array" }, { status: 400 });
  }
  setMeHandles(body.handles);
  const r = applyHandleSideEffects(body.handles);
  return NextResponse.json({ handles: r.handles, rowsUpdated: r.rowsUpdated });
}
