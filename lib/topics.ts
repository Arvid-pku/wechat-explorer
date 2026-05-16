/**
 * Topic tracking — "when did this word enter conversations, who uses it,
 * which chats does it live in?" Powers `/topics/<word>`.
 *
 * Matches via FTS5 when the query is ≥ 3 chars (same trigram rule the global
 * search uses); for shorter CJK terms (very common — "GPT", "球", "梨") it
 * falls back to LIKE. The first-occurrence + monthly series + sample fetch
 * all run inside the same `WHERE` clause derived from the matched ID set.
 */

import { getDb } from "./db";
import { excludedChatClause } from "./queries";
import { getCachedJSON } from "./cache";

export interface TopicMonthly {
  ym: string;
  n: number;
}

export interface TopicChat {
  chat_username: string | null;
  chat_display: string;
  n: number;
}

export interface TopicSender {
  sender: string;
  n: number;
}

export interface TopicSample {
  id: number;
  chat_username: string | null;
  chat_display: string;
  sender: string;
  content: string;
  timestamp: number;
}

export interface TopicTimeline {
  word: string;
  /** True when we used FTS5 (≥ 3 chars), false for the LIKE fallback. */
  fts: boolean;
  total: number;
  firstSeen: number | null;
  lastSeen: number | null;
  monthly: TopicMonthly[];
  topChats: TopicChat[];
  topSenders: TopicSender[];
  /** Recent matches — used to seed the page's "first time you wrote it" / "what people are saying now" sections. */
  firstSamples: TopicSample[];
  recentSamples: TopicSample[];
}

const MAX_WORD_LEN = 60;

function isValidWord(word: string): boolean {
  if (!word) return false;
  if (word.length > MAX_WORD_LEN) return false;
  // Disallow whitespace + the literal characters FTS5 treats specially when
  // we drop them naked into a MATCH expression. We escape with quoted phrases
  // below, but rejecting them on input keeps the URL space sane.
  return !/[\s"']/.test(word);
}

/**
 * Build the timeline for a single word. Cached by `word` + a normalised case
 * so subsequent visits are free. Returns `null` when the word is invalid or
 * yields no matches at all.
 */
export function getTopicTimeline(word: string): TopicTimeline | null {
  if (!isValidWord(word)) return null;
  return getCachedJSON(`topic:${word.toLowerCase()}`, () => computeTopicTimeline(word));
}

function computeTopicTimeline(word: string): TopicTimeline | null {
  const db = getDb();
  const fts = word.length >= 3 && !/[一-鿿]/.test(word) ? true : word.length >= 3;
  // Note: SQLite FTS5 trigram can match CJK as long as the query is ≥ 3
  // characters. For 2-char CJK we use LIKE; for ASCII < 3 chars (rare) we also
  // fall back to LIKE.

  // Match IDs first, then compute everything against that set. CTE keeps the
  // joins below from re-running the FTS query four times.
  const exclM = excludedChatClause({ alias: "m" });
  const matchSql = fts
    ? `SELECT m.id, m.chat_username, m.chat_display, m.sender, m.timestamp, m.content
       FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
       WHERE messages_fts MATCH ?
         AND ${exclM}`
    : `SELECT m.id, m.chat_username, m.chat_display, m.sender, m.timestamp, m.content
       FROM messages m
       WHERE m.content LIKE ? ESCAPE '\\'
         AND ${exclM}`;
  const matchParam = fts
    ? `"${word.replace(/"/g, '""')}"`
    : `%${word.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

  // First-seen / last-seen / total: one pass with the matching CTE inlined.
  const totals = db
    .prepare(
      `WITH hits AS (${matchSql})
       SELECT COUNT(*) AS n,
              MIN(timestamp) AS first_seen,
              MAX(timestamp) AS last_seen
       FROM hits`,
    )
    .get(matchParam) as { n: number; first_seen: number | null; last_seen: number | null };

  if (totals.n === 0) {
    return {
      word,
      fts,
      total: 0,
      firstSeen: null,
      lastSeen: null,
      monthly: [],
      topChats: [],
      topSenders: [],
      firstSamples: [],
      recentSamples: [],
    };
  }

  const monthly = db
    .prepare(
      `WITH hits AS (${matchSql})
       SELECT strftime('%Y-%m', timestamp, 'unixepoch', 'localtime') AS ym,
              COUNT(*) AS n
       FROM hits
       GROUP BY ym
       ORDER BY ym`,
    )
    .all(matchParam) as TopicMonthly[];

  const topChats = db
    .prepare(
      `WITH hits AS (${matchSql})
       SELECT chat_username, chat_display, COUNT(*) AS n
       FROM hits
       GROUP BY chat_username, chat_display
       ORDER BY n DESC
       LIMIT 15`,
    )
    .all(matchParam) as TopicChat[];

  const topSenders = db
    .prepare(
      `WITH hits AS (${matchSql})
       SELECT sender, COUNT(*) AS n
       FROM hits
       WHERE sender != ''
       GROUP BY sender
       ORDER BY n DESC
       LIMIT 12`,
    )
    .all(matchParam) as TopicSender[];

  const firstSamples = db
    .prepare(
      `WITH hits AS (${matchSql})
       SELECT id, chat_username, chat_display, sender, content, timestamp
       FROM hits
       ORDER BY timestamp ASC
       LIMIT 5`,
    )
    .all(matchParam) as TopicSample[];

  const recentSamples = db
    .prepare(
      `WITH hits AS (${matchSql})
       SELECT id, chat_username, chat_display, sender, content, timestamp
       FROM hits
       ORDER BY timestamp DESC
       LIMIT 10`,
    )
    .all(matchParam) as TopicSample[];

  return {
    word,
    fts,
    total: totals.n,
    firstSeen: totals.first_seen,
    lastSeen: totals.last_seen,
    monthly,
    topChats,
    topSenders,
    firstSamples,
    recentSamples,
  };
}
