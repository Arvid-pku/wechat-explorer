/**
 * Data layer for the Year-in-Review recap pages.
 *
 * Aggregates everything a single recap page needs into one call, hitting the
 * messages / urls / sessions tables with parameterized prepared statements.
 * Pulls only what a given page needs — sample messages get content; pure
 * aggregates skip content to stay fast.
 *
 * Apply EXCLUDED_SUBQUERY everywhere — recap is the user's personal chat life,
 * not the firehose of official-account marketing.
 */

import { getDb } from "./db";
import { EXCLUDED_SUBQUERY, excludedSubquery, getMeHandles } from "./queries";
import { getCachedJSON } from "./cache";
import {
  tokenize,
  topByCount,
  tfidfAgainst,
  termFreq,
  topEmoji,
  type ScoredWord,
} from "./text";
import {
  computeLatencies,
  bucketLatencies,
  latencyStats,
  type LatencyBucket,
} from "./latency";

export interface RecapMonthly {
  ym: string; // YYYY-MM
  total: number;
  mine: number;
  theirs: number;
}

export interface RecapHourly {
  hour: number;
  mine: number;
  theirs: number;
}

export interface RecapContact {
  username: string;
  display_name: string;
  chat_type: string;
  n: number;
  my_msgs: number;
  links: number;
  member_count: number | null;
}

export interface RecapDomain {
  domain_group: string;
  n: number;
}

export interface RecapRecord {
  label: string;
  value: string;
  detail?: string;
  href?: string;
}

export interface RecapDayHighlight {
  day: string;
  n: number;
}

export interface RecapNewContact {
  username: string;
  display_name: string;
  chat_type: string;
  first_ts: number;
  n: number;
}

export interface RecapBookend {
  id: number;
  chat_username: string | null;
  chat_display: string;
  sender: string;
  content: string;
  timestamp: number;
}

export interface RecapLatencyTrend {
  month: string; // YYYY-MM
  themToYouMedianSec: number;
  youToThemMedianSec: number;
  count: number;
}

export interface YearRecap {
  year: number;
  /** Restrict to a single chat when present. */
  scopeUsername: string | null;
  scopeDisplay: string | null;
  ok: boolean;
  totals: {
    messages: number;
    mine: number;
    theirs: number;
    links: number;
    chats: number;
    days: number;
    longestStreak: number;
    longestDryStreak: number;
  };
  monthly: RecapMonthly[];
  hourly: RecapHourly[];
  topContacts: RecapContact[];
  topGroups: RecapContact[];
  topDomains: RecapDomain[];
  busiestDay: RecapDayHighlight | null;
  newContacts: RecapNewContact[];
  firstMessage: RecapBookend | null;
  lastMessage: RecapBookend | null;
  records: RecapRecord[];
  keywords: ScoredWord[];
  latencyHistThemToYou: LatencyBucket[];
  latencyHistYouToThem: LatencyBucket[];
  latencyMedians: {
    themToYouSec: number;
    youToThemSec: number;
    count: number;
  };
  latencyTrend: RecapLatencyTrend[];
  topEmojiMine: { emoji: string; n: number }[];
  topEmojiTheirs: { emoji: string; n: number }[];
  /** Wall-clock when this was computed; helps the HTML export. */
  computedAt: string;
}

const TEXT_TYPE_RE = /(文本|text|链接\/文件|文字|chat)/i;

interface Scope {
  yearStart: number;
  yearEnd: number;
  username: string | null;
  /** Pre-built `... NOT IN (...)` clause respecting includeArchived. */
  exclusionClause: string;
  /** Reusable subquery for ad-hoc clauses inside the function. */
  excl: string;
}

function buildScope(year: number, chatUsername: string | null, includeArchived = false): Scope {
  const yearStart = Math.floor(new Date(`${year}-01-01T00:00:00`).getTime() / 1000);
  const yearEnd = Math.floor(new Date(`${year + 1}-01-01T00:00:00`).getTime() / 1000);
  const excl = excludedSubquery({ includeArchived });
  const exclusionClause = chatUsername ? `chat_username = ?` : `(chat_username IS NULL OR chat_username NOT IN ${excl})`;
  return { yearStart, yearEnd, username: chatUsername, exclusionClause, excl };
}

