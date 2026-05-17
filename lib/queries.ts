import { getDb, getMeta, setMeta } from "./db";
import { getCachedJSON } from "./cache";

/**
 * Globally-excluded sessions for stats / search / links: archived OR
 * official-account OR folded. Use this in queries that should reflect the
 * user's *active personal* chat history. Reading and the contact-type tabs
 * intentionally bypass this exclusion to remain navigable.
 *
 * `EXCLUDED_SUBQUERY` is the raw subquery — use it inside `IN (...)` /
 * `NOT IN (...)` / `EXISTS (...)` when joining or filtering a column you
 * know is non-NULL. Prefer `EXCLUDED_CHAT_CLAUSE` (or the function form
 * `excludedChatClause()`) when filtering `messages.chat_username` /
 * `urls.chat_username`, because SQL `NULL NOT IN (...)` is `NULL` (i.e.
 * the row is dropped) and we have 18 NULL-chat messages that would
 * otherwise vanish from every total.
 */
export const EXCLUDED_SUBQUERY = `(SELECT username FROM sessions WHERE archived = 1 OR chat_type IN ('official','folded'))`;

export function excludedSubquery({ includeArchived = false }: { includeArchived?: boolean } = {}): string {
  return includeArchived
    ? `(SELECT username FROM sessions WHERE chat_type IN ('official','folded'))`
    : EXCLUDED_SUBQUERY;
}

/** Default-alias predicate for filtering chat_username while keeping NULL rows. */
export const EXCLUDED_CHAT_CLAUSE = `(chat_username IS NULL OR chat_username NOT IN ${EXCLUDED_SUBQUERY})`;

/**
 * Predicate-form of the exclusion. Picks the right alias and honours
 * includeArchived. Always includes NULL-chat_username rows — they don't
 * belong to any session and shouldn't be silently dropped.
 */
export function excludedChatClause(
  opts: { alias?: string; includeArchived?: boolean } = {},
): string {
  const col = opts.alias ? `${opts.alias}.chat_username` : `chat_username`;
  const sub = excludedSubquery({ includeArchived: opts.includeArchived });
  return `(${col} IS NULL OR ${col} NOT IN ${sub})`;
}

const ME_HANDLES_KEY = "me_handles";
const ME_BACKFILLED_AT_KEY = "my_msg_count_backfilled_at";

export function detectMeHandles(): { handles: string[]; rankings: { sender: string; distinct_chats: number; msgs: number }[] } {
  // Cache the rankings query — it's a full-scan group-by over `messages`
  // (~1s on a 1M-row corpus) and the result only changes when the indexer
  // adds new rows (i.e. on the next index epoch). The handle derivation is
  // cheap and runs every call. `{ignoreArchive: true}` because archive flips
  // don't affect which senders exist.
  const rows = getCachedJSON<{ sender: string; distinct_chats: number; msgs: number }[]>(
    "me-handle-rankings",
    () => {
      const db = getDb();
      // Look at the top non-empty senders. NEVER pick the empty-string sender
      // as a me-handle: in WeChat 1:1 private chats wx CLI emits `sender=""`
      // for the OTHER party's messages (the user's own messages get the real
      // handle). Counting "" as me classifies every incoming private message
      // as outgoing and ~doubles "your share" across the app.
      return db.prepare(`
        SELECT sender, COUNT(DISTINCT chat_username) AS distinct_chats, COUNT(*) AS msgs
        FROM messages
        WHERE chat_username IS NOT NULL AND sender != ''
        GROUP BY sender
        ORDER BY distinct_chats DESC
        LIMIT 5
      `).all() as { sender: string; distinct_chats: number; msgs: number }[];
    },
    { ignoreArchive: true },
  );

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
      // Defensive: even if an older stored value contains the empty-string
      // sender, strip it on read. wx CLI emits "" for the *other* side of
      // private chats — treating it as a me-handle inverts every share /
      // latency metric for 1:1 conversations.
      if (Array.isArray(parsed)) return parsed.filter((h: unknown) => typeof h === "string" && h !== "");
    } catch {}
  }
  return [];
}

