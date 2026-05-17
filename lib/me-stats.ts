/**
 * "From my perspective" stats — the /me dashboard.
 *
 * Every query restricts to `sender IN (me_handles)` and the standard
 * non-archived / non-official exclusion. If no me-handles are configured the
 * page renders a guidance banner instead of the metrics.
 */

import { getDb } from "./db";
import {
  EXCLUDED_SUBQUERY,
  ensureDailyCountsFresh,
  excludedChatClause,
  excludedSubquery,
  getMeHandles,
} from "./queries";
import {
  computeLatencies,
  bucketLatencies,
  latencyStats,
  type LatencyBucket,
} from "./latency";
import {
  termFreq,
  tfidfAgainst,
  type ScoredWord,
} from "./text";
import { computeStyle, type StyleFingerprint } from "./style";
import { getCachedJSON } from "./cache";

// MeStyle is a thin alias of the shared StyleFingerprint (no `side` field on
// the /me dashboard since there's only one side). Kept as an export so older
// page-level imports continue to work.
export type MeStyle = StyleFingerprint;

export interface MeTopChat {
  username: string;
  display_name: string;
  chat_type: string;
  my_msgs: number;
  total: number;
  theirs: number;
  member_count: number | null;
  last_ts: number | null;
}

export type MeAggregation = "week" | "month" | "year";

/** Sort + series perspective for the "top chats" panels. */
export type MeTopMode = "sent" | "received";
/** Trailing window for the top-chats panel. `all` = lifetime. */
export type MeTopRange = "all" | "1y" | "6m" | "3m";
export type MeTopN = 3 | 5 | 10;

const RANGE_DAYS: Record<MeTopRange, number | null> = {
  all: null,
  "1y": 365,
  "6m": 180,
  "3m": 90,
};

export interface MeMonth {
  ym: string;
  mine: number;
  theirs: number;
}

export interface MeTimePoint {
  /** Bucket label — depends on agg: `YYYY-MM`, `YYYY-W##`, or `YYYY`. */
  label: string;
  mine: number;
  theirs: number;
  /** Their-message split by chat type. `theirsPrivate + theirsGroup + theirsOther === theirs`. */
  theirsPrivate: number;
  theirsGroup: number;
  /** Catch-all for messages from non-private/non-group chats and NULL chat_username rows. */
  theirsOther: number;
}

export interface MeHourly {
  hour: number;
  mine: number;
}

export interface MeDow {
  dow: number;
  label: string;
  mine: number;
}

export interface MeOneSided {
  username: string;
  display_name: string;
  my_msgs: number;
  theirs: number;
  last_ts: number | null;
}

export interface MeTopSeriesPoint {
  label: string;
  /** Per-username mine-count for this bucket; key is the session's username. */
  [chatUsername: string]: number | string;
}

export interface MeTopSeries {
  /** Top N chats charted (matches order in `topPrivate` / `topGroups`). */
  chats: { username: string; display_name: string; my_msgs: number }[];
  /** Pivoted series — one entry per bucket, each carrying every chat's count. */
  points: MeTopSeriesPoint[];
}

export interface MeYoYStat {
  myMessages: number;
  myMessagesPrior: number;
  totalMessages: number;
  totalMessagesPrior: number;
  mySharePct: number;
  mySharePctPrior: number;
  /** Active days in the period (mine > 0). */
  activeDays: number;
  activeDaysPrior: number;
  /** True if the previous-period sample is at least 50% of the current one. */
  reliable: boolean;
}

