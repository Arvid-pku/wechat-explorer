import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listGroupsNeedingMembers, setMemberCount, upsertGroupMembers } from "@/lib/queries";
import { getMembers } from "@/lib/wx";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { limit?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const limit = Math.min(10, Math.max(1, body.limit ?? 5));
  const pending = listGroupsNeedingMembers();
  const batch = pending.slice(0, limit);
  const results: {
    username: string;
    display_name: string;
    count?: number;
    error?: string;
  }[] = [];

  for (const g of batch) {
    try {
      const members = await getMembers(g.display_name);
      setMemberCount(g.username, members.length);
      upsertGroupMembers(g.username, members);
      results.push({
        username: g.username,
        display_name: g.display_name,
        count: members.length,
      });
    } catch (err) {
      results.push({
        username: g.username,
        display_name: g.display_name,
        error: (err as Error).message,
      });
    }
  }
  const remaining = listGroupsNeedingMembers().length;
  const total = pending.length;
  return NextResponse.json({ processed: results.length, results, remaining, total });
}

export async function GET() {
  const db = getDb();
  const pendingCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions
         WHERE chat_type = 'group' AND archived = 0 AND member_count IS NULL`,
      )
      .get() as { n: number }
  ).n;
  const pendingMembers = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions s
         WHERE s.chat_type = 'group'
           AND s.archived = 0
           AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_username = s.username)`,
      )
      .get() as { n: number }
  ).n;
  const totalGroups = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions WHERE chat_type = 'group' AND archived = 0`,
      )
      .get() as { n: number }
  ).n;
  const memberships = (
    db.prepare(`SELECT COUNT(*) AS n FROM group_members`).get() as { n: number }
  ).n;

  // Backwards compat: existing settings UI reads `pending` (= groups without member_count).
  return NextResponse.json({
    pending: pendingCount,
    pending_count: pendingCount,
    pending_members: pendingMembers,
    total_groups: totalGroups,
    memberships,
  });
}