export function setMeHandles(handles: string[]) {
  const clean = handles.filter((h) => typeof h === "string" && h !== "");
  setMeta(ME_HANDLES_KEY, JSON.stringify(clean));
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
  messages: {
    total: number;
    last7d: number;
    last30d: number;
    last365d: number;
    /** Same window length, immediately preceding the current one. */
    prior7d: number;
    prior30d: number;
    prior365d: number;
  };
  urls: { total: number; uniqueDomains: number };
  contacts: number;
  archived: number;
  topDomains: { domain_group: string; n: number }[];
  msgTypes: { msg_type: string; n: number }[];
  activityByDay: { day: string; n: number }[];
  lastIndexedAt: string | null;
}

export function getOverview(): Overview {
  return getCachedJSON("overview", () => computeOverview());
}

function computeOverview(): Overview {
  ensureDailyCountsFresh();
  const db = getDb();
  const sessions = db.prepare(`SELECT chat_type, archived, COUNT(*) AS n FROM sessions GROUP BY chat_type, archived`).all() as { chat_type: string; archived: number; n: number }[];
  const sessionsByType: Record<string, number> = {};
  let archived = 0;
  for (const r of sessions) {
    if (r.archived === 1) archived += r.n;
    else sessionsByType[r.chat_type] = (sessionsByType[r.chat_type] ?? 0) + r.n;
  }
  const totalSessions = Object.values(sessionsByType).reduce((a, b) => a + b, 0);

  // Day-bound cutoffs derived from local-time days, matching `daily_counts` keys.
  const today = new Date();
  const localDay = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // All msg / activity aggregates now read from the rollup → one O(days) scan
  // instead of three full table scans + an aggregate over 1M+ rows. We also
  // compute the prior-period totals (`prior7d` = the 7 days before the last 7,
  // etc.) so the Overview can render a period-over-period delta strip.
  const dailyAgg = db
    .prepare(
      `SELECT
         SUM(n) AS total,
         SUM(CASE WHEN day >= ?  THEN n ELSE 0 END) AS last7d,
         SUM(CASE WHEN day >= ?  THEN n ELSE 0 END) AS last30d,
         SUM(CASE WHEN day >= ?  THEN n ELSE 0 END) AS last365d,
         SUM(CASE WHEN day >= ?  AND day < ? THEN n ELSE 0 END) AS prior7d,
         SUM(CASE WHEN day >= ?  AND day < ? THEN n ELSE 0 END) AS prior30d,
         SUM(CASE WHEN day >= ?  AND day < ? THEN n ELSE 0 END) AS prior365d
       FROM daily_counts`,
    )
    .get(
      localDay(7),
      localDay(30),
      localDay(365),
      localDay(14), localDay(7),
      localDay(60), localDay(30),
      localDay(730), localDay(365),
    ) as
    | {
        total: number | null;
        last7d: number | null;
        last30d: number | null;
        last365d: number | null;
        prior7d: number | null;
        prior30d: number | null;
        prior365d: number | null;
      }
    | undefined;
  const msgAgg = {
    total: dailyAgg?.total ?? 0,
    last7d: dailyAgg?.last7d ?? 0,
    last30d: dailyAgg?.last30d ?? 0,
    last365d: dailyAgg?.last365d ?? 0,
    prior7d: dailyAgg?.prior7d ?? 0,
    prior30d: dailyAgg?.prior30d ?? 0,
    prior365d: dailyAgg?.prior365d ?? 0,
  };

  const urlAgg = db.prepare(`
    SELECT COUNT(*) AS total, COUNT(DISTINCT domain) AS uniqueDomains
    FROM urls_dedup
    WHERE ${EXCLUDED_CHAT_CLAUSE}
  `).get() as { total: number; uniqueDomains: number };

  const contacts = (db.prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }).n;

  const topDomains = db.prepare(`
    SELECT domain_group, COUNT(*) AS n FROM urls_dedup
    WHERE ${EXCLUDED_CHAT_CLAUSE}
    GROUP BY domain_group ORDER BY n DESC LIMIT 12
  `).all() as { domain_group: string; n: number }[];

  const msgTypes = db.prepare(`
    SELECT msg_type, COUNT(*) AS n FROM messages
    WHERE ${EXCLUDED_CHAT_CLAUSE}
    GROUP BY msg_type ORDER BY n DESC LIMIT 10
  `).all() as { msg_type: string; n: number }[];

  const activityByDay = db.prepare(
    `SELECT day, n FROM daily_counts WHERE day >= ? ORDER BY day`,
  ).all(localDay(365)) as { day: string; n: number }[];

  const lastIndexedAt = (db.prepare(`SELECT value FROM meta WHERE key = 'last_quick_index_at'`).get() as { value: string } | undefined)?.value ?? null;

  return {
    sessions: {
      total: totalSessions,
      private: sessionsByType.private ?? 0,
      group: sessionsByType.group ?? 0,
      official: sessionsByType.official ?? 0,
      folded: sessionsByType.folded ?? 0,
    },
    messages: {
      total: msgAgg.total,
      last7d: msgAgg.last7d,
      last30d: msgAgg.last30d,
      last365d: msgAgg.last365d,
      prior7d: msgAgg.prior7d,
      prior30d: msgAgg.prior30d,
      prior365d: msgAgg.prior365d,
    },
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
  /** "hit X-msg cap" when the last indexing pass capped early. */
  last_history_error: string | null;
}

