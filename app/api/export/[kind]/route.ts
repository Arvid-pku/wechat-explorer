import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { EXCLUDED_SUBQUERY } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface RowLike {
  [key: string]: string | number | null | undefined;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: RowLike[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const header = cols.map(csvCell).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

/**
 * Lightweight typed-data exports. Pass ?format=csv|json (default csv) and
 * optional filter params per kind.
 *
 * - `sessions` → one row per active session (after exclusion).
 * - `links` → all links, optionally filtered to `?group=`.
 * - `messages` → up to ?limit=10000 (default 1000) messages matching ?chat=.
 * - `contacts` → address-book entries.
 *
 * Designed for ad-hoc analysis with pandas / Excel / jq.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const db = getDb();

  let rows: RowLike[] = [];
  let filename = `${kind}.${format}`;

  switch (kind) {
    case "sessions": {
      rows = db
        .prepare(
          `SELECT s.username, s.display_name, s.chat_type, s.last_timestamp,
                  s.message_count, s.my_msg_count, s.distinct_senders,
                  s.member_count, s.first_msg_timestamp, s.history_indexed_through, s.archived
           FROM sessions s
           ORDER BY s.last_timestamp DESC NULLS LAST`,
        )
        .all() as RowLike[];
      break;
    }
    case "links": {
      const group = url.searchParams.get("group");
      const limit = Math.min(50_000, Number(url.searchParams.get("limit") ?? 5000));
      const filters: string[] = [`chat_username NOT IN ${EXCLUDED_SUBQUERY}`];
      const args: (string | number)[] = [];
      if (group) {
        filters.push("domain_group = ?");
        args.push(group);
      }
      rows = db
        .prepare(
          `SELECT id, url, domain, domain_group, chat_display, sender, timestamp, preview
           FROM urls_dedup
           WHERE ${filters.join(" AND ")}
           ORDER BY timestamp DESC
           LIMIT ?`,
        )
        .all(...args, limit) as RowLike[];
      if (group) filename = `links_${group}.${format}`;
      break;
    }
    case "messages": {
      const chat = url.searchParams.get("chat");
      if (!chat) {
        return new NextResponse("missing ?chat=<username>", { status: 400 });
      }
      const limit = Math.min(50_000, Number(url.searchParams.get("limit") ?? 1000));
      rows = db
        .prepare(
          `SELECT id, chat_username, chat_display, sender, msg_type, timestamp, content
           FROM messages
           WHERE chat_username = ?
           ORDER BY timestamp DESC
           LIMIT ?`,
        )
        .all(chat, limit) as RowLike[];
      filename = `messages_${chat}.${format}`;
      break;
    }
    case "contacts": {
      rows = db
        .prepare(`SELECT username, display_name FROM contacts ORDER BY display_name`)
        .all() as RowLike[];
      break;
    }
    case "domains": {
      rows = db
        .prepare(
          `SELECT domain_group, domain, COUNT(*) AS n, MAX(timestamp) AS latest_ts
           FROM urls_dedup
           WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
           GROUP BY domain_group, domain
           ORDER BY n DESC`,
        )
        .all() as RowLike[];
      break;
    }
    default:
      return new NextResponse(`unknown kind: ${kind}`, { status: 400 });
  }

  let body: string;
  let contentType: string;
  if (format === "json") {
    body = JSON.stringify(rows, null, 2);
    contentType = "application/json; charset=utf-8";
  } else {
    body = toCsv(rows);
    contentType = "text/csv; charset=utf-8";
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
