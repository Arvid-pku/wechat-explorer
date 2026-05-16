/**
 * Per-contact deep analytics queries.
 *
 * One entrypoint: `getContactAnalytics(username)`. It performs a small fixed
 * number of prepared statements against `messages` / `urls` / `sessions` and
 * returns everything the contact-detail page needs to render. No per-section
 * round trips, no N+1.
 *
 * The TF-IDF baseline (a global "what's a normal word in this index?" bag)
 * is computed once and cached at module scope for 24h. Building it touches
 * ~20k random text messages which costs ~600ms warm; warm pages reuse it.
 */
import { getDb } from "./db";
import { getMeHandles } from "./queries";
import { tokenize, termFreq, tfidfAgainst, topByCount, topEmoji, vocabDiff, type ScoredWord } from "./text";
import { computeLatencies, type LatencyResult } from "./latency";

export const RECENT_TOKEN_LIMIT = 5000;
export const BASELINE_SAMPLE = 20_000;
const BASELINE_TTL_MS = 24 * 60 * 60 * 1000;

/* ---------- baseline cache for TF-IDF ---------- */

let _baselineCache: { tf: Map<string, number>; ts: number } | null = null;

/**
 * Get (and cache) the global token baseline. Uses a 20k random text-message
 * sample across the index. Refreshed every 24h, lazily.
 */