/**
 * Count sessions matching the same filters as `listSessions`. Used to render
 * "Showing X of Y" hints without paying for the inner `url_counts` CTE.
 */
export interface SettingsCounts {
  sessions: number;
  archived: number;
  contacts: number;
  messages: number;
  urls: number;
  messages_unmatched: number;
  urls_unmatched: number;
}

/**
 * Combined COUNT(*) for the Settings page. Five of these scan the full
 * `messages` / `urls` tables (~1M / ~90k rows on a typical corpus); running
 * them on every Settings render put the cold load at ~6s. The result is
 * stable until the next index epoch — wrap in `getCachedJSON` and reuse.
 */
export function getSettingsCounts(): SettingsCounts {
  return getCachedJSON("settings-counts", () => {
    const db = getDb();
    return db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM sessions) AS sessions,
           (SELECT COUNT(*) FROM sessions WHERE archived = 1) AS archived,
           (SELECT COUNT(*) FROM contacts) AS contacts,
           (SELECT COUNT(*) FROM messages) AS messages,
           (SELECT COUNT(*) FROM urls) AS urls,
           (SELECT COUNT(*) FROM messages WHERE chat_username IS NULL) AS messages_unmatched,
           (SELECT COUNT(*) FROM urls WHERE chat_username IS NULL) AS urls_unmatched`,
      )
      .get() as SettingsCounts;
  });
}

export function countSessions(opts: { type?: string; q?: string; includeArchived?: boolean; onlyArchived?: boolean } = {}): number {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (opts.onlyArchived) conditions.push("s.archived = 1");
  else if (!opts.includeArchived) conditions.push("s.archived = 0");
  if (opts.type && opts.type !== "all") {
    conditions.push("s.chat_type = ?");
    params.push(opts.type);
  }
  if (opts.q) {
    // Mirror listSessions's q-filter so the "showing X / total" math agrees
    // with the rendered rows when the user types in the name filter.
    conditions.push(
      "(s.display_name LIKE ? OR c.display_name LIKE ? OR s.username LIKE ?)",
    );
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return (
    db.prepare(`
      SELECT COUNT(*) AS n FROM sessions s
      LEFT JOIN contacts c ON c.username = s.username
      ${where}
    `).get(...params) as { n: number }
  ).n;
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
    // Match against the effective display name (sessions row, falling back to
    // the contacts row when sessions has a blank/wxid placeholder) AND the
    // raw username, so users can search for either.
    conditions.push(
      "(s.display_name LIKE ? OR c.display_name LIKE ? OR s.username LIKE ?)",
    );
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // sort is `<key>` (uses each column's natural direction) or `<key>-asc` /
  // `<key>-desc` for an explicit override. Lets the column-header popover
  // toggle sort direction without inventing a separate `dir` URL param.
  // The `name` sort intentionally targets the SELECT alias `display_name`
  // (effective name) so the visible ordering matches what the user sees.
  const orderBy = (() => {
    switch (opts.sort) {
      case "messages":      return "ORDER BY message_count DESC";
      case "messages-asc":  return "ORDER BY message_count ASC";
      case "urls":          return "ORDER BY url_count DESC";
      case "urls-asc":      return "ORDER BY url_count ASC";
      case "name":          return "ORDER BY display_name ASC";
      case "name-desc":     return "ORDER BY display_name DESC";
      case "recent-asc":    return "ORDER BY s.last_timestamp ASC NULLS LAST";
      case "recent":
      default:              return "ORDER BY s.last_timestamp DESC NULLS LAST";
    }
  })();

  params.push(opts.limit ?? 100);

  // Display name fallback chain:
  //   1. sessions.display_name, when it's non-empty and not the raw username.
  //   2. contacts.display_name (populated by `wx contacts`), when present.
  //   3. sessions.username (wxid / chatroom handle) — last-resort.
  // This lets the friend's already-indexed DB render real names without
  // re-running quick index, in case `wx sessions --json` returned blank
  // `chat` fields but `wx contacts --json` had names.
  return db.prepare(`
    WITH url_counts AS (
      SELECT chat_username, COUNT(*) AS n FROM urls_dedup WHERE chat_username IS NOT NULL GROUP BY chat_username
    )
    SELECT
      s.username,
      COALESCE(
        NULLIF(NULLIF(s.display_name, ''), s.username),
        NULLIF(c.display_name, ''),
        s.username
      ) AS display_name,
      s.chat_type, s.is_group, s.last_timestamp, s.unread, s.archived,
      s.last_history_error,
      COALESCE(s.message_count, 0) AS message_count,
      COALESCE((SELECT n FROM url_counts WHERE chat_username = s.username), 0) AS url_count
    FROM sessions s
    LEFT JOIN contacts c ON c.username = s.username
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
export function getLinkGroups(opts: { includeArchived?: boolean } = {}): { domain_group: string; n: number; latest_ts: number }[] {
  const db = getDb();
  const excl = excludedSubquery(opts);
  return db.prepare(`
    SELECT domain_group, COUNT(*) AS n, MAX(timestamp) AS latest_ts
    FROM urls_dedup
    WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
    GROUP BY domain_group
    ORDER BY n DESC
  `).all() as { domain_group: string; n: number; latest_ts: number }[];
}

export function getLinksInGroup(
  group: string,
  opts: {
    limit?: number;
    offset?: number;
    sender?: string;
    chat?: string;
    chatUsername?: string;
    q?: string;
    includeArchived?: boolean;
  } = {},
) {
  const db = getDb();
  const excl = excludedSubquery(opts);
  const conditions = [`domain_group = ?`, `(chat_username IS NULL OR chat_username NOT IN ${excl})`];
  const params: (string | number)[] = [group];
  if (opts.sender) {
    conditions.push("sender = ?");
    params.push(opts.sender);
  }
  // Prefer username over display name — same dedup-safety reasoning as search.
  if (opts.chatUsername) {
    conditions.push("chat_username = ?");
    params.push(opts.chatUsername);
  } else if (opts.chat) {
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

export function getLinkGroupFacets(
  group: string,
  opts: { includeArchived?: boolean; chatUsername?: string } = {},
): { senders: { sender: string; n: number }[]; chats: { chat_display: string; n: number }[] } {
  const db = getDb();
  const excl = excludedSubquery(opts);
  // When chat-scoped, the facets only make sense within that one chat —
  // senders becomes "who in this chat sent links of this group", chats list
  // collapses to one row.
  const chatFilter = opts.chatUsername ? "AND chat_username = ?" : "";
  const params: (string | number)[] = opts.chatUsername
    ? [group, opts.chatUsername]
    : [group];
  const senders = db
    .prepare(
      `SELECT sender, COUNT(*) AS n FROM urls_dedup
       WHERE domain_group = ? AND sender != '' AND (chat_username IS NULL OR chat_username NOT IN ${excl})
         ${chatFilter}
       GROUP BY sender ORDER BY n DESC LIMIT 30`,
    )
    .all(...params) as { sender: string; n: number }[];
  const chats = db
    .prepare(
      `SELECT chat_display, COUNT(*) AS n FROM urls_dedup
       WHERE domain_group = ? AND (chat_username IS NULL OR chat_username NOT IN ${excl})
         ${chatFilter}
       GROUP BY chat_display ORDER BY n DESC LIMIT 30`,
    )
    .all(...params) as { chat_display: string; n: number }[];
  return { senders, chats };
}

/**
 * Parse a user query into phrase tokens. Either `"…"`-wrapped phrases or
 * whitespace-separated bare words. Doubled `""` inside a phrase escapes a
 * single `"`. Empty / whitespace-only input yields [].
 */
export function parseSearchTokens(q: string): string[] {
  const out: string[] = [];
  const s = q.trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      let token = "";
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') { token += '"'; j += 2; continue; }
          j++; break;
        }
        token += s[j]; j++;
      }
      if (token.length > 0) out.push(token);
      i = j;
    } else {
      let j = i;
      while (j < s.length && !/\s/.test(s[j]) && s[j] !== '"') j++;
      out.push(s.slice(i, j));
      i = j;
    }
  }
  return out;
}

