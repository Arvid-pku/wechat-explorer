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
import { EXCLUDED_SUBQUERY, getMeHandles } from "./queries";
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
  exclusionClause: string;
}

function buildScope(year: number, chatUsername: string | null): Scope {
  const yearStart = Math.floor(new Date(`${year}-01-01T00:00:00`).getTime() / 1000);
  const yearEnd = Math.floor(new Date(`${year + 1}-01-01T00:00:00`).getTime() / 1000);
  const exclusionClause = chatUsername
    ? `chat_username = ?`
    : `chat_username NOT IN ${EXCLUDED_SUBQUERY}`;
  return { yearStart, yearEnd, username: chatUsername, exclusionClause };
}

function scopedParams(scope: Scope, extra: (string | number)[] = []): (string | number)[] {
  return scope.username ? [scope.username, ...extra] : extra;
}

/**
 * Fetch the entire recap for the year (and optional chat username). Heavy
 * single-call: ~500ms warm on 614k messages.
 */
export function getYearRecap(
  year: number,
  chatUsername: string | null = null,
): YearRecap {
  const db = getDb();
  const scope = buildScope(year, chatUsername);
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

  // Totals
  const totalsRow = db
    .prepare(
      `SELECT
         COUNT(*) AS n,
         SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         SUM(CASE WHEN sender ${meIn} THEN 0 ELSE 1 END) AS theirs,
         COUNT(DISTINCT chat_username) AS chats,
         COUNT(DISTINCT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime')) AS days
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}`,
    )
    .get(...meHandles, scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as {
    n: number;
    mine: number;
    theirs: number;
    chats: number;
    days: number;
  };
  if (totalsRow.n === 0) {
    return emptyRecap(year, chatUsername, scopeDisplay);
  }

  // Monthly totals
  const monthlyRows = db
    .prepare(
      `SELECT
         strftime('%Y-%m', timestamp, 'unixepoch', 'localtime') AS ym,
         SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         SUM(CASE WHEN sender ${meIn} THEN 0 ELSE 1 END) AS theirs,
         COUNT(*) AS total
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY ym
       ORDER BY ym`,
    )
    .all(...meHandles, scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as RecapMonthly[];

  // Hourly aggregates
  const hourlyRows = db
    .prepare(
      `SELECT
         CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS hour,
         SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine,
         SUM(CASE WHEN sender ${meIn} THEN 0 ELSE 1 END) AS theirs
       FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND ${scope.exclusionClause}
       GROUP BY hour
       ORDER BY hour`,
    )
    .all(...meHandles, scope.yearStart, scope.yearEnd, ...scopedParams(scope)) as RecapHourly[];

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
               SELECT COUNT(*) FROM urls u
               WHERE u.chat_username = s.username
                 AND u.timestamp >= ? AND u.timestamp < ?
             ), 0) AS links
           FROM messages m
           JOIN sessions s ON s.username = m.chat_username
           WHERE m.timestamp >= ? AND m.timestamp < ?
             AND m.chat_username NOT IN ${EXCLUDED_SUBQUERY}
             AND s.chat_type = 'private'
           GROUP BY s.username
           ORDER BY n DESC
           LIMIT 10`,
        )
        .all(
          scope.yearStart,
          scope.yearEnd,
          ...meHandles,
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
               SELECT COUNT(*) FROM urls u
               WHERE u.chat_username = s.username
                 AND u.timestamp >= ? AND u.timestamp < ?
             ), 0) AS links
           FROM messages m
           JOIN sessions s ON s.username = m.chat_username
           WHERE m.timestamp >= ? AND m.timestamp < ?
             AND m.chat_username NOT IN ${EXCLUDED_SUBQUERY}
             AND s.chat_type = 'group'
           GROUP BY s.username
           ORDER BY n DESC
           LIMIT 10`,
        )
        .all(
          scope.yearStart,
          scope.yearEnd,
          ...meHandles,
          scope.yearStart,
          scope.yearEnd,
        ) as RecapContact[]);

  // Top domains
  const topDomains = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n
       FROM urls
       WHERE timestamp >= ? AND timestamp < ?
         AND ${chatUsername ? "chat_username = ?" : `chat_username NOT IN ${EXCLUDED_SUBQUERY}`}
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
           WHERE m.chat_username NOT IN ${EXCLUDED_SUBQUERY}
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
    detail: `${totalsRow.mine.toLocaleString()} yours · ${totalsRow.theirs.toLocaleString()} theirs`,
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
         AND ${chatUsername ? "chat_username = ?" : `chat_username NOT IN ${EXCLUDED_SUBQUERY}`}
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

  let latencyData: { themToYou: number[]; youToThem: number[] };
  if (chatUsername) {
    latencyData = computeLatencies(latencyMsgs, meHandles);
  } else {
    // For year-wide we need to segment per chat to avoid alternation across chats.
    // Cheap: get per-chat ranges by sorting by chat_username then ts. But we don't
    // have chat_username in the result above; do a simpler heuristic: split when
    // ts decreases (chat boundary). Then run computeLatencies per segment.
    const segments: { sender: string; timestamp: number }[][] = [];
    let cur: { sender: string; timestamp: number }[] = [];
    let prevTs = -1;
    for (const r of latencyMsgs) {
      if (r.timestamp < prevTs) {
        if (cur.length) segments.push(cur);
        cur = [];
      }
      cur.push(r);
      prevTs = r.timestamp;
    }
    if (cur.length) segments.push(cur);
    const them: number[] = [];
    const you: number[] = [];
    for (const seg of segments) {
      const { themToYou, youToThem } = computeLatencies(seg, meHandles);
      them.push(...themToYou);
      you.push(...youToThem);
    }
    latencyData = { themToYou: them, youToThem: you };
  }

  // Latency trend by month (median)
  const latencyTrendMap = new Map<string, { them: number[]; you: number[] }>();
  // We can recompute by month using the same segmentation: simpler to bucket
  // each latency by the timestamp of the *replied-to* message month.
  // Since computeLatencies doesn't surface the ts, we'll do a per-month pass.
  const monthList = monthlyRows.map((m) => m.ym);
  for (const ym of monthList) {
    const start = Math.floor(new Date(`${ym}-01T00:00:00`).getTime() / 1000);
    const [y, mo] = ym.split("-").map(Number);
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const end = Math.floor(new Date(`${next}T00:00:00`).getTime() / 1000);
    const rows = db
      .prepare(
        `SELECT sender, timestamp
         FROM messages
         WHERE timestamp >= ? AND timestamp < ?
           AND ${scope.exclusionClause}
           AND sender != ''
         ORDER BY ${chatUsername ? "timestamp ASC" : "chat_username, timestamp ASC"}
         LIMIT 40000`,
      )
      .all(start, end, ...scopedParams(scope)) as {
      sender: string;
      timestamp: number;
    }[];
    if (rows.length < 20) continue;
    const segments: typeof rows[] = [];
    let cur: typeof rows = [];
    let prevTs = -1;
    for (const r of rows) {
      if (r.timestamp < prevTs) {
        if (cur.length) segments.push(cur);
        cur = [];
      }
      cur.push(r);
      prevTs = r.timestamp;
    }
    if (cur.length) segments.push(cur);
    const them: number[] = [];
    const you: number[] = [];
    for (const seg of segments) {
      const { themToYou, youToThem } = computeLatencies(seg, meHandles);
      them.push(...themToYou);
      you.push(...youToThem);
    }
    latencyTrendMap.set(ym, { them, you });
  }
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
      theirs: totalsRow.theirs,
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
       WHERE chat_username NOT IN ${EXCLUDED_SUBQUERY}
       ORDER BY y DESC`,
    )
    .all() as { y: number }[];
  const years = rows.map((r) => r.y).filter((y) => y >= 2010 && y <= 2100);
  _yearsCache = { years, computed: Date.now() };
  return years;
}
