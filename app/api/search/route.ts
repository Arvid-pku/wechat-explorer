import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { searchMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type") ?? undefined;
  // `chat` carries either a session username (canonical) or — for older URLs —
  // a display name. Resolve to username when possible so duplicates don't
  // bleed into the result set.
  const chatParam = searchParams.get("chat") ?? undefined;
  let chatUsername: string | undefined;
  let chat: string | undefined;
  if (chatParam) {
    const row = getDb()
      .prepare(`SELECT username FROM sessions WHERE username = ?`)
      .get(chatParam) as { username: string } | undefined;
    if (row) chatUsername = row.username;
    else chat = chatParam;
  }
  const includeArchived = searchParams.get("archived") === "1";
  const limit = Math.min(200, Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50);

  if (!q) return NextResponse.json({ results: [] });

  try {
    const results = searchMessages(q, {
      type,
      chat,
      chatUsername,
      limit,
      includeArchived,
    });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, results: [] },
      { status: 400 },
    );
  }
}
