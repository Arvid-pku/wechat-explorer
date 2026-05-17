import { NextResponse } from "next/server";
import { detectOnboardingState } from "@/lib/onboarding";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const base = detectOnboardingState();
  // Add the "have you indexed anything yet?" signal so the UI can transition
  // from setup → first-index → ready in one place.
  let indexed = false;
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM messages")
      .get() as { n: number };
    indexed = row.n > 0;
  } catch {
    // Pre-migration / empty DB — treat as not indexed.
  }
  return NextResponse.json({ ...base, indexed });
}
