/**
 * Calendar-specific read queries: day-detail, on-this-day, hourly histograms,
 * TF-IDF keyword extraction. Shared with the Recap (Phase F) pages.
 *
 * All queries pre-filter via EXCLUDED_SUBQUERY so archived / official /
 * folded sessions don't bleed into "personal" analytics.
 */
import { getDb } from "./db";
import { EXCLUDED_SUBQUERY, ensureDailyCountsFresh, excludedSubquery, getMeHandles } from "./queries";
import { tokenize, tfidfAgainst, type ScoredWord } from "./text";
import { getCachedJSON } from "./cache";

/**
 * Words that survive the shared `tokenize` stopword list but are still
 * conversational filler. Filtered locally in the calendar clouds so we don't
 * mutate the shared STOPWORDS set (and break tests against it).
 */
const CALENDAR_STOPWORDS = new Set<string>([
  // Chinese conversational filler / hedging
  "感觉", "觉得", "现在", "确实", "好像", "嗯嗯", "就是", "还是", "不是",
  "可能", "其实", "应该", "可以", "怎么", "什么", "为什么", "因为",
  "比如", "比如说", "或者", "然后", "但是", "不过", "所以", "如果",
  "之前", "之后", "之间", "今年", "明年", "去年",
  "他们", "我们", "你们", "自己", "大家", "他", "她", "它",
  "知道", "看到", "听到", "想到", "说到", "搞", "弄", "做",
  "有点", "有些", "一点", "一些", "一下", "一直", "一样", "一起", "一个",
  "差不多", "可能性", "情况下", "时候", "问题", "这样", "那样", "这种", "那种",
  "这么", "那么", "怎样", "怎么样", "这里", "那里", "我的", "你的", "他的",
  "不知道", "不太", "不会", "不能", "不要", "不想", "不用", "不行",
  "已经", "正在", "刚刚", "刚才", "马上", "立刻",
  "是不是", "是的", "对的", "对吧", "好吧", "好的", "好像", "可以的",
  "的话", "之类", "等等", "啥", "诶", "嗯", "哦哦", "嗯嗯嗯", "哈哈哈",
  "直接", "肯定", "当然", "估计", "据说", "听说",
  "上面", "下面", "前面", "后面", "里面", "外面", "中间",
  "想要", "要是", "要不", "要不要", "需要", "希望",
  "看一下", "看看", "试试", "想想", "说一下",
  // "我X / 你X / 都X / 也X" patterns that leaked through as bigrams
  "我也", "我是", "我在", "我去", "我有", "我就", "我还", "我都", "我说", "我想",
  "我不", "我看", "我觉", "我得", "我会", "我刚", "我已经",
  "你也", "你是", "你在", "你有", "你说", "你想", "你不",
  "都是", "都有", "都在", "都没", "也是", "也有", "也在", "也可以", "也不",
  "还有", "还是", "很多", "很好", "很大", "很小", "很久",
  "可以", "可以的",
  // High-volume chat words that still leak through
  "老师", "同学", "朋友", "时间", "事情", "东西", "地方", "今天", "昨天", "明天",
  "周五", "周一", "周二", "周三", "周四", "周六", "周日", "星期",
  "上午", "下午", "晚上", "中午", "早上",
  "家伙",
  // Western filler
  "hh", "xs", "lol", "haha", "yeah", "yep", "nope", "kinda", "sorta",
  "okay", "right", "really", "actually", "probably", "obviously", "definitely",
  "basically", "literally", "totally",
  "thing", "things", "stuff", "way", "ways", "kind", "sort", "bit",
  "make", "made", "makes", "going", "got", "get", "gets", "getting",
  "tho", "even", "still", "always", "never",
  // Common standalone single-syllable Chinese
  "嘛", "呀", "唉", "啧", "嘻", "嗷",
]);

function filterCalendarStopwords(words: ScoredWord[]): ScoredWord[] {
  return words.filter((w) => !CALENDAR_STOPWORDS.has(w.word));
}

export interface ChatGroup {
  chat_username: string | null;
  chat_display: string;
  chat_type: string | null;
  n: number;
  last_ts: number;
  sample: {
    id: number;
    sender: string;
    msg_type: string;
    content: string;
    timestamp: number;
  }[];
}

export interface DayKeywordResult {
  words: ScoredWord[];
  subsetSize: number;
  baselineSize: number;
}

