import { getDb, getMeta, setMeta } from "./db";

/**
 * Globally-excluded sessions for stats / search / links: archived OR
 * official-account OR folded. Use this in queries that should reflect the
 * user's *active personal* chat history. Reading and the contact-type tabs
 * intentionally bypass this exclusion to remain navigable.
 */
export const EXCLUDED_SUBQUERY = `(SELECT username FROM sessions WHERE archived = 1 OR chat_type IN ('official','folded'))`;

const ME_HANDLES_KEY = "me_handles";
const ME_BACKFILLED_AT_KEY = "my_msg_count_backfilled_at";

export function detectMeHandles(): { handles: string[]; rankings: { sender: string; distinct_chats: number; msgs: number }[] } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT sender, COUNT(DISTINCT chat_username) AS distinct_chats, COUNT(*) AS msgs
    FROM messages
    WHERE chat_username IS NOT NULL
    GROUP BY sender
    ORDER BY distinct_chats DESC
    LIMIT 5
  `).all() as { sender: string; distinct_chats: number; msgs: number }[];

  if (rows.length === 0) return { handles: [], rankings: [] };
  const top = rows[0].distinct_chats;
  // pick senders whose distinct_chats >= 40% of the top (captures the user's main + alias handles)
  const handles = rows.filter((r) => r.distinct_chats >= top * 0.4 && r.distinct_chats >= 20).map((r) => r.sender);
  return { handles, rankings: rows };
}

export function getMeHandles(): string[] {
  const v = getMeta(ME_HANDLES_KEY);
  if (v) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

export function setMeHandles(handles: string[]) {
  setMeta(ME_HANDLES_KEY, JSON.stringify(handles));
}

export function getMeBackfilledAt(): number | null {
  const v = getMeta(ME_BACKFILLED_AT_KEY);
  return v ? Number(v) : null;
}

export function backfillMyMsgCount(handles?: string[]): { rowsUpdated: number; handles: string[] } {
  const db = getDb();
  const h = handles ?? getMeHandles();
  if (h.length === 0) {
    db.exec(`UPDATE sessions SET my_msg_count = 0`);
    setMeta(ME_BACKFILLED_AT_KEY, String(Date.now()));
    return { rowsUpdated: 0, handles: [] };
  }
  const placeholders = h.map(() => "?").join(",");
  const result = db.prepare(`
    UPDATE sessions
    SET my_msg_count = COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_username = sessions.username
        AND m.sender IN (${placeholders})
    ), 0)
  `).run(...h);
  setMeta(ME_BACKFILLED_AT_KEY, String(Date.now()));
  return { rowsUpdated: result.changes, handles: h };
}

export function ensureMeDetected(): { handles: string[]; ranTime: number | null } {
  let handles = getMeHandles();
  let ranTime: number | null = null;
  if (handles.length === 0) {
    const { handles: detected } = detectMeHandles();
    if (detected.length > 0) {
      setMeHandles(detected);
      backfillMyMsgCount(detected);
      handles = detected;
      ranTime = Date.now();
    }
  } else if (getMeBackfilledAt() === null) {
    backfillMyMsgCount(handles);
    ranTime = Date.now();
  }
  return { handles, ranTime };
}

export function backfillDistinctSenders(): { rowsUpdated: number } {
  const db = getDb();
  const result = db.prepare(`
    UPDATE sessions
    SET distinct_senders = COALESCE((
      SELECT COUNT(DISTINCT sender) FROM messages m
      WHERE m.chat_username = sessions.username AND m.sender != ''
    ), 0)
  `).run();
  setMeta("distinct_senders_backfilled_at", String(Date.now()));
  return { rowsUpdated: result.changes };
}

export function ensureDistinctSendersBackfilled() {
  const v = getMeta("distinct_senders_backfilled_at");
  if (!v) return backfillDistinctSenders();
  return null;
}

export interface GroupSizeRow {
  username: string;
  display_name: string;
  member_count: number | null;
  member_count_at: number | null;
  distinct_senders: number;
}

export function listGroupsNeedingMemberCount(): { username: string; display_name: string }[] {
  const db = getDb();
  return db.prepare(`
    SELECT username, display_name FROM sessions
    WHERE chat_type = 'group' AND archived = 0 AND member_count IS NULL
    ORDER BY last_timestamp DESC NULLS LAST
  `).all() as { username: string; display_name: string }[];
}

export function setMemberCount(username: string, count: number) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET member_count = ?, member_count_at = ? WHERE username = ?`).run(
    count,
    Date.now(),
    username,
  );
}

