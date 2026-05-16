import { NextResponse } from "next/server";
import { runQuickIndex, runDeepIndex } from "@/lib/indexer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "quick";

  try {
    if (mode === "deep") {
      const r = await runDeepIndex({ recentDays: 365, types: ["private", "group"] });
      return NextResponse.json(r);
    }
    const r = await runQuickIndex();
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