export function searchMessages(
  q: string,
  opts: {
    limit?: number;
    type?: string;
    chat?: string;
    chatUsername?: string;
    includeArchived?: boolean;
  } = {},
) {
  const db = getDb();
  const tokens = parseSearchTokens(q);
  if (tokens.length === 0) return [];
  const excl = excludedSubquery(opts);

  const limit = opts.limit ?? 100;
  const typeFilter = opts.type ? " AND m.msg_type = ?" : "";
  // Prefer chat_username when provided — display names collide constantly in
  // WeChat, while username is globally unique. `chat` (display) stays as a
  // fallback for older external links.
  const chatFilter = opts.chatUsername
    ? " AND m.chat_username = ?"
    : opts.chat
      ? " AND m.chat_display = ?"
      : "";
  const extraParams: (string | number)[] = [];
  if (opts.type) extraParams.push(opts.type);
  if (opts.chatUsername) extraParams.push(opts.chatUsername);
  else if (opts.chat) extraParams.push(opts.chat);

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

  // SQLite FTS5's trigram tokenizer can't match tokens < 3 chars (very common
  // for 2-char CJK queries). If *any* token is short, fall back to AND-LIKE
  // for correctness — slower full scan but covers the case.
  const anyShort = tokens.some((t) => t.length < 3);
  let rows: Omit<Row, "snippet">[];

  if (anyShort) {
    const likeParams: (string | number)[] = [];
    const likeConds: string[] = [];
    for (const t of tokens) {
      likeConds.push(`m.content LIKE ? ESCAPE '\\'`);
      likeParams.push(`%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    }
    rows = db
      .prepare(
        `SELECT m.id, m.chat_username, m.chat_display, m.sender, m.msg_type, m.content, m.timestamp
         FROM messages m
         WHERE ${likeConds.join(" AND ")}
           AND (m.chat_username IS NULL OR m.chat_username NOT IN ${excl})
           ${typeFilter}${chatFilter}
         ORDER BY m.timestamp DESC
         LIMIT ?`,
      )
      .all(...likeParams, ...extraParams, limit) as Omit<Row, "snippet">[];
  } else {
    // FTS5 with each token wrapped as a literal phrase so operators (`:`, `-`,
    // `*`, `NEAR`, etc.) inside user input never trigger FTS syntax errors.
    const ftsQuery = tokens
      .map((t) => `"${t.replace(/"/g, '""')}"`)
      .join(" ");
    rows = db
      .prepare(
        `SELECT m.id, m.chat_username, m.chat_display, m.sender, m.msg_type, m.content, m.timestamp
         FROM messages_fts
         JOIN messages m ON m.id = messages_fts.rowid
         WHERE messages_fts MATCH ?
           AND (m.chat_username IS NULL OR m.chat_username NOT IN ${excl})
           ${typeFilter}${chatFilter}
         ORDER BY m.timestamp DESC
         LIMIT ?`,
      )
      .all(ftsQuery, ...extraParams, limit) as Omit<Row, "snippet">[];
  }

  // Build snippets in JS so we always escape HTML before injecting marks.
  // Avoids stored-XSS via forwarded messages containing literal HTML —
  // the FTS5 `snippet()` function would otherwise emit raw content unescaped.
  return rows.map<Row>((r) => ({ ...r, snippet: buildSnippet(r.content, tokens) }));
}