function scopedParams(scope: Scope, extra: (string | number)[] = []): (string | number)[] {
  return scope.username ? [scope.username, ...extra] : extra;
}

// Recap data layer used to maintain its own in-process 5min TTL cache.
// Now it goes through `getCachedJSON` (persistent SQLite + epoch-based
// invalidation), which both survives dev-server restarts and keeps past
// years cached indefinitely until the next index / archive op. The helper
// below stays as a no-op shim for the indexer's `invalidateAllCaches()`
// call (the persistent cache invalidates itself on epoch bump).
export function invalidateRecapCache(): void {
  _yearsCache = null;
}

/**
 * Fetch the entire recap for the year (and optional chat username). Heavy
 * single-call (~5s cold on 614k messages); persistent epoch-cache means a
 * cold load only happens the first time after a new index/archive event,
 * after which it's a single SQLite row read.
 */
export function getYearRecap(
  year: number,
  chatUsername: string | null = null,
  opts: { includeArchived?: boolean } = {},
): YearRecap {
  const includeArchived = !!opts.includeArchived;
  const key = `recap:y=${year}:c=${chatUsername ?? ""}:a=${includeArchived ? 1 : 0}`;
  return getCachedJSON(key, () =>
    computeRecap(year, chatUsername, includeArchived),
  );
}

