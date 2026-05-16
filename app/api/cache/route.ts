import { NextResponse } from "next/server";
import { clearAllCaches, clearCacheByPrefix, getCacheStats } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCacheStats());
}

/**
 * Drop cached rows. Pass `?prefix=<key-prefix>` to scope (e.g. `recap:`,
 * `me-stats:`); omit to drop everything.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix");
  const result = prefix
    ? clearCacheByPrefix(prefix)
    : clearAllCaches();
  return NextResponse.json(result);
}