export function getGlobalTokenBaseline(): Map<string, number> {
  if (_baselineCache && Date.now() - _baselineCache.ts < BASELINE_TTL_MS) {
    return _baselineCache.tf;
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT content FROM messages
       WHERE msg_type = '文本' AND content IS NOT NULL AND length(content) > 1
       ORDER BY RANDOM()
       LIMIT ?`,
    )
    .all(BASELINE_SAMPLE) as { content: string }[];
  const tf = termFreq(rows.map((r) => r.content));
  _baselineCache = { tf, ts: Date.now() };
  return tf;
}

/* ---------- types ---------- */

export interface SessionMeta {
  username: string;
  display_name: string;
  chat_type: string;
  is_group: number;
  archived: number;
  member_count: number | null;
  first_msg_timestamp: number | null;
  history_indexed_through: number | null;
  last_timestamp: number | null;
}

export interface MonthlyPoint {
  ym: string; // "2025-04"
  mine: number;
  theirs: number;
}

export interface HourlyPoint {
  hour: number; // 0-23
  mine: number;
  theirs: number;
}

export interface DomainShare {
  domain_group: string;
  n: number;
}

export interface FileTypeShare {
  ext: string;
  n: number;
}

export interface SenderShare {
  sender: string;
  n: number;
  knownUsername: string | null;
}

export interface StyleFingerprint {
  side: "mine" | "theirs";
  sampleSize: number;
  avgChars: number;
  emojiPerMsg: number;
  linkPerMsg: number;
  voiceShare: number;
  imageShare: number;
  stickerShare: number;
  topEmoji: { emoji: string; n: number }[];
}

export interface RecentMessage {
  id: number;
  sender: string;
  msg_type: string;
  content: string;
  timestamp: number;
  isMine: boolean;
}

export interface ContactAnalytics {
  session: SessionMeta;
  isGroup: boolean;
  totals: {
    messages: number;
    mine: number;
    theirs: number;
    minePct: number;
    links: number;
    firstTs: number | null;
    lastTs: number | null;
    indexedThrough: number | null;
  };
  msgTypeBreakdown: { msg_type: string; n: number }[];
  monthly: MonthlyPoint[];
  hourly: HourlyPoint[];
  latencies: { themToYou: number[]; youToThem: number[] };
  styleMine: StyleFingerprint;
  styleTheirs: StyleFingerprint;
  topics: ScoredWord[];
  topDomains: DomainShare[];
  fileTypes: FileTypeShare[];
  vocab: { aOnly: ScoredWord[]; bOnly: ScoredWord[] } | null;
  topSenders: SenderShare[]; // groups only
  recent: RecentMessage[];
  meHandles: string[];
}

/* ---------- helpers ---------- */

/**
 * Pick a usable "me" sender set for this chat. The global me-handle list can
 * include the empty string (which would label every "them" message in private
 * chats as me). For private chats we always restrict to non-empty handles
 * that actually appear here. For groups we just take the known me-handles.
 */
function pickMeHandles(handles: string[], chatType: string, presentSenders: Set<string>): string[] {
  const nonEmpty = handles.filter((h) => h && h.length > 0);
  if (chatType !== "group") {
    // private chat: only meaningful me-handle is the non-empty one that appears here
    return nonEmpty.filter((h) => presentSenders.has(h));
  }
  return nonEmpty.filter((h) => presentSenders.has(h));
}

const FILE_EXT_RE = /\.([a-z0-9]{1,6})(?:\b|[?#])/i;
const URL_RE = /https?:\/\/\S+/i;

function extFromContent(content: string, msgType: string): string | null {
  if (!content) return null;
  // Strip standard wechat preview prefixes like "[链接] " and trailing "local_id=..."
  const cleaned = content
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s+local_id=\d+\s*$/i, "")
    .trim();
  // For 图片/视频 the content is typically "[图片] local_id=…" — fall back to msg type
  if (!cleaned || cleaned.startsWith("[")) {
    if (msgType === "图片") return "image";
    if (msgType === "视频") return "video";
    if (msgType === "语音") return "audio";
    if (msgType === "表情") return "sticker";
    return null;
  }
  // Try to read a file extension off the cleaned text
  const m = cleaned.match(FILE_EXT_RE);
  if (m) return m[1].toLowerCase();
  // No explicit ext — bucket by msg_type
  if (msgType === "图片") return "image";
  if (msgType === "视频") return "video";
  if (msgType === "语音") return "audio";
  if (msgType === "表情") return "sticker";
  if (msgType === "文件") return "file";
  if (msgType === "链接/文件" || msgType === "链接") return "link";
  return null;
}

function computeStyle(
  rows: { content: string; msg_type: string }[],
  side: "mine" | "theirs",
): StyleFingerprint {
  let chars = 0;
  let emoji = 0;
  let links = 0;
  let voice = 0;
  let image = 0;
  let sticker = 0;
  const textForEmoji: string[] = [];
  let textCount = 0;
  for (const r of rows) {
    const c = r.content || "";
    const t = r.msg_type;
    if (t === "语音") voice++;
    else if (t === "图片") image++;
    else if (t === "表情") sticker++;
    else if (t === "文本") {
      textCount++;
      chars += [...c].length;
      // emoji count
      for (const ch of c) {
        if (/\p{Extended_Pictographic}/u.test(ch)) emoji++;
      }
      if (URL_RE.test(c)) links++;
      textForEmoji.push(c);
    } else {
      // 链接/文件 etc count as links for the "link rate" of a side
      if (t.includes("链接")) links++;
    }
  }
  const n = rows.length || 1;
  const textN = textCount || 1;
  return {
    side,
    sampleSize: rows.length,
    avgChars: chars / textN,
    emojiPerMsg: emoji / textN,
    linkPerMsg: links / n,
    voiceShare: voice / n,
    imageShare: image / n,
    stickerShare: sticker / n,
    topEmoji: topEmoji(textForEmoji, 8),
  };
}

/* ---------- the entrypoint ---------- */

export function getContactAnalytics(username: string): ContactAnalytics | null {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT username, display_name, chat_type, is_group, archived, member_count,
              first_msg_timestamp, history_indexed_through, last_timestamp
       FROM sessions WHERE username = ?`,
    )
    .get(username) as SessionMeta | undefined;
  if (!session) return null;

  const isGroup = session.chat_type === "group";

  // 1) which senders appear here (lets us pick correct me-handles)
  const senderRows = db
    .prepare(
      `SELECT sender, COUNT(*) AS n FROM messages
       WHERE chat_username = ?
       GROUP BY sender ORDER BY n DESC`,
    )
    .all(username) as { sender: string; n: number }[];
  const presentSenders = new Set(senderRows.map((r) => r.sender));
  const meHandles = pickMeHandles(getMeHandles(), session.chat_type, presentSenders);
  const meSet = new Set(meHandles);

  // 2) totals
  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) AS messages, MIN(timestamp) AS firstTs, MAX(timestamp) AS lastTs
       FROM messages WHERE chat_username = ?`,
    )
    .get(username) as { messages: number; firstTs: number | null; lastTs: number | null };

  // Mine vs theirs counts via senderRows (no second pass)
  let mine = 0;
  let theirs = 0;
  for (const s of senderRows) {
    if (meSet.has(s.sender)) mine += s.n;
    else theirs += s.n;
  }
  const linksCount = (db
    .prepare(`SELECT COUNT(*) AS n FROM urls_dedup WHERE chat_username = ?`)
    .get(username) as { n: number }).n;

  // 3) msg_type breakdown
  const msgTypeBreakdown = db
    .prepare(
      `SELECT msg_type, COUNT(*) AS n FROM messages
       WHERE chat_username = ? GROUP BY msg_type ORDER BY n DESC`,
    )
    .all(username) as { msg_type: string; n: number }[];

  // 4) monthly activity for the last 24 months
  // Group by strftime('%Y-%m', ...) split on isMine via meSet (encoded via sender list)
  // We can compute mine/theirs by joining a CASE WHEN sender IN (...) for each handle.
  // To keep it simple in SQL: aggregate by sender + ym, then fold mine/theirs in JS.
  const cutoff24m = Math.floor(Date.now() / 1000) - 24 * 31 * 86400;
  const monthlyRaw = db
    .prepare(
      `SELECT strftime('%Y-%m', timestamp, 'unixepoch', 'localtime') AS ym, sender, COUNT(*) AS n
       FROM messages
       WHERE chat_username = ? AND timestamp >= ?
       GROUP BY ym, sender`,
    )
    .all(username, cutoff24m) as { ym: string; sender: string; n: number }[];
  const monthlyMap = new Map<string, { mine: number; theirs: number }>();
  for (const r of monthlyRaw) {
    const slot = monthlyMap.get(r.ym) ?? { mine: 0, theirs: 0 };
    if (meSet.has(r.sender)) slot.mine += r.n;
    else slot.theirs += r.n;
    monthlyMap.set(r.ym, slot);
  }
  const monthly = fillMonths(monthlyMap, 24);

  // 5) hourly grid (avg over all messages)
  const hourlyRaw = db
    .prepare(
      `SELECT CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS hour,
              sender, COUNT(*) AS n
       FROM messages
       WHERE chat_username = ?
       GROUP BY hour, sender`,
    )
    .all(username) as { hour: number; sender: string; n: number }[];
  const hourly: HourlyPoint[] = Array.from({ length: 24 }, (_, hour) => ({ hour, mine: 0, theirs: 0 }));
  for (const r of hourlyRaw) {
    const slot = hourly[r.hour];
    if (!slot) continue;
    if (meSet.has(r.sender)) slot.mine += r.n;
    else slot.theirs += r.n;
  }

  // 6) latencies — pull a single ordered stream of (sender, timestamp).
  // If we can't tell sides apart (no me-handles for this chat), skip.
  let latencies: LatencyResult = { themToYou: [], youToThem: [] };
  if (meHandles.length > 0 && theirs > 0) {
    const stream = db
      .prepare(
        `SELECT sender, timestamp FROM messages
         WHERE chat_username = ?
         ORDER BY timestamp ASC`,
      )
      .all(username) as { sender: string; timestamp: number }[];
    latencies = computeLatencies(stream, meHandles);
  }

  // 7) style fingerprint + emoji + vocab — pull last 5000 text/emoji/etc msgs per side
  // Two prepared statements (one for "in" meHandles, one for "not in")
  let stylePullMine: { content: string; msg_type: string }[] = [];
  let stylePullTheirs: { content: string; msg_type: string }[] = [];
  if (meHandles.length > 0) {
    const placeholders = meHandles.map(() => "?").join(",");
    stylePullMine = db
      .prepare(
        `SELECT content, msg_type FROM messages
         WHERE chat_username = ? AND sender IN (${placeholders})
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(username, ...meHandles, RECENT_TOKEN_LIMIT) as { content: string; msg_type: string }[];
    stylePullTheirs = db
      .prepare(
        `SELECT content, msg_type FROM messages
         WHERE chat_username = ? AND sender NOT IN (${placeholders})
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(username, ...meHandles, RECENT_TOKEN_LIMIT) as { content: string; msg_type: string }[];
  } else {
    // No me-handles for this chat — bundle everything as "theirs"
    stylePullTheirs = db
      .prepare(
        `SELECT content, msg_type FROM messages
         WHERE chat_username = ?
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(username, RECENT_TOKEN_LIMIT) as { content: string; msg_type: string }[];
  }
  const styleMine = computeStyle(stylePullMine, "mine");
  const styleTheirs = computeStyle(stylePullTheirs, "theirs");

  // 8) topics — TF-IDF of THIS chat vs global baseline (text msgs only)
  const allTexts = [
    ...stylePullMine.filter((r) => r.msg_type === "文本").map((r) => r.content),
    ...stylePullTheirs.filter((r) => r.msg_type === "文本").map((r) => r.content),
  ];
  const chatTf = termFreq(allTexts);
  const baseline = getGlobalTokenBaseline();
  const topics = tfidfAgainst(chatTf, baseline, { top: 30, min: 2 });

  // 9) top link domains (already filtered by chat)
  const topDomains = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n FROM urls_dedup
       WHERE chat_username = ?
       GROUP BY domain_group ORDER BY n DESC LIMIT 8`,
    )
    .all(username) as DomainShare[];

  // 10) file types — best effort from non-text msgs
  const fileTypeMap = new Map<string, number>();
  const fileRows = db
    .prepare(
      `SELECT content, msg_type FROM messages
       WHERE chat_username = ?
         AND msg_type IN ('图片','视频','文件','链接/文件','链接','表情','语音')`,
    )
    .all(username) as { content: string; msg_type: string }[];
  for (const r of fileRows) {
    const ext = extFromContent(r.content, r.msg_type);
    if (!ext) continue;
    fileTypeMap.set(ext, (fileTypeMap.get(ext) ?? 0) + 1);
  }
  const fileTypes: FileTypeShare[] = Array.from(fileTypeMap.entries())
    .map(([ext, n]) => ({ ext, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);

  // 11) vocab diff (private chats only)
  let vocab: { aOnly: ScoredWord[]; bOnly: ScoredWord[] } | null = null;
  if (!isGroup && stylePullMine.length > 0 && stylePullTheirs.length > 0) {
    const tfMine = termFreq(stylePullMine.filter((r) => r.msg_type === "文本").map((r) => r.content));
    const tfTheirs = termFreq(stylePullTheirs.filter((r) => r.msg_type === "文本").map((r) => r.content));
    vocab = vocabDiff(tfMine, tfTheirs, { top: 12, min: 2 });
  }

  // 12) top senders for groups
  let topSenders: SenderShare[] = [];
  if (isGroup) {
    const top20 = senderRows.filter((s) => s.sender).slice(0, 20);
    if (top20.length > 0) {
      // Match each sender's name against the contacts table to upgrade to a username link.
      const placeholders = top20.map(() => "?").join(",");
      const knownRows = db
        .prepare(
          `SELECT username, display_name FROM contacts WHERE display_name IN (${placeholders})`,
        )
        .all(...top20.map((s) => s.sender)) as { username: string; display_name: string }[];
      const knownMap = new Map(knownRows.map((r) => [r.display_name, r.username]));
      topSenders = top20.map((s) => ({
        sender: s.sender,
        n: s.n,
        knownUsername: knownMap.get(s.sender) ?? null,
      }));
    }
  }

  // 13) recent 50
  const recentRaw = db
    .prepare(
      `SELECT id, sender, msg_type, content, timestamp
       FROM messages WHERE chat_username = ?
       ORDER BY timestamp DESC LIMIT 50`,
    )
    .all(username) as { id: number; sender: string; msg_type: string; content: string; timestamp: number }[];
  const recent: RecentMessage[] = recentRaw.map((r) => ({ ...r, isMine: meSet.has(r.sender) }));

  return {
    session,
    isGroup,
    totals: {
      messages: totalsRow.messages,
      mine,
      theirs,
      minePct: totalsRow.messages > 0 ? (mine / totalsRow.messages) * 100 : 0,
      links: linksCount,
      firstTs: totalsRow.firstTs,
      lastTs: totalsRow.lastTs,
      indexedThrough: session.history_indexed_through ?? null,
    },
    msgTypeBreakdown,
    monthly,
    hourly,
    latencies,
    styleMine,
    styleTheirs,
    topics,
    topDomains,
    fileTypes,
    vocab,
    topSenders,
    recent,
    meHandles,
  };
}

/**
 * Walk back `n` months from this month inclusive and fill any gaps with zero.
 */
function fillMonths(map: Map<string, { mine: number; theirs: number }>, n: number): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  const now = new Date();
  now.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = map.get(ym);
    out.push({ ym, mine: slot?.mine ?? 0, theirs: slot?.theirs ?? 0 });
  }
  return out;
}