export interface OnThisDayYear {
  year: number;
  day: string;
  total: number;
  samples: {
    chat_display: string;
    chat_username: string | null;
    sender: string;
    content: string;
    timestamp: number;
  }[];
}

export interface HourlyBucket {
  hour: number;
  n: number;
}

/**
 * Convert a YYYY-MM-DD local-time day string into a [startSec, endSec) unix range.
 */
function dayBounds(day: string): { startSec: number; endSec: number } {
  const startMs = new Date(`${day}T00:00:00`).getTime();
  const startSec = Math.floor(startMs / 1000);
  return { startSec, endSec: startSec + 86400 };
}

/**
 * Convert a calendar year to a [startSec, endSec) unix range in local time.
 * Used to swap `strftime('%Y', ...)` full-table scans for index-friendly
 * range scans on the `idx_messages_ts` index.
 */
function yearBounds(year: number): { startSec: number; endSec: number } {
  const startSec = Math.floor(new Date(year, 0, 1, 0, 0, 0, 0).getTime() / 1000);
  const endSec = Math.floor(new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime() / 1000);
  return { startSec, endSec };
}

/**
 * Build the WHERE clause + params for "this chat" vs "all chats post-exclusion".
 *
 * When `chatUsername` is set, every calendar read narrows to that one chat —
 * the contact-detail page links into `/calendar?chat=<username>` so the heatmap
 * / day detail / on-this-day all reflect just that conversation.
 *
 * Returns `{ clause, params }` so callers can interpolate the clause into
 * their SQL and append `params` after their own bound args.
 *
 * Default alias is `chat_username`; pass `alias` if your query already aliases
 * messages (e.g. `m.chat_username`).
 */
function scopeClause(
  chatUsername: string | null | undefined,
  opts: { includeArchived?: boolean } = {},
  alias = "chat_username",
): { clause: string; params: (string | number)[] } {
  if (chatUsername) {
    return { clause: `${alias} = ?`, params: [chatUsername] };
  }
  const sub = excludedSubquery(opts);
  return { clause: `(${alias} IS NULL OR ${alias} NOT IN ${sub})`, params: [] };
}

/**
 * One row per chat that had messages on `day`, sorted by message count desc,
 * plus up to 8 latest sample messages per chat.
 */
export function getDayMessagesGrouped(
  day: string,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): ChatGroup[] {
  const db = getDb();
  const { startSec, endSec } = dayBounds(day);
  const scope = scopeClause(opts.chatUsername, opts, "m.chat_username");

  // First: aggregate per-chat counts.
  const groups = db
    .prepare(
      `SELECT
         m.chat_username AS chat_username,
         m.chat_display AS chat_display,
         (SELECT chat_type FROM sessions WHERE username = m.chat_username) AS chat_type,
         COUNT(*) AS n,
         MAX(m.timestamp) AS last_ts
       FROM messages m
       WHERE m.timestamp >= ? AND m.timestamp < ?
         AND ${scope.clause}
       GROUP BY m.chat_username, m.chat_display
       ORDER BY n DESC, last_ts DESC
       LIMIT 200`,
    )
    .all(startSec, endSec, ...scope.params) as Omit<ChatGroup, "sample">[];

  if (groups.length === 0) return [];

  // Then: pull up to 8 latest messages per (chat_username, chat_display) pair.
  // We use one prepared statement per group; with usually <50 chats per day this
  // stays under our perf budget and avoids a complex window-function query.
  const sampleStmt = db.prepare(
    `SELECT id, sender, msg_type, content, timestamp
     FROM messages
     WHERE timestamp >= ? AND timestamp < ?
       AND chat_display = ?
       AND (
         (? IS NULL AND chat_username IS NULL) OR chat_username = ?
       )
     ORDER BY timestamp DESC
     LIMIT 8`,
  );

  return groups.map((g) => ({
    ...g,
    sample: sampleStmt.all(
      startSec,
      endSec,
      g.chat_display,
      g.chat_username,
      g.chat_username,
    ) as ChatGroup["sample"],
  }));
}

/**
 * 24-bucket hour histogram for a single day (post-exclusion).
 */
