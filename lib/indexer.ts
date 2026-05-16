import { getDb, contentHash, setMeta } from "./db";
import {
  getSessions,
  getContacts,
  getHistory,
  search,
  classifyChatType,
  type RawSession,
  type RawMessage,
} from "./wx";
import { extractUrls, toExtracted } from "./url-parser";
import { backfillChatUsernames, refreshDailyCounts } from "./queries";
import { invalidateRecapCache } from "./recap";
import { invalidateCalendarCaches } from "./queries.calendar";
import { invalidateContactBaseline } from "./queries.contact";
import { bumpIndexEpoch } from "./cache";

/**
 * Drop every in-process cache + bump the persistent cache's index epoch so
 * cross-process / cross-restart cached rows in `query_cache` are also
 * invalidated. Called at the end of every indexing run.
 */
function invalidateAllCaches() {
  invalidateRecapCache();
  invalidateCalendarCaches();
  invalidateContactBaseline();
  bumpIndexEpoch();
}

export interface IndexerProgress {
  stage: string;
  current?: number;
  total?: number;
  detail?: string;
}

export type ProgressCb = (p: IndexerProgress) => void;

const HISTORY_BATCH_LIMIT = 1000;
// 50 pages × 1000 msgs = 50k per chat per single run. Most heavy WeChat chats
// fit; extremely long-running 1:1 chats (10+ years) may still exceed, and the
// incremental `--until` path below extends backward across reruns.
const HISTORY_PAGES_PER_CHAT = 50;

