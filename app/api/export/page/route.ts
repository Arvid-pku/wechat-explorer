import { NextResponse } from "next/server";

import { getServerLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Generic page-to-HTML exporter. Fetches the rendered page from the same
 * Next process, inlines the linked stylesheets, strips every <script> tag,
 * removes the app shell (sidebar + sticky header) so the export is content-
 * only, and adds a small footer noting where the file came from.
 *
 * Limitation: pages whose charts come from Recharts (e.g. the radial / line
 * panels on /me and the /stats drilldowns) render their SVG client-side, so
 * the corresponding chart slots in the export are empty. Pure-server SVG
 * (year heatmap, sparklines, the recap monthly-bars / hourly-grid, vocab
 * clouds, lucide icons) survives intact. For a fuller export of the year
 * recap there's a hand-crafted `/api/recap/<year>/export` that bypasses this
 * limitation.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path") ?? "/";
  // Allow same-origin paths only; reject anything that tries to break out
  // (would let a caller weaponize this as an SSRF in the rare case the
  // server is exposed beyond localhost).
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return NextResponse.json({ error: "path must be a same-origin route" }, { status: 400 });
  }
  if (rawPath.startsWith("/api/")) {
    return NextResponse.json({ error: "/api/ routes are not exportable" }, { status: 400 });
  }

  const locale = await getServerLocale();
  const tr = (k: Parameters<typeof t>[0]) => t(k, locale);

  const cookieHeader = req.headers.get("cookie") ?? "";
  const target = `${url.origin}${rawPath}`;

  let pageHtml: string;
  try {
    const res = await fetch(target, {
      headers: {
        cookie: cookieHeader,
        accept: "text/html",
        // Picked up by app/layout.tsx → ExportModeProvider so client chart
        // wrappers swap their ResponsiveContainer for a fixed-pixel SVG
        // and the export actually contains chart pixels.
        "x-export-mode": "1",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status} for ${rawPath}` },
        { status: 502 },
      );
    }
    pageHtml = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Fetch failed" },
      { status: 502 },
    );
  }

  const baseOrigin = url.origin;

  // Inline every <link rel="stylesheet" href="..."> into a <style> block.
  // We resolve same-origin hrefs against baseOrigin; absolute hrefs are
  // fetched as-is. Failures fall through (the link stays in place — broken
  // export beats an aborted export).
  const linkRegex = /<link[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/g;
  const cssMatches = [...pageHtml.matchAll(linkRegex)];
  const cssReplacements: { from: string; to: string }[] = [];
  for (const match of cssMatches) {
    const href = match[1];
    const cssUrl = href.startsWith("http") ? href : `${baseOrigin}${href}`;
    try {
      const cssRes = await fetch(cssUrl, { cache: "no-store" });
      if (!cssRes.ok) continue;
      const css = await cssRes.text();
      cssReplacements.push({ from: match[0], to: `<style data-from="${href}">${css}</style>` });
    } catch {
      // best-effort — leave the original <link> behind
    }
  }
  for (const { from, to } of cssReplacements) {
    pageHtml = pageHtml.replace(from, to);
  }

  // Strip every <script> (no hydration, no HMR, no analytics). Also strip
  // preload hints for scripts so the export doesn't 404-spam.
  pageHtml = pageHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  pageHtml = pageHtml.replace(/<script\b[^>]*\/>/gi, "");
  pageHtml = pageHtml.replace(
    /<link[^>]*\brel=["']preload["'][^>]*\bas=["']script["'][^>]*>/gi,
    "",
  );
  pageHtml = pageHtml.replace(
    /<link[^>]*\brel=["']modulepreload["'][^>]*>/gi,
    "",
  );

  // Strip the app shell (sidebar + sticky header) so the export is
  // content-only. Both elements live in app/layout.tsx + components/app-
  // shell.tsx and have stable structure — `<aside>` for the sidebar, a
  // `<header class="sticky …">` for the top bar.
  pageHtml = pageHtml.replace(/<aside\b[\s\S]*?<\/aside>/g, "");
  pageHtml = pageHtml.replace(
    /<header\b[^>]*class="[^"]*\bsticky\b[^"]*"[\s\S]*?<\/header>/g,
    "",
  );

  // React's RSC streaming dumps comments + a "<!--$-->" / "<!--/$-->" boundary
  // marker after the body. We can leave them — they're harmless when the
  // page is rendered without JS.

  // Inject a small footer right before </body>.
  const exportedAt = new Date().toISOString();
  const footer = `
<footer style="margin:48px auto 24px;max-width:980px;padding:16px 24px;color:#737373;font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-top:1px solid #e5e5e5;">
  <p style="margin:0;">${escapeHtml(tr("export.footer"))} · <code style="font-family:ui-monospace,Menlo,monospace;">${escapeHtml(rawPath)}</code> · ${escapeHtml(exportedAt)}</p>
  <p style="margin:6px 0 0;opacity:0.7;">${escapeHtml(tr("export.note"))}</p>
</footer>`;
  pageHtml = pageHtml.replace(/<\/body>/i, `${footer}</body>`);

  // Filename: turn `/contacts/wxid_abc` into `contacts_wxid_abc.html`.
  const safeName =
    rawPath
      .replace(/[?#].*$/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .replace(/[\/\s]+/g, "_")
      .replace(/[^A-Za-z0-9_\-.]/g, "_") || "overview";
  const filename = `${safeName}.html`;

  return new Response(pageHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
