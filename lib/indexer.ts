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
import { backfillChatUsernames } from "./queries";

export interface IndexerProgress {
  stage: string;
  current?: number;
  total?: number;
  detail?: string;
}

export type ProgressCb = (p: IndexerProgress) => void;

const HISTORY_BATCH_LIMIT = 1000;
const HISTORY_PAGES_PER_CHAT = 10;

export async function indexSessions(onProgress: ProgressCb = () => {}) {
  onProgress({ stage: "sessions:fetch" });
  const sessions = await getSessions(20_000);
  const db = getDb();
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

  for (let page = 0; page < HISTORY_PAGES_PER_CHAT; page++) {
    let batch: RawMessage[] = [];
    try {
      batch = await getHistory(display, {
        limit: HISTORY_BATCH_LIMIT,
        offset,
        since: opts.since,
      });
    } catch (err) {
      onProgress({ stage: "history:error", detail: `${display}: ${(err as Error).message}` });
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

  const minMaxRow = db.prepare(
    `SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts, COUNT(*) AS c FROM messages WHERE chat_username = ?`,
  ).get(username) as { min_ts: number | null; max_ts: number | null; c: number };
  db.prepare(
    `UPDATE sessions SET message_count = ?, first_msg_timestamp = ?, history_indexed_through = ? WHERE username = ?`,
  ).run(minMaxRow.c, minMaxRow.min_ts, minMaxRow.max_ts, username);

  return totalIngested;
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
    INSERT OR IGNORE INTO urls (url, domain, domain_group, message_id, chat_username, chat_display, sender, timestamp, preview, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  const rows = db.prepare(
    `SELECT username, display_name FROM sessions
     WHERE chat_type IN (${placeholders})
       AND (last_timestamp IS NULL OR last_timestamp >= ?)
     ORDER BY last_timestamp DESC NULLS LAST
     LIMIT ?`,
  ).all(...allowed, cutoff, limit) as { username: string; display_name: string }[];

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
  setMeta("last_deep_index_at", String(Date.now()));
  return { sessionsProcessed: done };
}