/** Format a unix epoch (seconds) as YYYY-MM-DD for the wx CLI's date flags. */
function unixToYmd(sec: number): string {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export async function indexSessions(onProgress: ProgressCb = () => {}) {
  onProgress({ stage: "sessions:fetch" });
  const sessions = await getSessions(20_000);
  const db = getDb();
  // Only touch a session row when something the user can see actually
  // changed. Cuts write amplification (and WAL churn) on each quick index
  // — the common case is "no change" for hundreds of sessions.
  const upsert = db.prepare(`
    INSERT INTO sessions (username, display_name, chat_type, is_group, last_timestamp, last_msg_type, last_summary, unread, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      display_name=excluded.display_name,
      chat_type=excluded.chat_type,
      is_group=excluded.is_group,
      last_timestamp=excluded.last_timestamp,
      last_msg_type=excluded.last_msg_type,
      last_summary=excluded.last_summary,
      unread=excluded.unread,
      indexed_at=excluded.indexed_at
    WHERE
         sessions.display_name IS NOT excluded.display_name
      OR sessions.chat_type IS NOT excluded.chat_type
      OR sessions.is_group IS NOT excluded.is_group
      OR sessions.last_timestamp IS NOT excluded.last_timestamp
      OR sessions.last_msg_type IS NOT excluded.last_msg_type
      OR sessions.last_summary IS NOT excluded.last_summary
      OR sessions.unread IS NOT excluded.unread
  `);
  const now = Date.now();
  const tx = db.transaction((rows: RawSession[]) => {
    for (const s of rows) {
      const ct = classifyChatType(s.chat_type, s.is_group);
      upsert.run(
        s.username,
        s.chat ?? s.username,
        ct,
        s.is_group ? 1 : 0,
        s.timestamp ?? null,
        s.last_msg_type ?? null,
        s.summary ?? null,
        s.unread ?? 0,
        now,
      );
    }
  });
  tx(sessions);
  onProgress({ stage: "sessions:done", current: sessions.length, total: sessions.length });
  return sessions.length;
}

export async function indexContacts(onProgress: ProgressCb = () => {}) {
  onProgress({ stage: "contacts:fetch" });
  // Cap deliberately generous — a busy account easily has 50k+ entries once
  // group members are folded in. Use a single oversized fetch instead of
  // pagination so the wx CLI pipe drains in one pass.
  const contacts = await getContacts(500_000);
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO contacts (username, display_name) VALUES (?, ?)
    ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name
  `);
  const tx = db.transaction((rows: typeof contacts) => {
    for (const c of rows) upsert.run(c.username, c.display ?? null);
  });
  tx(contacts);
  onProgress({ stage: "contacts:done", current: contacts.length, total: contacts.length });
  return contacts.length;
}

export async function indexLinksBulk(onProgress: ProgressCb = () => {}) {
  onProgress({ stage: "links:fetch" });
  const results = await search("http", { type: "link", limit: 100_000 });
  insertMessagesAndUrls(results, { stageLabel: "links" }, onProgress);
  onProgress({ stage: "links:done", current: results.length, total: results.length });
  return results.length;
}

export async function indexHistoryForSession(
  username: string,
  display: string,
  opts: { since?: string; maxMessages?: number } = {},
  onProgress: ProgressCb = () => {},
) {
  const db = getDb();
  let offset = 0;
  let totalIngested = 0;
  const maxMessages = opts.maxMessages ?? HISTORY_BATCH_LIMIT * HISTORY_PAGES_PER_CHAT;
  let lastError: string | null = null;

  // Always record the attempt timestamp so the deep-index scheduler can
  // back off recently-tried chats even when they failed completely.
  db.prepare(`UPDATE sessions SET last_history_attempt_at = ? WHERE username = ?`).run(
    Date.now(),
    username,
  );

  // Incremental backfill: when a chat already has indexed history, the
  // single-run offset cap (50k pages) can leave older messages unindexed
  // forever — offset 0 always starts from the newest. Re-running deep-index
  // would just refetch the same recent 50k. So if we have a recorded
  // `first_msg_timestamp`, this run targets messages strictly *older* than
  // that via `--until <day-1>`. Each rerun extends history one window
  // further back, and the indexer's own dedupe (uniq_msg_hash) handles
  // any overlap at the boundary day.
  const existing = db
    .prepare(`SELECT first_msg_timestamp FROM sessions WHERE username = ?`)
    .get(username) as { first_msg_timestamp: number | null } | undefined;
  const olderThan = existing?.first_msg_timestamp ?? null;
  // Step one day back so we don't get an empty page when `--until` is
  // inclusive of the boundary day.
  const untilParam =
    olderThan !== null ? unixToYmd(olderThan - 86400) : undefined;

  for (let page = 0; page < HISTORY_PAGES_PER_CHAT; page++) {
    let batch: RawMessage[] = [];
    try {
      batch = await getHistory(display, {
        limit: HISTORY_BATCH_LIMIT,
        offset,
        since: opts.since,
        until: untilParam,
      });
    } catch (err) {
      lastError = (err as Error).message;
      onProgress({ stage: "history:error", detail: `${display}: ${lastError}` });
      break;
    }
    if (batch.length === 0) break;

    const annotated = batch.map((m) => ({ ...m, chat: display, chat_username: username } as RawMessage & { chat_username?: string }));
    insertMessagesAndUrls(annotated, { stageLabel: "history", chatUsername: username }, onProgress);
    totalIngested += batch.length;
    offset += batch.length;
    if (totalIngested >= maxMessages) break;
    if (batch.length < HISTORY_BATCH_LIMIT) break;
  }

  // Cap-hit detection: full page cap reached AND last page was a full
  // batch → there's almost certainly more history we didn't fetch.
  // Surface it via `last_history_error` so the user can rerun.
  const hitCap =
    totalIngested >= maxMessages &&
    // The check above just hit the for-loop cap; the inner `break` would
    // also fire on a short batch but we'd have hit the page cap first.
    totalIngested === HISTORY_BATCH_LIMIT * HISTORY_PAGES_PER_CHAT;
  const capNote = hitCap
    ? `hit ${maxMessages.toLocaleString()}-msg cap, rerun deep index to backfill older history`
    : null;

  const minMaxRow = db.prepare(
    `SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts, COUNT(*) AS c FROM messages WHERE chat_username = ?`,
  ).get(username) as { min_ts: number | null; max_ts: number | null; c: number };
  db.prepare(
    `UPDATE sessions SET message_count = ?, first_msg_timestamp = ?, history_indexed_through = ?,
                         last_history_error = ?
     WHERE username = ?`,
  ).run(
    minMaxRow.c,
    minMaxRow.min_ts,
    minMaxRow.max_ts,
    totalIngested === 0 ? lastError : capNote,
    username,
  );

  return totalIngested;
}

const US = String.fromCharCode(31); // record-separator, won't appear in URLs / chat names

function urlDedupKey(
  url: string,
  timestamp: number,
  sender: string,
  chatUsername: string | null,
  chatDisplay: string,
): string {
  return [url, timestamp, sender, chatUsername ?? chatDisplay].join(US);
}

function insertMessagesAndUrls(
  rows: (RawMessage & { chat_username?: string })[],
  ctx: { stageLabel: string; chatUsername?: string },
  onProgress: ProgressCb,
) {
  const db = getDb();
  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO messages (chat_username, chat_display, sender, msg_type, content, timestamp, local_id, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findMsg = db.prepare(`SELECT id FROM messages WHERE content_hash = ?`);
  const insertUrl = db.prepare(`
    INSERT INTO urls (url, domain, domain_group, message_id, chat_username, chat_display, sender, timestamp, preview, content_hash, dedup_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedup_key) DO NOTHING
  `);

  const tx = db.transaction(() => {
    for (const m of rows) {
      const chatUsername = m.chat_username ?? ctx.chatUsername ?? null;
      const chatDisplay = m.chat ?? "";
      const sender = m.sender ?? "";
      const msgType = m.type ?? "";
      const content = m.content ?? "";
      const ts = m.timestamp ?? 0;
      const localId = (m as { local_id?: number }).local_id ?? null;
      const hash = contentHash([chatUsername ?? chatDisplay, ts, sender, msgType, content]);

      insertMsg.run(chatUsername, chatDisplay, sender, msgType, content, ts, localId, hash);
      const row = findMsg.get(hash) as { id: number } | undefined;
      const messageId = row?.id ?? null;

      const urls: { url: string; domain: string; group: string }[] = [];
      if (m.url) urls.push(toExtracted(m.url));
      for (const u of extractUrls(content)) {
        if (!urls.some((x) => x.url === u.url)) urls.push(u);
      }
      for (const u of urls) {
        insertUrl.run(
          u.url,
          u.domain,
          u.group,
          messageId,
          chatUsername,
          chatDisplay,
          sender,
          ts,
          content.slice(0, 200),
          hash,
          urlDedupKey(u.url, ts, sender, chatUsername, chatDisplay),
        );
      }
    }
  });
  tx();
}

export interface IndexQuickResult {
  sessions: number;
  contacts: number;
  links: number;
  elapsedMs: number;
}

export async function runQuickIndex(onProgress: ProgressCb = () => {}): Promise<IndexQuickResult> {
  const start = Date.now();
  const sessions = await indexSessions(onProgress);
  const contacts = await indexContacts(onProgress);
  const links = await indexLinksBulk(onProgress);
  onProgress({ stage: "backfill:start" });
  const backfill = backfillChatUsernames();
  onProgress({
    stage: "backfill:done",
    detail: `${backfill.messagesUpdated} messages + ${backfill.urlsUpdated} urls linked`,
  });
  onProgress({ stage: "rollups:start" });
  const rollup = refreshDailyCounts();
  onProgress({ stage: "rollups:done", detail: `${rollup.days} days` });
  // Keep query planner's stats in sync after big inserts.
  try { getDb().exec("ANALYZE"); } catch {}
  invalidateAllCaches();
  setMeta("last_quick_index_at", String(Date.now()));
  return { sessions, contacts, links, elapsedMs: Date.now() - start };
}

export interface IndexDeepOptions {
  /** Skip sessions with last_timestamp older than this many days */
  recentDays?: number;
  /** Limit number of sessions processed in this run */
  maxSessions?: number;
  /** Chat types to include */
  types?: ("private" | "group" | "official" | "folded" | "other")[];
  /** Messages per chat cap */
  maxMessagesPerChat?: number;
}

export async function runDeepIndex(opts: IndexDeepOptions = {}, onProgress: ProgressCb = () => {}) {
  const db = getDb();
  const cutoff = opts.recentDays ? Math.floor(Date.now() / 1000) - opts.recentDays * 86400 : 0;
  const allowed = opts.types ?? ["private", "group"];
  const limit = opts.maxSessions ?? 1000;

  const placeholders = allowed.map(() => "?").join(",");
  // Skip chats whose last attempt was within the last hour AND failed
  // outright. "Hit the page cap" is NOT a failure — it means we got tons of
  // data and need to backfill the older window on the next run, so those
  // chats should keep being processed.
  const retryCutoff = Date.now() - 60 * 60_000;
  const rows = db.prepare(
    `SELECT username, display_name FROM sessions
     WHERE chat_type IN (${placeholders})
       AND (last_timestamp IS NULL OR last_timestamp >= ?)
       AND NOT (
         last_history_error IS NOT NULL
         AND last_history_error NOT LIKE 'hit %'
         AND last_history_attempt_at IS NOT NULL
         AND last_history_attempt_at > ?
       )
     ORDER BY last_timestamp DESC NULLS LAST
     LIMIT ?`,
  ).all(...allowed, cutoff, retryCutoff, limit) as { username: string; display_name: string }[];

  let done = 0;
  const total = rows.length;
  for (const r of rows) {
    onProgress({ stage: "history:chat", current: ++done, total, detail: r.display_name });
    try {
      await indexHistoryForSession(r.username, r.display_name, { maxMessages: opts.maxMessagesPerChat });
    } catch (err) {
      onProgress({ stage: "history:error", detail: `${r.display_name}: ${(err as Error).message}` });
    }
  }
  const backfill = backfillChatUsernames();
  onProgress({
    stage: "backfill:done",
    detail: `${backfill.messagesUpdated} messages + ${backfill.urlsUpdated} urls linked`,
  });
  onProgress({ stage: "rollups:start" });
  const rollup = refreshDailyCounts();
  onProgress({ stage: "rollups:done", detail: `${rollup.days} days` });
  try { getDb().exec("ANALYZE"); } catch {}
  invalidateAllCaches();
  setMeta("last_deep_index_at", String(Date.now()));
  return { sessionsProcessed: done };
}