export function getDayHourly(
  day: string,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): HourlyBucket[] {
  const db = getDb();
  const { startSec, endSec } = dayBounds(day);
  const scope = scopeClause(opts.chatUsername, opts);
  const rows = db
    .prepare(
      `SELECT CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS hour,
              COUNT(*) AS n
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.clause}
       GROUP BY hour
       ORDER BY hour`,
    )
    .all(startSec, endSec, ...scope.params) as HourlyBucket[];
  const filled: HourlyBucket[] = [];
  const map = new Map(rows.map((r) => [r.hour, r.n]));
  for (let h = 0; h < 24; h++) filled.push({ hour: h, n: map.get(h) ?? 0 });
  return filled;
}

/**
 * Pull every text-message content string in the [startSec, endSec) window.
 */
function pullTextContent(
  startSec: number,
  endSec: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): string[] {
  const db = getDb();
  const scope = scopeClause(opts.chatUsername, opts);
  const rows = db
    .prepare(
      `SELECT content FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND msg_type = '文本'
         AND content != ''
         AND ${scope.clause}`,
    )
    .all(startSec, endSec, ...scope.params) as { content: string }[];
  return rows.map((r) => r.content);
}

/**
 * Sampled text-message baseline over the trailing 365 days, taking every 50th
 * row by timestamp parity. Caps roughly at ~10–20k rows out of 600k+, keeping
 * tokenization well under the 2s perf budget.
 *
 * We cache the baseline by trailing-window anchor so repeated day lookups
 * within the same dev session don't re-tokenize 10k rows.
 */
const baselineCache = new Map<string, Map<string, number>>();

/**
 * Clear all in-process calendar caches. Called from the indexer after a
 * fresh run so day / year keywords don't reflect stale tokenisations.
 */
export function invalidateCalendarCaches(): void {
  baselineCache.clear();
  _allTimeBaseline = null;
  _coveredYears = null;
  _coveredYearsByChat.clear();
}