/**
 * Active (non-archived) groups whose membership has not been recorded yet — either
 * because `member_count` is NULL or there are zero rows in `group_members` for them.
 * Used by the batch backfill endpoint.
 */
export function listGroupsNeedingMembers(): { username: string; display_name: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.username, s.display_name
       FROM sessions s
       WHERE s.chat_type = 'group'
         AND s.archived = 0
         AND (
           s.member_count IS NULL
           OR NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_username = s.username)
         )
       ORDER BY s.last_timestamp DESC NULLS LAST`,
    )
    .all() as { username: string; display_name: string }[];
}

export interface RawMemberLike {
  username: string;
  display: string;
  contact_display?: string;
  group_nickname?: string;
  is_owner?: boolean;
}

/**
 * Insert (or refresh) all members for a group. Idempotent — uses INSERT OR REPLACE
 * so a re-fetch updates display name / owner flag without duplicating rows.
 */
export function upsertGroupMembers(groupUsername: string, members: RawMemberLike[]) {
  if (members.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO group_members
       (group_username, member_username, member_display, group_nickname, is_owner, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_username, member_username) DO UPDATE SET
       member_display = excluded.member_display,
       group_nickname = excluded.group_nickname,
       is_owner = excluded.is_owner,
       indexed_at = excluded.indexed_at`,
  );
  const now = Date.now();
  let n = 0;
  const tx = db.transaction(() => {
    for (const m of members) {
      if (!m.username) continue;
      const display = m.contact_display || m.display || null;
      const nickname = m.group_nickname || null;
      const owner = m.is_owner ? 1 : 0;
      const r = stmt.run(groupUsername, m.username, display, nickname, owner, now);
      n += r.changes;
    }
  });
  tx();
  return n;
}

export interface Overview {
  sessions: { total: number; private: number; group: number; official: number; folded: number };
  messages: { total: number; last7d: number; last30d: number; last365d: number };
  urls: { total: number; uniqueDomains: number };
  contacts: number;
  archived: number;
  topDomains: { domain_group: string; n: number }[];
  msgTypes: { msg_type: string; n: number }[];
  activityByDay: { day: string; n: number }[];
  lastIndexedAt: string | null;
}

