import { NextResponse } from "next/server";
import { getYearRecap } from "@/lib/recap";
import { renderRecapHtml } from "@/lib/recap-html";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const { year: yStr } = await params;
  const year = parseInt(yStr, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return new NextResponse("invalid year", { status: 400 });
  }
  const url = new URL(request.url);
  const chat = url.searchParams.get("chat");

  const recap = getYearRecap(year, chat);
  const html = renderRecapHtml(recap);

  const subject = chat ? `${(recap.scopeDisplay ?? chat).slice(0, 40)}` : "all";
  const safe = subject.replace(/[^A-Za-z0-9_\-一-龥]+/g, "_");
  const filename = `recap-${year}-${safe}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