function getSampledBaselineMap(anchorSec: number): Map<string, number> {
  const key = `b:${Math.floor(anchorSec / 86400)}`;
  const cached = baselineCache.get(key);
  if (cached) return cached;

  const db = getDb();
  const fromSec = anchorSec - 365 * 86400;
  const rows = db
    .prepare(
      `SELECT content FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND msg_type = '文本'
         AND content != ''
         AND (timestamp % 50) = 0
         AND (chat_username IS NULL OR chat_username NOT IN ${EXCLUDED_SUBQUERY})`,
    )
    .all(fromSec, anchorSec) as { content: string }[];

  const map = new Map<string, number>();
  for (const r of rows) {
    for (const t of tokenize(r.content)) {
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  // Single-entry cache: drop older keys.
  baselineCache.clear();
  baselineCache.set(key, map);
  return map;
}

/**
 * Top-30 TF-IDF terms scoring `day`'s text against a sampled 365-day baseline.
 */
export function getDayKeywords(
  day: string,
  _year: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): DayKeywordResult {
  const { startSec, endSec } = dayBounds(day);
  const docs = pullTextContent(startSec, endSec, opts);
  const subset = new Map<string, number>();
  for (const d of docs) {
    for (const t of tokenize(d)) subset.set(t, (subset.get(t) ?? 0) + 1);
  }
  // Keep the baseline global even when scoped to one chat — the user wants
  // to see what's distinctive about that chat's day vs the rest of their life.
  const baseline = getSampledBaselineMap(endSec);
  const raw = tfidfAgainst(subset, baseline, { top: 60, min: 2 });
  const words = filterCalendarStopwords(raw).slice(0, 30);
  return {
    words,
    subsetSize: docs.length,
    baselineSize: Array.from(baseline.values()).reduce((a, b) => a + b, 0),
  };
}

/**
 * Top-30 TF-IDF terms for an entire year vs a global baseline. The baseline is
 * the sampled all-time corpus (every 50th text message); the subset is the
 * year's text-message tokens (also sampled when the year is huge — we cap the
 * subset at a few thousand messages by hashing on timestamp parity so we stay
 * fast on ~400k-row years).
 */
export function getYearKeywords(
  year: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): DayKeywordResult {
  const key = `year-keywords:y=${year}:c=${opts.chatUsername ?? ""}:a=${opts.includeArchived ? 1 : 0}`;
  return getCachedJSON(key, () => computeYearKeywords(year, opts));
}

function computeYearKeywords(
  year: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): DayKeywordResult {
  const db = getDb();
  const { startSec, endSec } = yearBounds(year);
  const scope = scopeClause(opts.chatUsername, opts);
  // When scoped to one chat we don't need to sample — even a heavy chat is
  // usually << 50k messages. When global we keep the % 10 trick to stay fast.
  const sampleFilter = opts.chatUsername ? "" : "AND (timestamp % 10) = 0";
  const yearDocs = db
    .prepare(
      `SELECT content FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND msg_type = '文本'
         AND content != ''
         ${sampleFilter}
         AND ${scope.clause}`,
    )
    .all(startSec, endSec, ...scope.params) as { content: string }[];

  const subset = new Map<string, number>();
  for (const d of yearDocs) {
    for (const t of tokenize(d.content)) subset.set(t, (subset.get(t) ?? 0) + 1);
  }

  // Baseline = all-time minus the year. We start from the cached all-time
  // sampled map and subtract the year's tokens. Both maps use the same `% 10`
  // sampling rate, so subtraction is meaningful.
  const allTime = getAllTimeBaselineMap();
  const baseline = new Map<string, number>();
  for (const [k, v] of allTime) {
    const sub = subset.get(k) ?? 0;
    if (v > sub) baseline.set(k, v - sub);
  }

  const raw = tfidfAgainst(subset, baseline, { top: 80, min: 5 });
  const words = filterCalendarStopwords(raw).slice(0, 30);
  return {
    words,
    subsetSize: yearDocs.length,
    baselineSize: Array.from(baseline.values()).reduce((a, b) => a + b, 0),
  };
}

let _allTimeBaseline: Map<string, number> | null = null;
/**
 * All-time text baseline, sampled at every 10th row by `timestamp % 10 = 0`.
 *
 * The sampling rate matters: the year subset is also sampled at `% 10`, so a
 * matching baseline-rate keeps subset:baseline counts on the same order of
 * magnitude. A baseline that was too sparse made common filler words score
 * high in the year cloud.
 */
function getAllTimeBaselineMap(): Map<string, number> {
  if (_allTimeBaseline) return _allTimeBaseline;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT content FROM messages
       WHERE msg_type = '文本'
         AND content != ''
         AND (timestamp % 10) = 0
         AND (chat_username IS NULL OR chat_username NOT IN ${EXCLUDED_SUBQUERY})`,
    )
    .all() as { content: string }[];
  const map = new Map<string, number>();
  for (const r of rows) {
    for (const t of tokenize(r.content)) {
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  _allTimeBaseline = map;
  return map;
}

/**
 * For the same MM-DD in years before `currentYear`, return per-year totals and
 * up to 4 sample messages. Only years that actually have data on that MM-DD
 * are returned.
 */
export function getOnThisDay(
  monthDay: string,
  currentYear: number,
  limit = 6,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): OnThisDayYear[] {
  // monthDay = "MM-DD" — sanity-validate so we never interpolate user input.
  if (!/^\d{2}-\d{2}$/.test(monthDay)) return [];
  const db = getDb();
  const scope = scopeClause(opts.chatUsername, opts);
  const scopeM = scopeClause(opts.chatUsername, opts, "m.chat_username");
  // Scope to this chat's covered years when filtering — otherwise we iterate
  // every year and probe ones with no data for this chat.
  const candidates = opts.chatUsername
    ? getCoveredYears({ chatUsername: opts.chatUsername })
    : getCoveredYears();
  const countStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM messages
     WHERE timestamp >= ? AND timestamp < ?
       AND ${scope.clause}`,
  );
  const sampleStmt = db.prepare(
    `SELECT m.chat_display, m.chat_username, m.sender, m.content, m.timestamp
     FROM messages m
     WHERE m.timestamp >= ? AND m.timestamp < ?
       AND m.msg_type IN ('文本')
       AND m.content != ''
       AND ${scopeM.clause}
     ORDER BY m.timestamp DESC
     LIMIT 4`,
  );

  const out: OnThisDayYear[] = [];
  for (const year of candidates) {
    if (year >= currentYear) continue;
    if (out.length >= limit) break;
    const day = `${year}-${monthDay}`;
    const { startSec, endSec } = dayBounds(day);
    const total = (countStmt.get(startSec, endSec, ...scope.params) as { n: number }).n;
    if (total === 0) continue;
    const samples = sampleStmt.all(
      startSec,
      endSec,
      ...scopeM.params,
    ) as OnThisDayYear["samples"];
    out.push({ year, day, total, samples });
  }
  return out;
}

/**
 * Distinct years that have at least one message post-exclusion. Cached on
 * first call; the dev server can pick up new years after a fresh deep index by
 * importing this module again (auto on file change).
 */
let _coveredYears: number[] | null = null;
// Per-chat covered-year cache. Bounded by the number of distinct chat scopes
// users actually browse during a session; cleared on indexer rerun.
const _coveredYearsByChat = new Map<string, number[]>();

export function getCoveredYears(
  opts: { chatUsername?: string | null } = {},
): number[] {
  if (opts.chatUsername) {
    const cached = _coveredYearsByChat.get(opts.chatUsername);
    if (cached) return cached;
  } else if (_coveredYears) {
    return _coveredYears;
  }
  const db = getDb();
  const scope = scopeClause(opts.chatUsername, {});
  const bounds = db
    .prepare(
      `SELECT MIN(timestamp) AS lo, MAX(timestamp) AS hi FROM messages
       WHERE ${scope.clause}`,
    )
    .get(...scope.params) as { lo: number | null; hi: number | null };
  if (!bounds.lo || !bounds.hi) {
    if (opts.chatUsername) {
      _coveredYearsByChat.set(opts.chatUsername, []);
      return [];
    }
    _coveredYears = [];
    return _coveredYears;
  }
  const loYear = new Date(bounds.lo * 1000).getFullYear();
  const hiYear = new Date(bounds.hi * 1000).getFullYear();
  const probe = db.prepare(
    `SELECT 1 FROM messages
     WHERE timestamp >= ? AND timestamp < ?
       AND ${scope.clause}
     LIMIT 1`,
  );
  const out: number[] = [];
  for (let y = hiYear; y >= loYear; y--) {
    const { startSec, endSec } = yearBounds(y);
    if (probe.get(startSec, endSec, ...scope.params)) out.push(y);
  }
  if (opts.chatUsername) {
    _coveredYearsByChat.set(opts.chatUsername, out);
  } else {
    _coveredYears = out;
  }
  return out;
}

export interface YearSummary {
  total: number;
  busiestDay: { day: string; n: number } | null;
  uniqueChats: number;
  myMessages: number;
  myShare: number; // 0..1
}

/**
 * Cheap summary statistics for the year switcher header.
 */
export function getYearSummary(
  year: number,
  opts: { includeArchived?: boolean; chatUsername?: string | null } = {},
): YearSummary {
  ensureDailyCountsFresh();
  const db = getDb();
  const { startSec, endSec } = yearBounds(year);
  const scope = scopeClause(opts.chatUsername, opts);

  // Global fast path: daily_counts rollup. Chat-scoped: count from messages
  // directly — there's no per-chat rollup. The range is bounded by the year
  // and the chat_username equality narrows it to that one chat.
  let total: number;
  if (!opts.chatUsername) {
    const totalCol = opts.includeArchived ? "n_with_archived" : "n";
    total = (
      db
        .prepare(
          `SELECT COALESCE(SUM(${totalCol}), 0) AS n FROM daily_counts
           WHERE day >= ? AND day < ?`,
        )
        .get(`${year}-01-01`, `${year + 1}-01-01`) as { n: number }
    ).n;
  } else {
    total = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages
           WHERE timestamp >= ? AND timestamp < ?
             AND ${scope.clause}`,
        )
        .get(startSec, endSec, ...scope.params) as { n: number }
    ).n;
  }

  const busiestRow = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.clause}
       GROUP BY day
       ORDER BY n DESC
       LIMIT 1`,
    )
    .get(startSec, endSec, ...scope.params) as { day: string; n: number } | undefined;

  const uniqueChats = opts.chatUsername
    ? (total > 0 ? 1 : 0)
    : (
        db
          .prepare(
            `SELECT COUNT(DISTINCT chat_display) AS n FROM messages
             WHERE timestamp >= ? AND timestamp < ?
               AND ${scope.clause}`,
          )
          .get(startSec, endSec, ...scope.params) as { n: number }
      ).n;

  const me = getMeHandles();
  let myMessages = 0;
  if (me.length > 0) {
    const placeholders = me.map(() => "?").join(",");
    myMessages = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages
           WHERE timestamp >= ? AND timestamp < ?
             AND sender IN (${placeholders})
             AND ${scope.clause}`,
        )
        .get(startSec, endSec, ...me, ...scope.params) as { n: number }
    ).n;
  }

  return {
    total,
    busiestDay: busiestRow ?? null,
    uniqueChats,
    myMessages,
    myShare: total > 0 ? myMessages / total : 0,
  };
}