export interface MeStats {
  meHandles: string[];
  hasData: boolean; // false when no me-handles or zero mine messages
  totals: {
    myMessages: number;
    totalMessages: number;
    mySharePct: number;
    activeDays: number;
    longestStreak: number;
    peakHour: number;
    peakHourCount: number;
    msgsPerActiveDay: number;
  };
  /** Rolling 365-day vs prior 365-day comparison, derived from daily_counts. */
  yoy: MeYoYStat;
  monthly: MeMonth[];
  /** Aggregated activity time series — agg-controlled via `getMeStats({ agg })`. */
  series: MeTimePoint[];
  agg: MeAggregation;
  hourly: MeHourly[];
  dow: MeDow[];
  msgTypeBreakdown: { msg_type: string; n: number }[];
  topPrivate: MeTopChat[];
  topGroups: MeTopChat[];
  /** Per-bucket "you sent" series for the top private chats. */
  topPrivateSeries: MeTopSeries;
  /** Same shape for top groups. */
  topGroupSeries: MeTopSeries;
  /** Chats where the OTHER side messages you the most (sorted by theirs DESC). */
  topPrivateReceived: MeTopChat[];
  topGroupsReceived: MeTopChat[];
  /** Series of THEIR messages over time for those top-received chats. */
  topPrivateReceivedSeries: MeTopSeries;
  topGroupReceivedSeries: MeTopSeries;
  /** Active filters that produced the top-chats fields. Echoed so the UI can
   *  render its toolbar in the right state. */
  topFilters: { topN: MeTopN; range: MeTopRange };
  style: MeStyle;
  topics: ScoredWord[];
  topDomains: { domain_group: string; n: number }[];
  oneSided: {
    rows: MeOneSided[];
    totalCount: number; // chats where my_msgs >= 5 and theirs <= 1
  };
  latency: {
    meToThemHist: LatencyBucket[];
    themToMeHist: LatencyBucket[];
    meToThemMedianSec: number;
    themToMeMedianSec: number;
    sampleSize: number;
  };
  longestMessages: {
    id: number;
    chat_username: string | null;
    chat_display: string;
    len: number;
    preview: string;
    timestamp: number;
  }[];
  burst: {
    chat_username: string | null;
    chat_display: string;
    minute: string;
    n: number;
  } | null;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RECENT_LATENCY_LIMIT = 200_000;
const STYLE_SAMPLE_LIMIT = 5000;

/**
 * One-shot read. Skip me-handle config? Returns hasData=false so the page
 * can render a callout instead.
 *
 * `agg` controls how the time-series chart on /me is bucketed. Monthly is the
 * default; week / year are user-toggleable via URL param.
 */
export function getMeStats(
  opts: { agg?: MeAggregation; topN?: MeTopN; topRange?: MeTopRange } = {},
): MeStats {
  const agg: MeAggregation = opts.agg ?? "month";
  const topN: MeTopN = opts.topN ?? 5;
  const topRange: MeTopRange = opts.topRange ?? "all";
  const key = `me-stats:agg=${agg}:n=${topN}:r=${topRange}`;
  return getCachedJSON(key, () => computeMeStats(agg, topN, topRange));
}

function computeMeStats(
  agg: MeAggregation,
  topN: MeTopN,
  topRange: MeTopRange,
): MeStats {
  ensureDailyCountsFresh();
  const db = getDb();
  const me = getMeHandles();

  if (me.length === 0) return emptyStats(me, agg);

  const meIn = `IN (${me.map(() => "?").join(",")})`;
  const meSet = new Set(me);
  // Defer to the shared NULL-safe predicates from lib/queries (per AGENTS.md):
  // local copies of these strings would silently drift on a future tweak to
  // the exclusion semantics.
  const excl = EXCLUDED_SUBQUERY; // still needed for raw IN-subquery interpolation
  const chatScope = excludedChatClause();
  const chatScopeAlias = (a: string) => excludedChatClause({ alias: a });

  // ── Totals ────────────────────────────────────────────────────────────
  const totalsRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(mine), 0) AS mine,
         COALESCE(SUM(n), 0) AS total
       FROM daily_counts`,
    )
    .get() as { mine: number; total: number };

  if (totalsRow.mine === 0) return emptyStats(me, agg);

  // Rolling 365-day YoY window. `daily_counts.day` is a 'YYYY-MM-DD' local-day
  // string, so we just need string boundaries — no Unix-epoch math.
  const localDay = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const yoyRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN day >= ?                   THEN n ELSE 0 END) AS total_cur,
         SUM(CASE WHEN day >= ?                   THEN mine ELSE 0 END) AS mine_cur,
         SUM(CASE WHEN day >= ?                   AND mine > 0 THEN 1 ELSE 0 END) AS active_cur,
         SUM(CASE WHEN day >= ? AND day < ?       THEN n ELSE 0 END) AS total_prior,
         SUM(CASE WHEN day >= ? AND day < ?       THEN mine ELSE 0 END) AS mine_prior,
         SUM(CASE WHEN day >= ? AND day < ?       AND mine > 0 THEN 1 ELSE 0 END) AS active_prior
       FROM daily_counts`,
    )
    .get(
      localDay(365), localDay(365), localDay(365),
      localDay(730), localDay(365),
      localDay(730), localDay(365),
      localDay(730), localDay(365),
    ) as {
    total_cur: number | null;
    mine_cur: number | null;
    active_cur: number | null;
    total_prior: number | null;
    mine_prior: number | null;
    active_prior: number | null;
  };
  const yoyCurMine = yoyRow.mine_cur ?? 0;
  const yoyPriorMine = yoyRow.mine_prior ?? 0;
  const yoyCurTotal = yoyRow.total_cur ?? 0;
  const yoyPriorTotal = yoyRow.total_prior ?? 0;
  const yoy: MeYoYStat = {
    myMessages: yoyCurMine,
    myMessagesPrior: yoyPriorMine,
    totalMessages: yoyCurTotal,
    totalMessagesPrior: yoyPriorTotal,
    mySharePct: yoyCurTotal > 0 ? (yoyCurMine / yoyCurTotal) * 100 : 0,
    mySharePctPrior: yoyPriorTotal > 0 ? (yoyPriorMine / yoyPriorTotal) * 100 : 0,
    activeDays: yoyRow.active_cur ?? 0,
    activeDaysPrior: yoyRow.active_prior ?? 0,
    // Treat the YoY as unreliable when the prior window had < 50% of the
    // current window's activity — likely just an incomplete index, not a
    // real "you talked a lot less last year" story.
    reliable: yoyPriorMine > 0 && yoyPriorMine >= yoyCurMine * 0.5,
  };

  // Active days + longest streak via daily_counts (cheap).
  const dailyRows = db
    .prepare(`SELECT day, mine FROM daily_counts WHERE mine > 0 ORDER BY day`)
    .all() as { day: string; mine: number }[];
  const activeDays = dailyRows.length;
  const longestStreak = computeLongestStreak(dailyRows.map((r) => r.day));

  // ── Monthly + Hourly + DoW ───────────────────────────────────────────
  // Single aggregate per bucket that already breaks `theirs` down by chat
  // type. The /me chart toggles between a two-line (you / them) view and a
  // three-line (you / them-private / them-group) view; both modes read from
  // the same `series` payload.
  const aggPattern: Record<MeAggregation, string> = {
    week: "%Y-W%W",
    month: "%Y-%m",
    year: "%Y",
  };

  function pullSeries(strftimePattern: string): MeTimePoint[] {
    const rows = db
      .prepare(
        `SELECT
           strftime('${strftimePattern}', m.timestamp, 'unixepoch', 'localtime') AS label,
           SUM(CASE WHEN m.sender ${meIn} THEN 1 ELSE 0 END) AS mine,
           SUM(CASE
                 WHEN m.sender NOT ${meIn} AND s.chat_type = 'private'
                 THEN 1 ELSE 0
               END) AS theirs_private,
           SUM(CASE
                 WHEN m.sender NOT ${meIn} AND s.chat_type = 'group'
                 THEN 1 ELSE 0
               END) AS theirs_group,
           SUM(CASE
                 WHEN m.sender NOT ${meIn}
                      AND (s.chat_type IS NULL OR s.chat_type NOT IN ('private','group'))
                 THEN 1 ELSE 0
               END) AS theirs_other,
           COUNT(*) AS total
         FROM messages m
         LEFT JOIN sessions s ON s.username = m.chat_username
         WHERE ${chatScopeAlias("m")}
         GROUP BY label
         ORDER BY label`,
      )
      .all(...me, ...me, ...me, ...me) as {
      label: string;
      mine: number;
      theirs_private: number;
      theirs_group: number;
      theirs_other: number;
      total: number;
    }[];
    return rows.map((r) => ({
      label: r.label,
      mine: r.mine,
      theirs: r.total - r.mine,
      theirsPrivate: r.theirs_private,
      theirsGroup: r.theirs_group,
      theirsOther: r.theirs_other,
    }));
  }

  // `monthly` is what older callers expect (ym/mine/theirs shape); compute it
  // from the same series so we never disagree across views.
  const monthSeries = pullSeries(aggPattern.month);
  const monthly: MeMonth[] = monthSeries.map((p) => ({
    ym: p.label,
    mine: p.mine,
    theirs: p.theirs,
  }));
  const series: MeTimePoint[] =
    agg === "month" ? monthSeries : pullSeries(aggPattern[agg]);

  const hourlyRaw = db
    .prepare(
      `SELECT
         CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS hour,
         COUNT(*) AS mine
       FROM messages
       WHERE sender ${meIn}
         AND ${chatScope}
       GROUP BY hour`,
    )
    .all(...me) as { hour: number; mine: number }[];
  const hourly: MeHourly[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    mine: hourlyRaw.find((r) => r.hour === h)?.mine ?? 0,
  }));
  const peak = hourly.reduce(
    (acc, h) => (h.mine > acc.n ? { hour: h.hour, n: h.mine } : acc),
    { hour: 0, n: 0 },
  );

  const dowRaw = db
    .prepare(
      `SELECT
         CAST(strftime('%w', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS dow,
         COUNT(*) AS mine
       FROM messages
       WHERE sender ${meIn}
         AND ${chatScope}
       GROUP BY dow`,
    )
    .all(...me) as { dow: number; mine: number }[];
  const dow: MeDow[] = Array.from({ length: 7 }, (_, i) => ({
    dow: i,
    label: DOW_LABELS[i],
    mine: dowRaw.find((r) => r.dow === i)?.mine ?? 0,
  }));

  // ── Msg-type breakdown for me ────────────────────────────────────────
  const msgTypeBreakdown = db
    .prepare(
      `SELECT msg_type, COUNT(*) AS n
       FROM messages
       WHERE sender ${meIn}
         AND ${chatScope}
       GROUP BY msg_type
       ORDER BY n DESC
       LIMIT 12`,
    )
    .all(...me) as { msg_type: string; n: number }[];

  // ── Top chats: range + perspective aware ───────────────────────────
  // Range "all" can lean on the pre-aggregated `sessions.my_msg_count` +
  // `message_count` columns (cheap; covers the entire indexed history).
  // Bounded ranges need a fresh aggregate over the messages table within
  // the window — the lifetime totals don't tell us who's been active
  // recently. Both paths return the same shape.
  const rangeDays = RANGE_DAYS[topRange];
  const rangeCutoff = rangeDays ? Math.floor(Date.now() / 1000) - rangeDays * 86400 : null;

  function pickTopChats(
    chatType: "private" | "group",
    mode: MeTopMode,
    limit: number,
  ): MeTopChat[] {
    if (rangeCutoff === null) {
      // Lifetime path — read the pre-aggregated session columns. Cheap.
      const orderCol = mode === "sent" ? "my_msgs" : "theirs_count";
      const rows = db
        .prepare(
          `SELECT s.username, s.display_name, s.chat_type,
                  s.my_msg_count AS my_msgs,
                  s.message_count AS total,
                  MAX(0, s.message_count - s.my_msg_count) AS theirs_count,
                  s.member_count, s.last_timestamp AS last_ts
           FROM sessions s
           WHERE s.archived = 0
             AND s.chat_type = ?
             AND ${mode === "sent" ? "s.my_msg_count > 0" : "(s.message_count - s.my_msg_count) > 0"}
           ORDER BY ${orderCol} DESC
           LIMIT ?`,
        )
        .all(chatType, limit) as {
        username: string;
        display_name: string;
        chat_type: string;
        my_msgs: number;
        total: number;
        theirs_count: number;
        member_count: number | null;
        last_ts: number | null;
      }[];
      return rows.map((r) => ({
        username: r.username,
        display_name: r.display_name,
        chat_type: r.chat_type,
        my_msgs: r.my_msgs,
        total: r.total,
        theirs: r.theirs_count,
        member_count: r.member_count,
        last_ts: r.last_ts,
      }));
    }
    // Bounded range — sum from the messages table within the window. Uses
    // the (chat_username, timestamp DESC) covering index.
    const rows = db
      .prepare(
        `SELECT s.username, s.display_name, s.chat_type, s.member_count,
                s.last_timestamp AS last_ts,
                SUM(CASE WHEN m.sender ${meIn} THEN 1 ELSE 0 END) AS my_msgs,
                SUM(CASE WHEN m.sender NOT ${meIn} AND m.sender != '' THEN 1 ELSE 0 END)
                  + SUM(CASE WHEN m.sender = '' THEN 1 ELSE 0 END) AS theirs_count,
                COUNT(*) AS total
         FROM messages m
         JOIN sessions s ON s.username = m.chat_username
         WHERE s.archived = 0
           AND s.chat_type = ?
           AND m.timestamp >= ?
         GROUP BY s.username
         HAVING ${mode === "sent" ? "my_msgs > 0" : "theirs_count > 0"}
         ORDER BY ${mode === "sent" ? "my_msgs" : "theirs_count"} DESC
         LIMIT ?`,
      )
      .all(...me, ...me, chatType, rangeCutoff, limit) as {
      username: string;
      display_name: string;
      chat_type: string;
      member_count: number | null;
      last_ts: number | null;
      my_msgs: number;
      theirs_count: number;
      total: number;
    }[];
    return rows.map((r) => ({
      username: r.username,
      display_name: r.display_name,
      chat_type: r.chat_type,
      my_msgs: r.my_msgs,
      total: r.total,
      theirs: r.theirs_count,
      member_count: r.member_count,
      last_ts: r.last_ts,
    }));
  }

  // Pivot helper — pulls per-bucket counts for a fixed set of chats + a
  // sender filter. Used by both "sent" and "received" series.
  function buildSeries(
    chats: MeTopChat[],
    mode: MeTopMode,
  ): MeTopSeries {
    if (chats.length === 0) return { chats: [], points: [] };
    const chatPlaceholders = chats.map(() => "?").join(",");
    const senderClause = mode === "sent" ? `m.sender ${meIn}` : `m.sender NOT ${meIn}`;
    const rangeClause = rangeCutoff !== null ? "AND m.timestamp >= ?" : "";
    const rangeParam = rangeCutoff !== null ? [rangeCutoff] : [];
    const rawRows = db
      .prepare(
        `SELECT m.chat_username,
                strftime('${aggPattern[agg]}', m.timestamp, 'unixepoch', 'localtime') AS label,
                COUNT(*) AS n
         FROM messages m
         WHERE ${senderClause}
           AND m.chat_username IN (${chatPlaceholders})
           ${rangeClause}
         GROUP BY m.chat_username, label
         ORDER BY label`,
      )
      .all(
        ...me,
        ...chats.map((c) => c.username),
        ...rangeParam,
      ) as { chat_username: string; label: string; n: number }[];

    const byLabel = new Map<string, MeTopSeriesPoint>();
    for (const r of rawRows) {
      let pt = byLabel.get(r.label);
      if (!pt) {
        pt = { label: r.label } as MeTopSeriesPoint;
        for (const c of chats) pt[c.username] = 0;
        byLabel.set(r.label, pt);
      }
      pt[r.chat_username] = r.n;
    }
    const seriesChats = chats.map((r) => ({
      username: r.username,
      display_name: r.display_name,
      my_msgs: mode === "sent" ? r.my_msgs : r.theirs,
    }));
    return {
      chats: seriesChats,
      points: Array.from(byLabel.values()).sort((a, b) =>
        String(a.label).localeCompare(String(b.label)),
      ),
    };
  }

  // Pull at most 10 candidates per panel (covers topN=10 with one query).
  const shortlistLimit = Math.max(10, topN);
  const topPrivate = pickTopChats("private", "sent", shortlistLimit);
  const topPrivateReceived = pickTopChats("private", "received", shortlistLimit);
  const topGroups = pickTopChats("group", "sent", shortlistLimit);
  const topGroupsReceived = pickTopChats("group", "received", shortlistLimit);

  const topPrivateSeries = buildSeries(topPrivate.slice(0, topN), "sent");
  const topPrivateReceivedSeries = buildSeries(
    topPrivateReceived.slice(0, topN),
    "received",
  );
  const topGroupSeries = buildSeries(topGroups.slice(0, topN), "sent");
  const topGroupReceivedSeries = buildSeries(
    topGroupsReceived.slice(0, topN),
    "received",
  );

  // ── One-sided ───────────────────────────────────────────────────────
  // Chats where I sent >= 5 but barely anyone replied. Lifetime, not windowed.
  const oneSidedRows = db
    .prepare(
      `SELECT s.username, s.display_name, s.my_msg_count AS my_msgs,
              MAX(0, s.message_count - s.my_msg_count) AS theirs,
              s.last_timestamp AS last_ts
       FROM sessions s
       WHERE s.archived = 0
         AND s.chat_type = 'private'
         AND s.my_msg_count >= 5
         AND (s.message_count - s.my_msg_count) <= 1
       ORDER BY s.my_msg_count DESC
       LIMIT 12`,
    )
    .all() as MeOneSided[];
  const oneSidedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions
         WHERE archived = 0
           AND chat_type = 'private'
           AND my_msg_count >= 5
           AND (message_count - my_msg_count) <= 1`,
      )
      .get() as { n: number }
  ).n;

  // ── Style fingerprint ───────────────────────────────────────────────
  const stylePull = db
    .prepare(
      `SELECT content, msg_type FROM messages
       WHERE sender ${meIn} AND ${chatScope}
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(...me, STYLE_SAMPLE_LIMIT) as { content: string; msg_type: string }[];
  const style = computeStyle(stylePull);

  // ── Topics: my text vs everyone else's text (sampled) ──────────────
  const myText = stylePull.filter((r) => r.msg_type === "文本").map((r) => r.content);
  const theirText = db
    .prepare(
      `SELECT content FROM messages
       WHERE sender NOT ${meIn}
         AND msg_type = '文本'
         AND content != ''
         AND ${chatScope}
         AND (id % 5) = 0
       LIMIT ?`,
    )
    .all(...me, STYLE_SAMPLE_LIMIT * 2) as { content: string }[];
  const myTf = termFreq(myText);
  const theirTf = termFreq(theirText.map((r) => r.content));
  const topics =
    theirText.length > 100 ? tfidfAgainst(myTf, theirTf, { top: 40, min: 3 }) : [];

  // ── Link domains shared by me ──────────────────────────────────────
  const topDomains = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n FROM urls_dedup
       WHERE sender ${meIn}
         AND ${chatScopeAlias("urls_dedup")}
       GROUP BY domain_group
       ORDER BY n DESC
       LIMIT 12`,
    )
    .all(...me) as { domain_group: string; n: number }[];

  // ── Reply latencies (full-history, capped) ─────────────────────────
  // Pull (sender, timestamp) ordered per chat. Use the same segmented logic
  // as the contact-analytics one but across all chats.
  const latencyMsgs = db
    .prepare(
      `SELECT sender, timestamp, chat_username FROM messages
       WHERE sender != ''
         AND ${chatScope}
       ORDER BY chat_username, timestamp ASC
       LIMIT ?`,
    )
    .all(RECENT_LATENCY_LIMIT) as {
    sender: string;
    timestamp: number;
    chat_username: string | null;
  }[];
  // The SQL ORDER BY above groups by chat then time, so the cross-chat
  // boundary needs a reset (otherwise it gets counted as a multi-month
  // "reply"). Delegate to `computeLatencies` with a partition callback.
  const { themToYou: themLat, youToThem: youLat } = computeLatencies(
    latencyMsgs,
    me,
    { partition: (m) => m.chat_username },
  );
  const meStats = latencyStats(youLat);
  const themStats = latencyStats(themLat);
  // meSet is now only referenced earlier in the file (e.g. style emoji split);
  // keep it bound for those call sites. The latency walk no longer needs it.
  void meSet;

  // ── Records: longest messages I sent, busiest 1-minute burst ──────
  const longestMessages = db
    .prepare(
      `SELECT id, chat_username, chat_display, length(content) AS len,
              substr(content, 1, 100) AS preview, timestamp
       FROM messages
       WHERE sender ${meIn}
         AND ${chatScope}
         AND msg_type IN ('文本','text','文字')
         AND length(content) BETWEEN 50 AND 5000
       ORDER BY len DESC
       LIMIT 5`,
    )
    .all(...me) as MeStats["longestMessages"];

  const burst = db
    .prepare(
      `SELECT chat_username, chat_display,
              strftime('%Y-%m-%d %H:%M', timestamp, 'unixepoch', 'localtime') AS minute,
              COUNT(*) AS n
       FROM messages
       WHERE sender ${meIn}
         AND ${chatScope}
       GROUP BY chat_username, minute
       ORDER BY n DESC
       LIMIT 1`,
    )
    .get(...me) as
    | { chat_username: string | null; chat_display: string; minute: string; n: number }
    | undefined;

  const mySharePct =
    totalsRow.total > 0 ? (totalsRow.mine / totalsRow.total) * 100 : 0;
  const msgsPerActiveDay = activeDays > 0 ? totalsRow.mine / activeDays : 0;

  return {
    meHandles: me,
    hasData: true,
    totals: {
      myMessages: totalsRow.mine,
      totalMessages: totalsRow.total,
      mySharePct,
      activeDays,
      longestStreak,
      peakHour: peak.hour,
      peakHourCount: peak.n,
      msgsPerActiveDay,
    },
    yoy,
    monthly,
    series,
    agg,
    hourly,
    dow,
    msgTypeBreakdown,
    topPrivate: topPrivate.slice(0, topN),
    topGroups: topGroups.slice(0, topN),
    topPrivateSeries,
    topGroupSeries,
    topPrivateReceived: topPrivateReceived.slice(0, topN),
    topGroupsReceived: topGroupsReceived.slice(0, topN),
    topPrivateReceivedSeries,
    topGroupReceivedSeries,
    topFilters: { topN, range: topRange },
    style,
    topics,
    topDomains,
    oneSided: { rows: oneSidedRows, totalCount: oneSidedCount },
    latency: {
      meToThemHist: bucketLatencies(youLat),
      themToMeHist: bucketLatencies(themLat),
      meToThemMedianSec: meStats.median,
      themToMeMedianSec: themStats.median,
      sampleSize: youLat.length + themLat.length,
    },
    longestMessages,
    burst: burst ?? null,
  };
}

function emptyStats(meHandles: string[], agg: MeAggregation): MeStats {
  return {
    meHandles,
    hasData: false,
    totals: {
      myMessages: 0,
      totalMessages: 0,
      mySharePct: 0,
      activeDays: 0,
      longestStreak: 0,
      peakHour: 0,
      peakHourCount: 0,
      msgsPerActiveDay: 0,
    },
    yoy: {
      myMessages: 0,
      myMessagesPrior: 0,
      totalMessages: 0,
      totalMessagesPrior: 0,
      mySharePct: 0,
      mySharePctPrior: 0,
      activeDays: 0,
      activeDaysPrior: 0,
      reliable: false,
    },
    monthly: [],
    series: [],
    agg,
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, mine: 0 })),
    dow: Array.from({ length: 7 }, (_, i) => ({ dow: i, label: DOW_LABELS[i], mine: 0 })),
    msgTypeBreakdown: [],
    topPrivate: [],
    topGroups: [],
    topPrivateSeries: { chats: [], points: [] },
    topGroupSeries: { chats: [], points: [] },
    topPrivateReceived: [],
    topGroupsReceived: [],
    topPrivateReceivedSeries: { chats: [], points: [] },
    topGroupReceivedSeries: { chats: [], points: [] },
    topFilters: { topN: 5, range: "all" },
    style: {
      sampleSize: 0,
      avgChars: 0,
      emojiPerMsg: 0,
      linkPerMsg: 0,
      voiceShare: 0,
      imageShare: 0,
      stickerShare: 0,
      topEmoji: [],
    },
    topics: [],
    topDomains: [],
    oneSided: { rows: [], totalCount: 0 },
    latency: {
      meToThemHist: bucketLatencies([]),
      themToMeHist: bucketLatencies([]),
      meToThemMedianSec: 0,
      themToMeMedianSec: 0,
      sampleSize: 0,
    },
    longestMessages: [],
    burst: null,
  };
}

function computeLongestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  let longest = 1;
  let cur = 1;
  const oneDay = 86400_000;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T00:00:00`).getTime();
    const now = new Date(`${days[i]}T00:00:00`).getTime();
    if (now - prev <= oneDay + 1000) {
      cur++;
      if (cur > longest) longest = cur;
    } else {
      cur = 1;
    }
  }
  return longest;
}
