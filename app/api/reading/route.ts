import { NextResponse } from "next/server";
import { markUrlRead, markUrlUnread } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { urlId?: unknown; read?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { urlId, read } = body;
  if (typeof urlId !== "number" || !Number.isInteger(urlId) || urlId <= 0) {
    return NextResponse.json({ error: "urlId must be a positive integer" }, { status: 400 });
  }
  if (typeof read !== "boolean") {
    return NextResponse.json({ error: "read must be a boolean" }, { status: 400 });
  }
  try {
    if (read) markUrlRead(urlId);
    else markUrlUnread(urlId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Server error" },
      { status: 500 },
    );
  }
}
