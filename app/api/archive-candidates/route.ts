import { NextResponse } from "next/server";
import { listArchiveCandidates } from "@/lib/queries";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["private", "group", "official", "folded"]);
const VALID_TYPE_PRESETS = new Set(["group", "private+group", "all"]);

/**
 * Lazy preset loader for the Settings → Chat hygiene panel. Replaces the
 * settings page's old eager 30-combination cross-product (which made cold
 * load ~7.5s). The panel now ships with only the default preset; other
 * presets fetch from here on demand.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const staleParam = url.searchParams.get("stale");
  const stale = Math.max(0, Number(staleParam ?? "0"));
  // `type=private+group` arrives as "private group" because `+` decodes to
  // space in URLSearchParams. Normalise both forms back to the canonical key.
  const typeKey = (url.searchParams.get("type") ?? "group").replace(/ /g, "+");
  const oneSided = url.searchParams.get("oneSided") === "1";

  if (!VALID_TYPE_PRESETS.has(typeKey)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  const types =
    typeKey === "group"
      ? (["group"] as ("private" | "group" | "official")[])
      : typeKey === "private+group"
        ? (["private", "group"] as ("private" | "group" | "official")[])
        : (["private", "group", "official"] as ("private" | "group" | "official")[]);
  for (const t of types) {
    if (!VALID_TYPES.has(t)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }
  }

  const rows = listArchiveCandidates({
    staleDays: stale,
    types,
    onlyOneSided: oneSided,
  });
  return NextResponse.json({ rows });
}