function computeRecap(
  year: number,
  chatUsername: string | null,
  includeArchived: boolean,
): YearRecap {
  const db = getDb();
  const scope = buildScope(year, chatUsername, includeArchived);
  const meHandles = getMeHandles();
  const meSet = new Set(meHandles);
  const meIn = meHandles.length
    ? `IN (${meHandles.map(() => "?").join(",")})`
    : `IN ('')`;

  // Resolve scope display name + sanity check
  let scopeDisplay: string | null = null;
  if (chatUsername) {
    const r = db
      .prepare(`SELECT display_name FROM sessions WHERE username = ?`)
      .get(chatUsername) as { display_name: string } | undefined;
    if (!r) {
      return emptyRecap(year, chatUsername, scopeDisplay);
    }
    scopeDisplay = r.display_name;
  }

  // Totals — compute mine via a single sender IN clause, derive theirs as n - mine
  const totalsRow = db
    .prepare(
      `SELECT
         COUNT(*) AS n,
         SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         COUNT(DISTINCT chat_username) AS chats,
         COUNT(DISTINCT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime')) AS days
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}`,
    )
    .get(...meHandles, scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    n: number;
    mine: number;
    chats: number;
    days: number;
  };
  if (totalsRow.n === 0) {
    return emptyRecap(year, chatUsername, scopeDisplay);
  }
  const totalsTheirs = totalsRow.n - totalsRow.mine;

  // Monthly totals
  const monthlyRaw = db
    .prepare(
      `SELECT
         strftime('%Y-%m', timestamp, 'unixepoch', 'localtime') AS ym,
         SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         COUNT(*) AS total
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY ym
       ORDER BY ym`,
    )
    .all(...meHandles, scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    ym: string;
    mine: number;
    total: number;
  }[];
  const monthlyRows: RecapMonthly[] = monthlyRaw.map((r) => ({
    ym: r.ym,
    mine: r.mine,
    theirs: r.total - r.mine,
    total: r.total,
  }));

  // Hourly aggregates
  const hourlyRaw = db
    .prepare(
      `SELECT
         CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS hour,
         SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         COUNT(*) AS total
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY hour
       ORDER BY hour`,
    )
    .all(...meHandles, scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    hour: number;
    mine: number;
    total: number;
  }[];
  const hourlyRows: RecapHourly[] = hourlyRaw.map((r) => ({
    hour: r.hour,
    mine: r.mine,
    theirs: r.total - r.mine,
  }));

  const hourly: RecapHourly[] = Array.from({ length: 24 }, (_, h) => {
    const r = hourlyRows.find((x) => x.hour === h);
    return { hour: h, mine: r?.mine ?? 0, theirs: r?.theirs ?? 0 };
  });

  // Top contacts / groups
  const topContacts: RecapContact[] = chatUsername
    ? []
    : (db
        .prepare(
          `SELECT s.username, s.display_name, s.chat_type, s.member_count,
             COUNT(m.id) AS n,
             SUM(CASE WHEN m.sender ${meIn} THEN 1 ELSE 0 END) AS my_msgs,
             COALESCE((
               SELECT COUNT(*) FROM urls_dedup u
               WHERE u.chat_username = s.username
                 AND u.timestamp >= ? AND u.timestamp < ?
             ), 0) AS links
           FROM messages m
           JOIN sessions s ON s.username = m.chat_username
           WHERE m.timestamp >= ? AND m.timestamp < ?
             AND (m.chat_username IS NULL OR m.chat_username NOT IN ${scope.excl})
             AND s.chat_type = 'private'
           GROUP BY s.username
           ORDER BY n DESC
           LIMIT 10`,
        )
        .all(
          ...meHandles,
          scope.yearStart,
          scope.yearEnd,
          scope.yearStart,
          scope.yearEnd,
        ) as RecapContact[]);

  const topGroups: RecapContact[] = chatUsername
    ? []
    : (db
        .prepare(
          `SELECT s.username, s.display_name, s.chat_type, s.member_count,
             COUNT(m.id) AS n,
             SUM(CASE WHEN m.sender ${meIn} THEN 1 ELSE 0 END) AS my_msgs,
             COALESCE((
               SELECT COUNT(*) FROM urls_dedup u
               WHERE u.chat_username = s.username
                 AND u.timestamp >= ? AND u.timestamp < ?
             ), 0) AS links
           FROM messages m
           JOIN sessions s ON s.username = m.chat_username
           WHERE m.timestamp >= ? AND m.timestamp < ?
             AND (m.chat_username IS NULL OR m.chat_username NOT IN ${scope.excl})
             AND s.chat_type = 'group'
           GROUP BY s.username
           ORDER BY n DESC
           LIMIT 10`,
        )
        .all(
          ...meHandles,
          scope.yearStart,
          scope.yearEnd,
          scope.yearStart,
          scope.yearEnd,
        ) as RecapContact[]);

  // Top domains
  const topDomains = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n
       FROM urls_dedup
       WHERE timestamp >= ? AND timestamp < ?
         AND ${chatUsername ? "chat_username = ?" : `(chat_username IS NULL OR chat_username NOT IN ${scope.excl})`}
       GROUP BY domain_group
       ORDER BY n DESC
       LIMIT 25`,
    )
    .all(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as RecapDomain[];

  // Busiest day
  const busiestRow = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS n
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY day
       ORDER BY n DESC
       LIMIT 1`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as
    | RecapDayHighlight
    | undefined;

  // Longest run / dry streak across the year (within scope)
  const dailyRows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS n
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY day
       ORDER BY day`,
    )
    .all(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    day: string;
    n: number;
  }[];

  const { longestStreak, longestDry } = computeStreaks(dailyRows, year);

  // New contacts (first message in this year). Only consider non-excluded.
  const newContacts: RecapNewContact[] = chatUsername
    ? []
    : (db
        .prepare(
          `SELECT s.username, s.display_name, s.chat_type, MIN(m.timestamp) AS first_ts, COUNT(*) AS n
           FROM messages m
           JOIN sessions s ON s.username = m.chat_username
           WHERE (m.chat_username IS NULL OR m.chat_username NOT IN ${scope.excl})
           GROUP BY s.username
           HAVING first_ts >= ? AND first_ts < ?
           ORDER BY first_ts ASC
           LIMIT 24`,
        )
        .all(scope.yearStart, scope.yearEnd) as RecapNewContact[]);

  // First / last message
  const firstMessage = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, content, timestamp
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       ORDER BY timestamp ASC
       LIMIT 1`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as RecapBookend | undefined;

  const lastMessage = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, content, timestamp
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       ORDER BY timestamp DESC
       LIMIT 1`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as RecapBookend | undefined;

  // Records — small assortment. Some require modest queries.
  const records: RecapRecord[] = [];

  // Longest message
  const longestMsg = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, content, timestamp, length(content) AS len
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
         AND msg_type IN ('文本','text','文字','链接/文件')
         AND length(content) BETWEEN 10 AND 8000
       ORDER BY len DESC
       LIMIT 1`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as
    | { id: number; chat_username: string | null; chat_display: string; sender: string; len: number; timestamp: number; content: string }
    | undefined;
  if (longestMsg) {
    records.push({
      label: "Longest message",
      value: `${longestMsg.len.toLocaleString()} chars`,
      detail: `${longestMsg.sender || "—"} · ${longestMsg.chat_display}`,
      href: longestMsg.chat_username
        ? `/contacts/${encodeURIComponent(longestMsg.chat_username)}`
        : undefined,
    });
  }

  // Most messages in one minute
  const burstRow = db
    .prepare(
      `SELECT chat_username, chat_display, sender, strftime('%Y-%m-%d %H:%M', timestamp, 'unixepoch', 'localtime') AS minute, COUNT(*) AS n
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY chat_username, minute
       ORDER BY n DESC
       LIMIT 1`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as
    | { chat_username: string | null; chat_display: string; sender: string; minute: string; n: number }
    | undefined;
  if (burstRow) {
    records.push({
      label: "Most messages in 1 minute",
      value: `${burstRow.n}`,
      detail: `${burstRow.minute} · ${burstRow.chat_display}`,
      href: burstRow.chat_username
        ? `/contacts/${encodeURIComponent(burstRow.chat_username)}`
        : undefined,
    });
  }

  // Longest day
  if (busiestRow) {
    records.push({
      label: "Busiest day",
      value: busiestRow.n.toLocaleString() + " msgs",
      detail: busiestRow.day,
      href: `/calendar?year=${year}&day=${busiestRow.day}`,
    });
  }

  // Most-active hour (across the year)
  const hottestHour = hourly.reduce(
    (acc, h) =>
      h.mine + h.theirs > acc.total ? { hour: h.hour, total: h.mine + h.theirs } : acc,
    { hour: 0, total: 0 },
  );
  if (hottestHour.total > 0) {
    records.push({
      label: "Peak hour",
      value: `${String(hottestHour.hour).padStart(2, "0")}:00`,
      detail: `${hottestHour.total.toLocaleString()} msgs`,
    });
  }

  records.push({
    label: "Total messages",
    value: totalsRow.n.toLocaleString(),
    detail: `${totalsRow.mine.toLocaleString()} yours · ${totalsTheirs.toLocaleString()} theirs`,
  });
  records.push({
    label: "Unique chats",
    value: totalsRow.chats.toLocaleString(),
  });
  records.push({
    label: "Active days",
    value: `${totalsRow.days} / 365`,
  });

  // Keywords: TF-IDF this year vs the rest of the corpus.
  // Sample to keep tokenize cost reasonable.
  const keywordRows = db
    .prepare(
      `SELECT content
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
         AND msg_type IN ('文本','text','文字')
         AND length(content) > 0
       LIMIT 12000`,
    )
    .all(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as { content: string }[];
  const baselineRows = db
    .prepare(
      `SELECT content
       FROM messages
       WHERE (timestamp < ? OR timestamp >= ?)
         AND ${chatUsername ? "chat_username = ?" : `(chat_username IS NULL OR chat_username NOT IN ${scope.excl})`}
         AND msg_type IN ('文本','text','文字')
         AND length(content) > 0
         AND (id % 10) = 0
       LIMIT 12000`,
    )
    .all(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as { content: string }[];

  const subsetTf = termFreq(keywordRows.map((r) => r.content));
  const baseTf = termFreq(baselineRows.map((r) => r.content));
  const keywords = baselineRows.length > 100
    ? tfidfAgainst(subsetTf, baseTf, { top: 50, min: 3 })
    : topByCount(subsetTf, { top: 50, min: 3 });

  // Emoji top: split by side.
  const allMsgsForEmoji = db
    .prepare(
      `SELECT sender, content
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
         AND length(content) > 0
       LIMIT 80000`,
    )
    .all(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as { sender: string; content: string }[];
  const mineEmoji = topEmoji(
    allMsgsForEmoji.filter((r) => meSet.has(r.sender)).map((r) => r.content),
    12,
  );
  const theirsEmoji = topEmoji(
    allMsgsForEmoji.filter((r) => !meSet.has(r.sender)).map((r) => r.content),
    12,
  );

  // Latency histograms (within scope, across the year)
  // For latency we need ordered messages with sender. Limit to 200k rows to be safe.
  const latencyMsgs = db
    .prepare(
      `SELECT sender, timestamp
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
         AND sender != ''
       ORDER BY ${chatUsername ? "timestamp ASC" : "chat_username, timestamp ASC"}
       LIMIT 200000`,
    )
    .all(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    sender: string;
    timestamp: number;
  }[];

  // Compute full-year latencies once. Tag each latency with the YYYY-MM of the
  // earlier message in the pair so we can bucket per-month without running 12
  // additional queries.
  const meSetLocal = new Set(meHandles);
  const themLat: number[] = [];
  const youLat: number[] = [];
  const latencyTrendMap = new Map<string, { them: number[]; you: number[] }>();

  function processSegment(seg: { sender: string; timestamp: number }[]) {
    let lastSide: "me" | "them" | null = null;
    let lastTs = 0;
    const maxGap = 7 * 86400;
    for (const m of seg) {
      const side: "me" | "them" = meSetLocal.has(m.sender) ? "me" : "them";
      if (lastSide !== null && side !== lastSide) {
        const dt = m.timestamp - lastTs;
        if (dt > 0 && dt <= maxGap) {
          // bucket by the month of the *earlier* message
          const monthKey = ymOf(lastTs);
          let bucket = latencyTrendMap.get(monthKey);
          if (!bucket) {
            bucket = { them: [], you: [] };
            latencyTrendMap.set(monthKey, bucket);
          }
          if (side === "me") {
            youLat.push(dt);
            bucket.you.push(dt);
          } else {
            themLat.push(dt);
            bucket.them.push(dt);
          }
        }
      }
      lastSide = side;
      lastTs = m.timestamp;
    }
  }

  if (chatUsername) {
    processSegment(latencyMsgs);
  } else {
    let cur: { sender: string; timestamp: number }[] = [];
    let prevTs = -1;
    for (const r of latencyMsgs) {
      if (r.timestamp < prevTs) {
        if (cur.length) processSegment(cur);
        cur = [];
      }
      cur.push(r);
      prevTs = r.timestamp;
    }
    if (cur.length) processSegment(cur);
  }
  const latencyData = { themToYou: themLat, youToThem: youLat };

  const monthList = monthlyRows.map((m) => m.ym);
  const latencyTrend: RecapLatencyTrend[] = monthList.map((ym) => {
    const r = latencyTrendMap.get(ym) ?? { them: [], you: [] };
    return {
      month: ym,
      themToYouMedianSec: latencyStats(r.them).median,
      youToThemMedianSec: latencyStats(r.you).median,
      count: r.them.length + r.you.length,
    };
  });

  const themStats = latencyStats(latencyData.themToYou);
  const youStats = latencyStats(latencyData.youToThem);

  return {
    year,
    scopeUsername: chatUsername,
    scopeDisplay,
    ok: true,
    totals: {
      messages: totalsRow.n,
      mine: totalsRow.mine,
      theirs: totalsTheirs,
      links: topDomains.reduce((a, b) => a + b.n, 0),
      chats: totalsRow.chats,
      days: totalsRow.days,
      longestStreak,
      longestDryStreak: longestDry,
    },
    monthly: monthlyRows,
    hourly,
    topContacts,
    topGroups,
    topDomains,
    busiestDay: busiestRow ?? null,
    newContacts,
    firstMessage: firstMessage ?? null,
    lastMessage: lastMessage ?? null,
    records,
    keywords,
    latencyHistThemToYou: bucketLatencies(latencyData.themToYou),
    latencyHistYouToThem: bucketLatencies(latencyData.youToThem),
    latencyMedians: {
      themToYouSec: themStats.median,
      youToThemSec: youStats.median,
      count: themStats.count + youStats.count,
    },
    latencyTrend,
    topEmojiMine: mineEmoji,
    topEmojiTheirs: theirsEmoji,
    computedAt: new Date().toISOString(),
  };
}

function emptyRecap(year: number, scopeUsername: string | null, scopeDisplay: string | null): YearRecap {
  return {
    year,
    scopeUsername,
    scopeDisplay,
    ok: false,
    totals: {
      messages: 0,
      mine: 0,
      theirs: 0,
      links: 0,
      chats: 0,
      days: 0,
      longestStreak: 0,
      longestDryStreak: 0,
    },
    monthly: [],
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, mine: 0, theirs: 0 })),
    topContacts: [],
    topGroups: [],
    topDomains: [],
    busiestDay: null,
    newContacts: [],
    firstMessage: null,
    lastMessage: null,
    records: [],
    keywords: [],
    latencyHistThemToYou: [],
    latencyHistYouToThem: [],
    latencyMedians: { themToYouSec: 0, youToThemSec: 0, count: 0 },
    latencyTrend: [],
    topEmojiMine: [],
    topEmojiTheirs: [],
    computedAt: new Date().toISOString(),
  };
}

function ymOf(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function computeStreaks(
  dailyRows: { day: string; n: number }[],
  year: number,
): { longestStreak: number; longestDry: number } {
  if (dailyRows.length === 0) return { longestStreak: 0, longestDry: 0 };
  const map = new Map(dailyRows.map((r) => [r.day, r.n]));
  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(`${year + 1}-01-01T00:00:00`);
  const today = new Date();
  const stopAt = today < end ? today : end;
  let streak = 0;
  let longest = 0;
  let dry = 0;
  let longestDry = 0;
  const cur = new Date(start);
  while (cur < stopAt) {
    const key = cur.toISOString().slice(0, 10);
    const n = map.get(key) ?? 0;
    if (n > 0) {
      streak++;
      longest = Math.max(longest, streak);
      dry = 0;
    } else {
      dry++;
      longestDry = Math.max(longestDry, dry);
      streak = 0;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { longestStreak: longest, longestDry };
}

/**
 * Lightweight previous-year baseline — just totals + monthly counts +
 * topContacts so the recap page can paint a "vs last year" delta strip
 * without paying for the full recap a second time.
 */
export interface YearBaseline {
  year: number;
  totalMessages: number;
  totalLinks: number;
  totalChats: number;
  totalDays: number;
  topContact: string | null;
}

export function getYearBaseline(
  year: number,
  chatUsername: string | null = null,
  opts: { includeArchived?: boolean } = {},
): YearBaseline {
  const includeArchived = !!opts.includeArchived;
  const key = `recap-baseline:y=${year}:c=${chatUsername ?? ""}:a=${includeArchived ? 1 : 0}`;
  return getCachedJSON(key, () => computeYearBaseline(year, chatUsername, includeArchived));
}

function computeYearBaseline(
  year: number,
  chatUsername: string | null,
  includeArchived: boolean,
): YearBaseline {
  const db = getDb();
  const scope = buildScope(year, chatUsername, includeArchived);
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS n,
              COUNT(DISTINCT chat_username) AS chats,
              COUNT(DISTINCT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime')) AS days
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    n: number;
    chats: number;
    days: number;
  };
  const links = db
    .prepare(
      `SELECT COUNT(*) AS n FROM urls_dedup
       WHERE timestamp >= ? AND timestamp < ?
         AND ${chatUsername ? "chat_username = ?" : `(chat_username IS NULL OR chat_username NOT IN ${scope.excl})`}`,
    )
    .get(scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as { n: number };

  let topContact: string | null = null;
  if (!chatUsername) {
    const r = db
      .prepare(
        `SELECT s.display_name FROM messages m
         JOIN sessions s ON s.username = m.chat_username
         WHERE m.timestamp >= ? AND m.timestamp < ?
           AND (m.chat_username IS NULL OR m.chat_username NOT IN ${scope.excl})
           AND s.chat_type = 'private'
         GROUP BY s.username
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
      )
      .get(scope.yearStart, scope.yearEnd) as { display_name: string } | undefined;
    topContact = r?.display_name ?? null;
  }

  return {
    year,
    totalMessages: totals.n,
    totalLinks: links.n,
    totalChats: totals.chats,
    totalDays: totals.days,
    topContact,
  };
}

/**
 * List the years that have at least 1 message after exclusion.
 * Cached on first call within a process.
 */
let _yearsCache: { years: number[]; computed: number } | null = null;
export function getRecapYears(): number[] {
  if (_yearsCache && Date.now() - _yearsCache.computed < 60_000) {
    return _yearsCache.years;
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(strftime('%Y', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS y
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${EXCLUDED_SUBQUERY})
       ORDER BY y DESC`,
    )
    .all() as { y: number }[];
  const years = rows.map((r) => r.y).filter((y) => y >= 2010 && y <= 2100);
  _yearsCache = { years, computed: Date.now() };
  return years;
}
