import { NextResponse } from "next/server";
import { searchMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type") ?? undefined;
  const chat = searchParams.get("chat") ?? undefined;
  const limit = Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10));

  if (!q) return NextResponse.json({ results: [] });

  let ftsQuery = q;
  if (!/[\s"]/.test(q) && q.length > 0) {
    ftsQuery = `"${q.replace(/"/g, '""')}"`;
  }

  try {
    const results = searchMessages(ftsQuery, { type, chat, limit });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, results: [] },
      { status: 400 },
    );
  }
}