export function getOverview(): Overview {
  const db = getDb();
  const sessions = db.prepare(`SELECT chat_type, archived, COUNT(*) AS n FROM sessions GROUP BY chat_type, archived`).all() as { chat_type: string; archived: number; n: number }[];
  const sessionsByType: Record<string, number> = {};
  let archived = 0;
  for (const r of sessions) {
    if (r.archived === 1) archived += r.n;
    else sessionsByType[r.chat_type] = (sessionsByType[r.chat_type] ?? 0) + r.n;
  }
  const totalSessions = Object.values(sessionsByType).reduce((a, b) => a + b, 0);

  const nowSec = Math.floor(Date.now() / 1000);

  const msgAgg = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) AS last7d,
      SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) AS last30d,
      SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) AS last365d
    FROM messages
    WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
  `).get(
    nowSec - 7 * 86400,
    nowSec - 30 * 86400,
    nowSec - 365 * 86400,
  ) as { total: number; last7d: number; last30d: number; last365d: number };

  const urlAgg = db.prepare(`
    SELECT COUNT(*) AS total, COUNT(DISTINCT domain) AS uniqueDomains
    FROM urls_dedup
    WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
  `).get() as { total: number; uniqueDomains: number };

  const contacts = (db.prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }).n;

  const topDomains = db.prepare(`
    SELECT domain_group, COUNT(*) AS n FROM urls_dedup
    WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
    GROUP BY domain_group ORDER BY n DESC LIMIT 12
  `).all() as { domain_group: string; n: number }[];

  const msgTypes = db.prepare(`
    SELECT msg_type, COUNT(*) AS n FROM messages
    WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
    GROUP BY msg_type ORDER BY n DESC LIMIT 10
  `).all() as { msg_type: string; n: number }[];

  const activityByDay = db.prepare(`
    SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
    FROM messages
    WHERE timestamp >= ?
      AND chat_username NOT IN ${EXCLUDED_SUBQUERY}
    GROUP BY day
    ORDER BY day
  `).all(nowSec - 365 * 86400) as { day: string; n: number }[];

  const lastIndexedAt = (db.prepare(`SELECT value FROM meta WHERE key = 'last_quick_index_at'`).get() as { value: string } | undefined)?.value ?? null;

  return {
    sessions: {
      total: totalSessions,
      private: sessionsByType.private ?? 0,
      group: sessionsByType.group ?? 0,
      official: sessionsByType.official ?? 0,
      folded: sessionsByType.folded ?? 0,
    },
    messages: { total: msgAgg.total, last7d: msgAgg.last7d, last30d: msgAgg.last30d, last365d: msgAgg.last365d },
    urls: { total: urlAgg.total, uniqueDomains: urlAgg.uniqueDomains },
    contacts,
    archived,
    topDomains,
    msgTypes,
    activityByDay,
    lastIndexedAt,
  };
}

export interface ContactRow {
  username: string;
  display_name: string;
  chat_type: string;
  is_group: number;
  last_timestamp: number | null;
  message_count: number;
  url_count: number;
  unread: number;
  archived: number;
}

export function listSessions(opts: { type?: string; sort?: string; limit?: number; q?: string; includeArchived?: boolean; onlyArchived?: boolean } = {}): ContactRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (opts.onlyArchived) {
    conditions.push("s.archived = 1");
  } else if (!opts.includeArchived) {
    conditions.push("s.archived = 0");
  }
  if (opts.type && opts.type !== "all") {
    conditions.push("s.chat_type = ?");
    params.push(opts.type);
  }
  if (opts.q) {
    conditions.push("s.display_name LIKE ?");
    params.push(`%${opts.q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderBy = (() => {
    switch (opts.sort) {
      case "messages": return "ORDER BY message_count DESC";
      case "urls": return "ORDER BY url_count DESC";
      case "name": return "ORDER BY s.display_name ASC";
      case "recent":
      default: return "ORDER BY s.last_timestamp DESC NULLS LAST";
    }
  })();

  params.push(opts.limit ?? 100);

  return db.prepare(`
    WITH url_counts AS (
      SELECT chat_username, COUNT(*) AS n FROM urls_dedup WHERE chat_username IS NOT NULL GROUP BY chat_username
    )
    SELECT
      s.username, s.display_name, s.chat_type, s.is_group, s.last_timestamp, s.unread, s.archived,
      COALESCE(s.message_count, 0) AS message_count,
      COALESCE((SELECT n FROM url_counts WHERE chat_username = s.username), 0) AS url_count
    FROM sessions s
    ${where}
    ${orderBy}
    LIMIT ?
  `).all(...params) as ContactRow[];
}