function buildSnippet(content: string, tokens: string[]): string {
  if (!content) return "";
  const lower = content.toLowerCase();
  let bestIdx = -1;
  let bestTokLen = 0;
  for (const t of tokens) {
    const idx = lower.indexOf(t.toLowerCase());
    if (idx < 0) continue;
    if (bestIdx < 0 || idx < bestIdx) {
      bestIdx = idx;
      bestTokLen = t.length;
    }
  }
  if (bestIdx < 0) {
    return escapeHtml(content.slice(0, 80)) + (content.length > 80 ? "…" : "");
  }
  const lead = Math.max(0, bestIdx - 24);
  const tail = Math.min(content.length, bestIdx + bestTokLen + 24);
  const before =
    (lead > 0 ? "…" : "") + escapeHtml(content.slice(lead, bestIdx));
  const match = `<mark>${escapeHtml(content.slice(bestIdx, bestIdx + bestTokLen))}</mark>`;
  const after =
    escapeHtml(content.slice(bestIdx + bestTokLen, tail)) +
    (tail < content.length ? "…" : "");
  return before + match + after;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getHeatmap(
  year: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): { day: string; n: number }[] {
  // Past years are immutable; this year's heatmap drifts only on a new index
  // (which bumps cache_epoch_index) so the cache invalidates naturally.
  const key = `heatmap:y=${year}:c=${opts.chatUsername ?? ""}:a=${opts.includeArchived ? 1 : 0}`;
  return getCachedJSON(key, () => computeHeatmap(year, opts));
}

function computeHeatmap(
  year: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): { day: string; n: number }[] {
  ensureDailyCountsFresh();
  const db = getDb();
  // Chat-scoped path: no rollup, count per-day from messages directly. The
  // year range scan + chat equality keeps this fast even for big chats.
  if (opts.chatUsername) {
    const yearStart = Math.floor(new Date(year, 0, 1, 0, 0, 0, 0).getTime() / 1000);
    const yearEnd = Math.floor(new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime() / 1000);
    return db
      .prepare(
        `SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
                COUNT(*) AS n
         FROM messages
         WHERE timestamp >= ? AND timestamp < ?
           AND chat_username = ?
         GROUP BY day
         ORDER BY day`,
      )
      .all(yearStart, yearEnd, opts.chatUsername) as { day: string; n: number }[];
  }
  const col = opts.includeArchived ? "n_with_archived" : "n";
  return db
    .prepare(
      `SELECT day, ${col} AS n FROM daily_counts
       WHERE day >= ? AND day < ?
       ORDER BY day`,
    )
    .all(`${year}-01-01`, `${year + 1}-01-01`) as { day: string; n: number }[];
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

/**
 * Rebuild the `daily_counts` rollup from scratch. Cheap on the current corpus
 * (~3k days × one strftime), and a full rebuild is simpler & more correct
 * than incremental updates when archive flips, me-handle changes, or
 * back-dated indexing can shift any row.
 *
 * Called at the end of every indexing run.
 */
export function refreshDailyCounts(): { days: number } {
  const db = getDb();
  const handles = getMeHandles();
  const meIn = handles.length
    ? `IN (${handles.map(() => "?").join(",")})`
    : `IN ('')`;
  const excl = EXCLUDED_SUBQUERY;
  const exclWithArchived = `(SELECT username FROM sessions WHERE chat_type IN ('official','folded'))`;
  db.exec("DELETE FROM daily_counts");
  const insert = db.prepare(
    `INSERT INTO daily_counts (day, n, mine, n_with_archived, mine_with_archived)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
         SUM(CASE WHEN (chat_username IS NULL OR chat_username NOT IN ${excl}) THEN 1 ELSE 0 END) AS n,
         SUM(CASE WHEN (chat_username IS NULL OR chat_username NOT IN ${excl}) AND sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         SUM(CASE WHEN (chat_username IS NULL OR chat_username NOT IN ${exclWithArchived}) THEN 1 ELSE 0 END) AS n_with_archived,
         SUM(CASE WHEN (chat_username IS NULL OR chat_username NOT IN ${exclWithArchived}) AND sender ${meIn} THEN 1 ELSE 0 END) AS mine_with_archived
       FROM messages
       GROUP BY day`,
    )
    .all(...handles, ...handles) as {
    day: string;
    n: number;
    mine: number;
    n_with_archived: number;
    mine_with_archived: number;
  }[];
  const tx = db.transaction(() => {
    for (const r of rows) {
      insert.run(r.day, r.n, r.mine, r.n_with_archived, r.mine_with_archived);
    }
  });
  tx();
  setMeta("daily_counts_refreshed_at", String(Date.now()));
  return { days: rows.length };
}

export function ensureDailyCountsFresh(): boolean {
  const v = getMeta("daily_counts_refreshed_at");
  if (v) return false;
  refreshDailyCounts();
  return true;
}

/**
 * Returned by `backfillChatUsernames` and surfaced on the Settings page.
 * `messagesUnmatched` / `urlsUnmatched` are rows still NULL after the run —
 * usually because the display name collides with multiple sessions (the
 * backfill bails on ambiguous matches via HAVING COUNT(*) = 1).
 */
export interface BackfillResult {
  messagesUpdated: number;
  urlsUpdated: number;
  messagesUnmatched: number;
  urlsUnmatched: number;
}

export interface MessageRow {
  id: number;
  chat_username: string | null;
  chat_display: string;
  sender: string;
  msg_type: string;
  content: string;
  timestamp: number;
}

export interface MessageContext {
  target: MessageRow | null;
  before: MessageRow[];
  after: MessageRow[];
  session: { username: string; display_name: string; chat_type: string } | null;
}

export function getMessageContext(
  id: number,
  opts: { before?: number; after?: number } = {},
): MessageContext {
  const db = getDb();
  const beforeN = opts.before ?? 20;
  const afterN = opts.after ?? 20;

  const target = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, msg_type, content, timestamp
       FROM messages WHERE id = ?`,
    )
    .get(id) as MessageRow | undefined;

  if (!target) return { target: null, before: [], after: [], session: null };

  // Some old rows have NULL chat_username (history pulled before backfill);
  // fall back to chat_display so the permalink still shows neighbours.
  const useUsername = target.chat_username !== null;
  const scopeCol = useUsername ? "chat_username" : "chat_display";
  const scopeVal = useUsername ? target.chat_username! : target.chat_display;

  const beforeRows = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, msg_type, content, timestamp
       FROM messages
       WHERE ${scopeCol} = ? AND (timestamp < ? OR (timestamp = ? AND id < ?))
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`,
    )
    .all(scopeVal, target.timestamp, target.timestamp, target.id, beforeN) as MessageRow[];

  const afterRows = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, msg_type, content, timestamp
       FROM messages
       WHERE ${scopeCol} = ? AND (timestamp > ? OR (timestamp = ? AND id > ?))
       ORDER BY timestamp ASC, id ASC
       LIMIT ?`,
    )
    .all(scopeVal, target.timestamp, target.timestamp, target.id, afterN) as MessageRow[];

  const session = target.chat_username
    ? (db
        .prepare(
          `SELECT username, display_name, chat_type FROM sessions WHERE username = ?`,
        )
        .get(target.chat_username) as
        | { username: string; display_name: string; chat_type: string }
        | undefined) ?? null
    : null;

  return {
    target,
    before: beforeRows.reverse(),
    after: afterRows,
    session,
  };
}

/**
 * Mark a single URL (from `urls.id` / `urls_dedup.id`) as read. Idempotent —
 * INSERT OR REPLACE refreshes `read_at` on a re-mark instead of duplicating.
 */
export function markUrlRead(urlId: number): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO read_urls(url_id, read_at) VALUES (?, ?)`).run(
    urlId,
    Date.now(),
  );
}

/** Inverse of `markUrlRead`; no-op when the row isn't present. */
export function markUrlUnread(urlId: number): void {
  const db = getDb();
  db.prepare(`DELETE FROM read_urls WHERE url_id = ?`).run(urlId);
}

/**
 * All URL ids the user has marked read. Used by the reading queue to render
 * the checkbox state and to filter. Small enough (< a few thousand expected)
 * to materialise into a Set on each request.
 */
export function getReadUrlIds(): Set<number> {
  const db = getDb();
  const rows = db.prepare(`SELECT url_id FROM read_urls`).all() as { url_id: number }[];
  return new Set(rows.map((r) => r.url_id));
}

export function backfillChatUsernames(): BackfillResult {
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
  const messagesUnmatched = (
    db.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_username IS NULL").get() as { n: number }
  ).n;
  const urlsUnmatched = (
    db.prepare("SELECT COUNT(*) AS n FROM urls WHERE chat_username IS NULL").get() as { n: number }
  ).n;
  return {
    messagesUpdated: r1.changes,
    urlsUpdated: r2.changes,
    messagesUnmatched,
    urlsUnmatched,
  };
}
