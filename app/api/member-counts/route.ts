import { NextResponse } from "next/server";
import { listGroupsNeedingMemberCount, setMemberCount } from "@/lib/queries";
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
  const pending = listGroupsNeedingMemberCount();
  const batch = pending.slice(0, limit);
  const results: { username: string; display_name: string; count?: number; error?: string }[] = [];

  for (const g of batch) {
    try {
      const members = await getMembers(g.display_name);
      setMemberCount(g.username, members.length);
      results.push({ username: g.username, display_name: g.display_name, count: members.length });
    } catch (err) {
      results.push({ username: g.username, display_name: g.display_name, error: (err as Error).message });
    }
  }
  const remaining = listGroupsNeedingMemberCount().length;
  const total = pending.length;
  return NextResponse.json({ processed: results.length, results, remaining, total });
}

export async function GET() {
  const pending = listGroupsNeedingMemberCount();
  return NextResponse.json({ pending: pending.length });
}