export function getSessionByUsername(username: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM sessions WHERE username = ?`).get(username);
}

/**
 * Read-side URL queries use the `urls_dedup` view (defined in `lib/db.ts`)
 * because the same conceptual shared link can be ingested twice via two
 * indexer paths (`wx search --type link` for bulk + per-chat `wx history`).
 * The two passes can produce different `messages.content_hash` values, so
 * the URL row's unique index on (content_hash, url) doesn't dedupe. The
 * view collapses (url, ts, sender, chat) → one row.
 */
export function getLinkGroups(): { domain_group: string; n: number; latest_ts: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT domain_group, COUNT(*) AS n, MAX(timestamp) AS latest_ts
    FROM urls_dedup
    WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
    GROUP BY domain_group
    ORDER BY n DESC
  `).all() as { domain_group: string; n: number; latest_ts: number }[];
}

export function getLinksInGroup(group: string, opts: { limit?: number; offset?: number; sender?: string; chat?: string; q?: string } = {}) {
  const db = getDb();
  const conditions = [`domain_group = ?`, `chat_username NOT IN ${EXCLUDED_SUBQUERY}`];
  const params: (string | number)[] = [group];
  if (opts.sender) {
    conditions.push("sender = ?");
    params.push(opts.sender);
  }
  if (opts.chat) {
    conditions.push("chat_display = ?");
    params.push(opts.chat);
  }
  if (opts.q) {
    conditions.push("(url LIKE ? OR preview LIKE ?)");
    params.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  params.push(opts.limit ?? 50);
  params.push(opts.offset ?? 0);
  return db.prepare(`
    SELECT id, url, domain, domain_group, chat_display, sender, timestamp, preview
    FROM urls_dedup
    WHERE ${conditions.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...params) as {
    id: number;
    url: string;
    domain: string;
    domain_group: string;
    chat_display: string;
    sender: string;
    timestamp: number;
    preview: string;
  }[];
}

export function getLinkGroupFacets(group: string): { senders: { sender: string; n: number }[]; chats: { chat_display: string; n: number }[] } {
  const db = getDb();
  const senders = db.prepare(
    `SELECT sender, COUNT(*) AS n FROM urls_dedup
     WHERE domain_group = ? AND sender != '' AND chat_username NOT IN ${EXCLUDED_SUBQUERY}
     GROUP BY sender ORDER BY n DESC LIMIT 30`,
  ).all(group) as { sender: string; n: number }[];
  const chats = db.prepare(
    `SELECT chat_display, COUNT(*) AS n FROM urls_dedup
     WHERE domain_group = ? AND chat_username NOT IN ${EXCLUDED_SUBQUERY}
     GROUP BY chat_display ORDER BY n DESC LIMIT 30`,
  ).all(group) as { chat_display: string; n: number }[];
  return { senders, chats };
}

export function searchMessages(q: string, opts: { limit?: number; type?: string; chat?: string } = {}) {
  const db = getDb();
  const trimmed = q.trim();
  if (!trimmed) return [];

  const limit = opts.limit ?? 100;
  const typeFilter = opts.type ? " AND m.msg_type = ?" : "";
  const chatFilter = opts.chat ? " AND m.chat_display = ?" : "";
  const extraParams: (string | number)[] = [];
  if (opts.type) extraParams.push(opts.type);
  if (opts.chat) extraParams.push(opts.chat);

  type Row = {
    id: number;
    chat_username: string | null;
    chat_display: string;
    sender: string;
    msg_type: string;
    content: string;
    timestamp: number;
    snippet: string;
  };

  // Strip any wrapping double-quotes a caller added for FTS phrase syntax,
  // so the length check sees the actual user input.
  const bare =
    trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1).replace(/""/g, '"')
      : trimmed;

  // SQLite FTS5's trigram tokenizer needs >= 3 characters per token, so any
  // query shorter than 3 chars (very common for CJK) returns 0 matches.
  // Fall back to plain LIKE in that case. Slower (full scan) but correct.
  if (bare.length < 3) {
    const like = `%${bare.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const rows = db
      .prepare(
        `SELECT m.id, m.chat_username, m.chat_display, m.sender, m.msg_type, m.content, m.timestamp
         FROM messages m
         WHERE m.content LIKE ? ESCAPE '\\'
           AND m.chat_username NOT IN ${EXCLUDED_SUBQUERY}
           ${typeFilter}${chatFilter}
         ORDER BY m.timestamp DESC
         LIMIT ?`,
      )
      .all(like, ...extraParams, limit) as Omit<Row, "snippet">[];
    // Build a basic snippet ourselves: highlight the first occurrence.
    return rows.map<Row>((r) => {
      const idx = r.content.toLowerCase().indexOf(bare.toLowerCase());
      const lead = Math.max(0, idx - 24);
      const tail = Math.min(r.content.length, idx + bare.length + 24);
      const before = (lead > 0 ? "…" : "") + escapeHtml(r.content.slice(lead, idx));
      const match = `<mark>${escapeHtml(r.content.slice(idx, idx + bare.length))}</mark>`;
      const after = escapeHtml(r.content.slice(idx + bare.length, tail)) + (tail < r.content.length ? "…" : "");
      return { ...r, snippet: idx >= 0 ? before + match + after : escapeHtml(r.content.slice(0, 80)) };
    });
  }

  const params: (string | number)[] = [trimmed, ...extraParams, limit];
  return db
    .prepare(
      `SELECT m.id, m.chat_username, m.chat_display, m.sender, m.msg_type, m.content, m.timestamp,
              snippet(messages_fts, 0, '<mark>', '</mark>', '…', 12) AS snippet
       FROM messages_fts
       JOIN messages m ON m.id = messages_fts.rowid
       WHERE messages_fts MATCH ?
         AND m.chat_username NOT IN ${EXCLUDED_SUBQUERY}
         ${typeFilter}${chatFilter}
       ORDER BY m.timestamp DESC
       LIMIT ?`,
    )
    .all(...params) as Row[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getHeatmap(year: number): { day: string; n: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
    FROM messages
    WHERE strftime('%Y', timestamp, 'unixepoch', 'localtime') = ?
      AND chat_username NOT IN ${EXCLUDED_SUBQUERY}
    GROUP BY day
    ORDER BY day
  `).all(String(year)) as { day: string; n: number }[];
}

export function getSessionDetail(username: string) {
  const db = getDb();
  const session = db.prepare(`SELECT * FROM sessions WHERE username = ?`).get(username);
  if (!session) return null;
  const recent = db.prepare(`SELECT id, sender, msg_type, content, timestamp FROM messages WHERE chat_username = ? ORDER BY timestamp DESC LIMIT 100`).all(username);
  const links = db.prepare(`SELECT id, url, domain, domain_group, sender, timestamp, preview FROM urls_dedup WHERE chat_username = ? ORDER BY timestamp DESC LIMIT 100`).all(username);
  const senderBreakdown = db.prepare(`SELECT sender, COUNT(*) AS n FROM messages WHERE chat_username = ? GROUP BY sender ORDER BY n DESC LIMIT 20`).all(username);
  const stats = db.prepare(`SELECT COUNT(*) AS messages, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts FROM messages WHERE chat_username = ?`).get(username);
  const linkGroups = db.prepare(`SELECT domain_group, COUNT(*) AS n FROM urls_dedup WHERE chat_username = ? GROUP BY domain_group ORDER BY n DESC LIMIT 10`).all(username);
  return { session, recent, links, senderBreakdown, stats, linkGroups };
}

export interface ArchiveCandidate {
  username: string;
  display_name: string;
  chat_type: string;
  last_timestamp: number | null;
  unread: number;
  message_count: number;
  url_count: number;
  archived: number;
  my_msg_count: number;
  distinct_senders: number;
  member_count: number | null;
}

export function listArchiveCandidates(opts: { staleDays?: number; types?: string[]; onlyOneSided?: boolean } = {}): ArchiveCandidate[] {
  const db = getDb();
  const nowSec = Math.floor(Date.now() / 1000);
  const staleDays = opts.staleDays ?? 90;
  const types = opts.types ?? ["private", "group", "official"];
  const placeholders = types.map(() => "?").join(",");

  const conditions: string[] = ["s.archived = 0", `s.chat_type IN (${placeholders})`];
  const params: (string | number)[] = [...types];

  if (staleDays > 0) {
    conditions.push("(s.last_timestamp IS NULL OR s.last_timestamp < ?)");
    params.push(nowSec - staleDays * 86400);
  }
  if (opts.onlyOneSided) {
    conditions.push(
      "s.history_indexed_through IS NOT NULL",
      "COALESCE(s.message_count, 0) > 0",
      "s.my_msg_count = 0",
    );
  }

  return db.prepare(`
    WITH url_counts AS (
      SELECT chat_username, COUNT(*) AS n FROM urls_dedup WHERE chat_username IS NOT NULL GROUP BY chat_username
    )
    SELECT
      s.username, s.display_name, s.chat_type, s.last_timestamp, s.unread, s.archived,
      COALESCE(s.message_count, 0) AS message_count,
      s.my_msg_count,
      s.distinct_senders,
      s.member_count,
      COALESCE((SELECT n FROM url_counts WHERE chat_username = s.username), 0) AS url_count
    FROM sessions s
    WHERE ${conditions.join(" AND ")}
    ORDER BY s.last_timestamp ASC NULLS FIRST
  `).all(...params) as ArchiveCandidate[];
}

export function listArchived(): ArchiveCandidate[] {
  const db = getDb();
  return db.prepare(`
    WITH url_counts AS (
      SELECT chat_username, COUNT(*) AS n FROM urls_dedup WHERE chat_username IS NOT NULL GROUP BY chat_username
    )
    SELECT
      s.username, s.display_name, s.chat_type, s.last_timestamp, s.unread, s.archived,
      COALESCE(s.message_count, 0) AS message_count,
      s.my_msg_count,
      s.distinct_senders,
      s.member_count,
      COALESCE((SELECT n FROM url_counts WHERE chat_username = s.username), 0) AS url_count
    FROM sessions s
    WHERE s.archived = 1
    ORDER BY s.archived_at DESC
  `).all() as ArchiveCandidate[];
}

export function archiveSessions(usernames: string[], reason: string | null = "manual") {
  if (usernames.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE sessions SET archived = 1, archive_reason = ?, archived_at = ? WHERE username = ?`,
  );
  const now = Date.now();
  let n = 0;
  const tx = db.transaction(() => {
    for (const u of usernames) {
      const r = stmt.run(reason, now, u);
      n += r.changes;
    }
  });
  tx();
  return n;
}

export function restoreSessions(usernames: string[]) {
  if (usernames.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(`UPDATE sessions SET archived = 0, archive_reason = NULL, archived_at = NULL WHERE username = ?`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const u of usernames) {
      const r = stmt.run(u);
      n += r.changes;
    }
  });
  tx();
  return n;
}

export function backfillChatUsernames(): { messagesUpdated: number; urlsUpdated: number } {
  const db = getDb();
  const r1 = db.prepare(`
    UPDATE messages
    SET chat_username = (
      SELECT s.username FROM sessions s
      WHERE s.display_name = messages.chat_display
      GROUP BY s.display_name
      HAVING COUNT(*) = 1
    )
    WHERE chat_username IS NULL
      AND chat_display IS NOT NULL AND chat_display != ''
  `).run();
  const r2 = db.prepare(`
    UPDATE urls
    SET chat_username = (
      SELECT s.username FROM sessions s
      WHERE s.display_name = urls.chat_display
      GROUP BY s.display_name
      HAVING COUNT(*) = 1
    )
    WHERE chat_username IS NULL
      AND chat_display IS NOT NULL AND chat_display != ''
  `).run();
  return { messagesUpdated: r1.changes, urlsUpdated: r2.changes };
}
