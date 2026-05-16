import { NextResponse } from "next/server";
import {
  detectMeHandles,
  getMeHandles,
  setMeHandles,
  backfillMyMsgCount,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const { rankings } = detectMeHandles();
  const handles = getMeHandles();
  return NextResponse.json({ handles, rankings });
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
    const r = backfillMyMsgCount(detected);
    return NextResponse.json({ handles: r.handles, rowsUpdated: r.rowsUpdated });
  }

  if (!Array.isArray(body.handles)) {
    return NextResponse.json({ error: "handles must be an array" }, { status: 400 });
  }
  setMeHandles(body.handles);
  const r = backfillMyMsgCount(body.handles);
  return NextResponse.json({ handles: r.handles, rowsUpdated: r.rowsUpdated });
}
