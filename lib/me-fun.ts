/**
 * "Did you know" — dense set of personality-rich records computed from the
 * indexed corpus. The /me page renders these as a compact info grid; each
 * row is a single fact with a label, headline value, a bit of context, and
 * (optionally) a link into the rest of the explorer for drill-down.
 *
 * Why a separate module instead of folding into me-stats? Two reasons:
 * 1. The cache key here is parameter-free (just the global me-handles +
 *    epoch state), so it's reused across every (agg, topN, topRange)
 *    combination of /me — much higher cache hit rate than the bundled
 *    me-stats key.
 * 2. The query mix is heterogeneous (sessions scans, daily_counts scans,
 *    one window-functions walk over messages). Streaming it as its own
 *    `<Suspense>` boundary on /me lets the rest of the page paint while
 *    these load.
 */

import { getDb } from "./db";
import {
  EXCLUDED_SUBQUERY,
  ensureDailyCountsFresh,
  getMeHandles,
} from "./queries";
import { getCachedJSON } from "./cache";

export interface FunFact {
  /** Short noun phrase (label) — kept stable in English; UI provides a zh translation
   *  by looking up `key` in the i18n dictionary. */
  key: string;
  /** Headline shown big. Already formatted (number, name, date). */
  value: string;
  /** One-line context. Date, count, ratio — whatever's useful. Optional. */
  sub?: string;
  /** Where to drill in — usually `/contacts/<u>` or `/calendar?day=…&chat=…`. */
  href?: string;
}

export interface MeFunFacts {
  hasData: boolean;
  /** Records keyed on time — busiest day, longest silence, earliest/latest send. */
  timeMarkers: FunFact[];
  /** Per-person highlights — who-talks-most, balance, oldest, newest. */
  interactions: FunFact[];
  /** Single-event records — longest message, biggest minute-burst. */
  records: FunFact[];
  /** Coverage / scope — number of years, distinct chats, etc. */
  scope: FunFact[];
}

const MAX_TEXT_SAMPLE = 8_000;

export function getMeFunFacts(): MeFunFacts {
  return getCachedJSON("me-fun-facts", () => computeMeFunFacts());
}

function computeMeFunFacts(): MeFunFacts {
  ensureDailyCountsFresh();
  const db = getDb();
  const me = getMeHandles();
  const meIn = me.length ? `IN (${me.map(() => "?").join(",")})` : `IN ('')`;
  const excl = EXCLUDED_SUBQUERY;

  // Bail-out: if there's no message data the page just shows a callout.
  const totalRow = db
    .prepare(
      `SELECT COALESCE(SUM(n), 0) AS total, COALESCE(SUM(mine), 0) AS mine
       FROM daily_counts`,
    )
    .get() as { total: number; mine: number };
  if (totalRow.total === 0) {
    return {
      hasData: false,
      timeMarkers: [],
      interactions: [],
      records: [],
      scope: [],
    };
  }

  const fmt = (n: number) => new Intl.NumberFormat("en").format(n);

  // ─── A. Time markers ──────────────────────────────────────────────────
  const timeMarkers: FunFact[] = [];

  // A1: busiest day overall.
  const busiest = db
    .prepare(`SELECT day, n FROM daily_counts ORDER BY n DESC LIMIT 1`)
    .get() as { day: string; n: number } | undefined;
  if (busiest) {
    timeMarkers.push({
      key: "fun.busiestDay",
      value: busiest.day,
      sub: `${fmt(busiest.n)} msgs`,
      href: `/calendar?year=${busiest.day.slice(0, 4)}&day=${busiest.day}`,
    });
  }

  // A2: your busiest send-day.
  const busiestMine = db
    .prepare(
      `SELECT day, mine FROM daily_counts WHERE mine > 0 ORDER BY mine DESC LIMIT 1`,
    )
    .get() as { day: string; mine: number } | undefined;
  if (busiestMine) {
    timeMarkers.push({
      key: "fun.busiestMineDay",
      value: busiestMine.day,
      sub: `${fmt(busiestMine.mine)} from you`,
      href: `/calendar?year=${busiestMine.day.slice(0, 4)}&day=${busiestMine.day}`,
    });
  }

  // A3: day with the most new chats opened. `sessions.first_msg_timestamp`
  // is the earliest indexed timestamp for that chat, so the GROUP-BY here
  // counts "chats that first appeared on this day".
  const newPeopleDay = db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', first_msg_timestamp, 'unixepoch', 'localtime') AS day,
         COUNT(*) AS n
       FROM sessions
       WHERE first_msg_timestamp IS NOT NULL
         AND archived = 0
         AND chat_type IN ('private', 'group')
       GROUP BY day
       ORDER BY n DESC
       LIMIT 1`,
    )
    .get() as { day: string; n: number } | undefined;
  if (newPeopleDay && newPeopleDay.n > 1) {
    timeMarkers.push({
      key: "fun.newPeopleDay",
      value: newPeopleDay.day,
      sub: `${fmt(newPeopleDay.n)} new chats opened`,
      href: `/calendar?year=${newPeopleDay.day.slice(0, 4)}&day=${newPeopleDay.day}`,
    });
  }

  // A4: longest silence — walk daily_counts looking for the longest gap
  // between non-zero days. (`day` is YYYY-MM-DD so ordering is lexicographic.)
  const allDays = db
    .prepare(`SELECT day, n FROM daily_counts ORDER BY day`)
    .all() as { day: string; n: number }[];
  let longestDry = 0;
  let dryEnd: string | null = null;
  let curDry = 0;
  let curDryStart: string | null = null;
  for (const row of allDays) {
    if (row.n === 0) {
      if (curDry === 0) curDryStart = row.day;
      curDry++;
      if (curDry > longestDry) {
        longestDry = curDry;
        dryEnd = row.day;
      }
    } else {
      curDry = 0;
      curDryStart = null;
    }
  }
  if (longestDry >= 3 && dryEnd) {
    timeMarkers.push({
      key: "fun.longestSilence",
      value: `${longestDry} ${longestDry === 1 ? "day" : "days"}`,
      sub: `ended ${dryEnd}`,
      href: `/calendar?year=${dryEnd.slice(0, 4)}&day=${dryEnd}`,
    });
  }

  // A5 + A6: earliest / latest send time across all days. Walks `sender IN
  // (me)` via the sender index, then picks the time-of-day extreme.
  if (me.length > 0) {
    const extreme = db
      .prepare(
        `SELECT
           strftime('%H:%M', timestamp, 'unixepoch', 'localtime') AS hhmm,
           strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
           chat_display, chat_username,
           (CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) * 60
            + CAST(strftime('%M', timestamp, 'unixepoch', 'localtime') AS INTEGER)) AS minute_of_day
         FROM messages
         WHERE sender ${meIn}
         ORDER BY minute_of_day ASC
         LIMIT 1`,
      )
      .get(...me) as
      | { hhmm: string; day: string; chat_display: string; chat_username: string | null; minute_of_day: number }
      | undefined;
    if (extreme) {
      timeMarkers.push({
        key: "fun.earliestSend",
        value: extreme.hhmm,
        sub: `${extreme.day} · ${extreme.chat_display}`,
        href: extreme.chat_username
          ? `/contacts/${encodeURIComponent(extreme.chat_username)}`
          : undefined,
      });
    }
    const late = db
      .prepare(
        `SELECT
           strftime('%H:%M', timestamp, 'unixepoch', 'localtime') AS hhmm,
           strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
           chat_display, chat_username,
           (CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) * 60
            + CAST(strftime('%M', timestamp, 'unixepoch', 'localtime') AS INTEGER)) AS minute_of_day
         FROM messages
         WHERE sender ${meIn}
         ORDER BY minute_of_day DESC
         LIMIT 1`,
      )
      .get(...me) as
      | { hhmm: string; day: string; chat_display: string; chat_username: string | null; minute_of_day: number }
      | undefined;
    if (late) {
      timeMarkers.push({
        key: "fun.latestSend",
        value: late.hhmm,
        sub: `${late.day} · ${late.chat_display}`,
        href: late.chat_username
          ? `/contacts/${encodeURIComponent(late.chat_username)}`
          : undefined,
      });
    }
  }

  // ─── B. People records ────────────────────────────────────────────────
  const interactions: FunFact[] = [];

  // B1: who messages you most (lifetime theirs).
  const theirsTop = db
    .prepare(
      `SELECT username, display_name, (message_count - my_msg_count) AS theirs
       FROM sessions
       WHERE chat_type = 'private' AND archived = 0
         AND (message_count - my_msg_count) > 0
       ORDER BY theirs DESC LIMIT 1`,
    )
    .get() as { username: string; display_name: string; theirs: number } | undefined;
  if (theirsTop) {
    interactions.push({
      key: "fun.theyMessageMost",
      value: theirsTop.display_name || theirsTop.username,
      sub: `${fmt(theirsTop.theirs)} msgs to you`,
      href: `/contacts/${encodeURIComponent(theirsTop.username)}`,
    });
  }

  // B2: who you message most.
  const mineTop = db
    .prepare(
      `SELECT username, display_name, my_msg_count
       FROM sessions
       WHERE chat_type = 'private' AND archived = 0
         AND my_msg_count > 0
       ORDER BY my_msg_count DESC LIMIT 1`,
    )
    .get() as { username: string; display_name: string; my_msg_count: number } | undefined;
  if (mineTop) {
    interactions.push({
      key: "fun.youMessageMost",
      value: mineTop.display_name || mineTop.username,
      sub: `${fmt(mineTop.my_msg_count)} from you`,
      href: `/contacts/${encodeURIComponent(mineTop.username)}`,
    });
  }

  // B3 + B4: chattiest / most-concise person. Avg text length sampled from
  // their text-type messages in their busiest 1:1 chats. Only consider chats
  // with enough sample to be meaningful (≥ 50 text msgs from them).
  const avgRows = db
    .prepare(
      `SELECT s.username, s.display_name,
              AVG(length(m.content)) AS avg_chars,
              COUNT(*) AS n
       FROM messages m
       JOIN sessions s ON s.username = m.chat_username
       WHERE m.sender NOT ${meIn}
         AND m.sender != ''
         AND m.msg_type = '文本'
         AND s.chat_type = 'private'
         AND s.archived = 0
       GROUP BY s.username
       HAVING n >= 50
       ORDER BY avg_chars DESC
       LIMIT 1`,
    )
    .all(...me) as { username: string; display_name: string; avg_chars: number; n: number }[];
  if (avgRows[0]) {
    interactions.push({
      key: "fun.chattiest",
      value: avgRows[0].display_name || avgRows[0].username,
      sub: `avg ${Math.round(avgRows[0].avg_chars)} chars · ${fmt(avgRows[0].n)} text msgs`,
      href: `/contacts/${encodeURIComponent(avgRows[0].username)}`,
    });
  }
  const conciseRows = db
    .prepare(
      `SELECT s.username, s.display_name,
              AVG(length(m.content)) AS avg_chars,
              COUNT(*) AS n
       FROM messages m
       JOIN sessions s ON s.username = m.chat_username
       WHERE m.sender NOT ${meIn}
         AND m.sender != ''
         AND m.msg_type = '文本'
         AND s.chat_type = 'private'
         AND s.archived = 0
       GROUP BY s.username
       HAVING n >= 50
       ORDER BY avg_chars ASC
       LIMIT 1`,
    )
    .all(...me) as { username: string; display_name: string; avg_chars: number; n: number }[];
  if (conciseRows[0]) {
    interactions.push({
      key: "fun.mostConcise",
      value: conciseRows[0].display_name || conciseRows[0].username,
      sub: `avg ${conciseRows[0].avg_chars.toFixed(1)} chars · ${fmt(conciseRows[0].n)} text msgs`,
      href: `/contacts/${encodeURIComponent(conciseRows[0].username)}`,
    });
  }

  // B5: most lopsided 1:1 — extreme my-share. Filter to chats with ≥ 50
  // total messages so a 5-msg test chat doesn't dominate.
  const lopsided = db
    .prepare(
      `SELECT username, display_name, my_msg_count, message_count,
              (1.0 * my_msg_count / message_count) AS my_share
       FROM sessions
       WHERE chat_type = 'private' AND archived = 0
         AND message_count >= 50
         AND my_msg_count > 0
       ORDER BY my_share DESC LIMIT 1`,
    )
    .get() as { username: string; display_name: string; my_msg_count: number; message_count: number; my_share: number } | undefined;
  if (lopsided) {
    interactions.push({
      key: "fun.mostLopsided",
      value: lopsided.display_name || lopsided.username,
      sub: `you ${(lopsided.my_share * 100).toFixed(0)}% · ${fmt(lopsided.my_msg_count)}/${fmt(lopsided.message_count)}`,
      href: `/contacts/${encodeURIComponent(lopsided.username)}`,
    });
  }

  // B6: most balanced 1:1 (my_share closest to 0.5).
  const balanced = db
    .prepare(
      `SELECT username, display_name, my_msg_count, message_count,
              ABS(0.5 - 1.0 * my_msg_count / message_count) AS dev
       FROM sessions
       WHERE chat_type = 'private' AND archived = 0
         AND message_count >= 200
         AND my_msg_count > 0
       ORDER BY dev ASC LIMIT 1`,
    )
    .get() as { username: string; display_name: string; my_msg_count: number; message_count: number; dev: number } | undefined;
  if (balanced) {
    interactions.push({
      key: "fun.mostBalanced",
      value: balanced.display_name || balanced.username,
      sub: `you ${((balanced.my_msg_count / balanced.message_count) * 100).toFixed(0)}% · ${fmt(balanced.message_count)} total`,
      href: `/contacts/${encodeURIComponent(balanced.username)}`,
    });
  }

  // B7: oldest active contact. Earliest first_msg_timestamp that's still
  // active (last activity in last 365 days).
  const oldest = db
    .prepare(
      `SELECT username, display_name, first_msg_timestamp, last_timestamp
       FROM sessions
       WHERE chat_type = 'private' AND archived = 0
         AND first_msg_timestamp IS NOT NULL
         AND last_timestamp IS NOT NULL
         AND last_timestamp >= (strftime('%s', 'now') - 86400 * 365)
       ORDER BY first_msg_timestamp ASC LIMIT 1`,
    )
    .get() as { username: string; display_name: string; first_msg_timestamp: number; last_timestamp: number } | undefined;
  if (oldest) {
    const since = new Date(oldest.first_msg_timestamp * 1000);
    const ageYears = (Date.now() / 1000 - oldest.first_msg_timestamp) / (86400 * 365);
    interactions.push({
      key: "fun.oldestActive",
      value: oldest.display_name || oldest.username,
      sub: `since ${since.toISOString().slice(0, 10)} · ${ageYears.toFixed(1)}y`,
      href: `/contacts/${encodeURIComponent(oldest.username)}`,
    });
  }

  // B8: new regular — first message in last 90d, message_count ≥ 20.
  const newRegular = db
    .prepare(
      `SELECT username, display_name, first_msg_timestamp, message_count
       FROM sessions
       WHERE chat_type = 'private' AND archived = 0
         AND first_msg_timestamp >= (strftime('%s', 'now') - 86400 * 90)
         AND message_count >= 20
       ORDER BY message_count DESC LIMIT 1`,
    )
    .get() as { username: string; display_name: string; first_msg_timestamp: number; message_count: number } | undefined;
  if (newRegular) {
    const daysAgo = Math.round(
      (Date.now() / 1000 - newRegular.first_msg_timestamp) / 86400,
    );
    interactions.push({
      key: "fun.newRegular",
      value: newRegular.display_name || newRegular.username,
      sub: `${daysAgo}d ago · ${fmt(newRegular.message_count)} msgs already`,
      href: `/contacts/${encodeURIComponent(newRegular.username)}`,
    });
  }

  // ─── C. Message-level + burst records ────────────────────────────────
  const records: FunFact[] = [];

  // C1: longest single text message (anyone's).
  const longest = db
    .prepare(
      `SELECT id, chat_username, chat_display, sender, length(content) AS len,
              substr(content, 1, 60) AS preview
       FROM messages
       WHERE msg_type = '文本'
         AND length(content) BETWEEN 100 AND 20000
         AND (chat_username IS NULL OR chat_username NOT IN ${excl})
       ORDER BY len DESC LIMIT 1`,
    )
    .get() as
    | { id: number; chat_username: string | null; chat_display: string; sender: string; len: number; preview: string }
    | undefined;
  if (longest) {
    interactions.push({
      key: "fun.longestSingle",
      value: `${fmt(longest.len)} chars`,
      sub: `${longest.sender || "—"} · ${longest.chat_display}`,
      href: `/messages/${longest.id}`,
    });
  }

  // C2: your longest single message.
  if (me.length > 0) {
    const longestMine = db
      .prepare(
        `SELECT id, chat_username, chat_display, length(content) AS len
         FROM messages
         WHERE sender ${meIn}
           AND msg_type = '文本'
           AND length(content) BETWEEN 100 AND 20000
         ORDER BY len DESC LIMIT 1`,
      )
      .get(...me) as
      | { id: number; chat_username: string | null; chat_display: string; len: number }
      | undefined;
    if (longestMine) {
      records.push({
        key: "fun.longestMine",
        value: `${fmt(longestMine.len)} chars`,
        sub: `to ${longestMine.chat_display}`,
        href: `/messages/${longestMine.id}`,
      });
    }
  }

  // C3: most messages in a single minute (anyone).
  const burst = db
    .prepare(
      `SELECT chat_username, chat_display,
              strftime('%Y-%m-%d %H:%M', timestamp, 'unixepoch', 'localtime') AS minute,
              COUNT(*) AS n
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY chat_username, minute
       ORDER BY n DESC LIMIT 1`,
    )
    .get() as
    | { chat_username: string | null; chat_display: string; minute: string; n: number }
    | undefined;
  if (burst) {
    records.push({
      key: "fun.minuteBurst",
      value: `${fmt(burst.n)} msgs/min`,
      sub: `${burst.minute} · ${burst.chat_display}`,
      href: burst.chat_username ? `/contacts/${encodeURIComponent(burst.chat_username)}` : undefined,
    });
  }

  // C4: most concurrent chats in one hour bucket (proxy: distinct chats
  // with at least one message in that hour). Lifetime — gives a sense of
  // "the most overloaded hour of your life".
  const concurrent = db
    .prepare(
      `SELECT strftime('%Y-%m-%d %H', timestamp, 'unixepoch', 'localtime') AS hour_bucket,
              COUNT(DISTINCT chat_username) AS n
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY hour_bucket
       ORDER BY n DESC LIMIT 1`,
    )
    .get() as { hour_bucket: string; n: number } | undefined;
  if (concurrent) {
    records.push({
      key: "fun.concurrentHour",
      value: `${concurrent.n} chats`,
      sub: `${concurrent.hour_bucket}:00`,
      href: `/calendar?year=${concurrent.hour_bucket.slice(0, 4)}&day=${concurrent.hour_bucket.slice(0, 10)}`,
    });
  }

  // C5: most concurrent chats in one day. Bigger window, still useful.
  const concurrentDay = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') AS day,
              COUNT(DISTINCT chat_username) AS n
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY day
       ORDER BY n DESC LIMIT 1`,
    )
    .get() as { day: string; n: number } | undefined;
  if (concurrentDay) {
    records.push({
      key: "fun.concurrentDay",
      value: `${concurrentDay.n} chats`,
      sub: concurrentDay.day,
      href: `/calendar?year=${concurrentDay.day.slice(0, 4)}&day=${concurrentDay.day}`,
    });
  }

  // C6: longest dry streak between any two messages in a single chat — a
  // "we hadn't talked in years and then…" signal. Sampled to keep cost
  // bounded (heavy chats only).
  const reunion = db
    .prepare(
      `WITH gaps AS (
         SELECT chat_username, chat_display, timestamp,
                timestamp - LAG(timestamp) OVER (
                  PARTITION BY chat_username ORDER BY timestamp
                ) AS gap
         FROM messages
         WHERE chat_username IN (
           SELECT username FROM sessions
           WHERE chat_type = 'private' AND archived = 0 AND message_count >= 100
         )
       )
       SELECT chat_username, chat_display, gap, timestamp
       FROM gaps WHERE gap IS NOT NULL AND gap > 86400 * 60
       ORDER BY gap DESC LIMIT 1`,
    )
    .get() as
    | { chat_username: string; chat_display: string; gap: number; timestamp: number }
    | undefined;
  if (reunion) {
    const days = Math.round(reunion.gap / 86400);
    const when = new Date(reunion.timestamp * 1000).toISOString().slice(0, 10);
    records.push({
      key: "fun.longestReunionGap",
      value: `${fmt(days)} days`,
      sub: `${reunion.chat_display} · resumed ${when}`,
      href: `/contacts/${encodeURIComponent(reunion.chat_username)}`,
    });
  }

  // ─── D. Scope ─────────────────────────────────────────────────────────
  const scope: FunFact[] = [];

  // D1: years span (oldest to newest indexed day).
  const span = db
    .prepare(
      `SELECT MIN(day) AS lo, MAX(day) AS hi, COUNT(*) AS days FROM daily_counts`,
    )
    .get() as { lo: string; hi: string; days: number } | undefined;
  if (span) {
    const years = (new Date(span.hi).getTime() - new Date(span.lo).getTime()) / (1000 * 86400 * 365);
    scope.push({
      key: "fun.spanYears",
      value: `${years.toFixed(1)}y`,
      sub: `${span.lo} → ${span.hi}`,
    });
  }
  // D2: active-day coverage.
  const activeDaysRow = db
    .prepare(`SELECT COUNT(*) AS n FROM daily_counts WHERE n > 0`)
    .get() as { n: number };
  if (span && activeDaysRow.n > 0) {
    const totalDays =
      Math.round(
        (new Date(span.hi).getTime() - new Date(span.lo).getTime()) / (1000 * 86400),
      ) + 1;
    const coverage = (activeDaysRow.n / totalDays) * 100;
    scope.push({
      key: "fun.activeCoverage",
      value: `${coverage.toFixed(0)}%`,
      sub: `${fmt(activeDaysRow.n)} active of ${fmt(totalDays)} days`,
    });
  }
  // D3: distinct chats indexed.
  const distinctChats = (db
    .prepare(
      `SELECT COUNT(DISTINCT chat_username) AS n FROM messages
       WHERE chat_username IS NOT NULL
         AND (chat_username NOT IN ${excl})`,
    )
    .get() as { n: number }).n;
  if (distinctChats > 0) {
    scope.push({
      key: "fun.distinctChats",
      value: fmt(distinctChats),
      sub: "chats with indexed messages",
      href: "/contacts",
    });
  }
  // D4: distinct senders observed (group members + private peers).
  const distinctSenders = (db
    .prepare(
      `SELECT COUNT(DISTINCT sender) AS n FROM messages
       WHERE sender != ''
         AND (chat_username IS NULL OR chat_username NOT IN ${excl})`,
    )
    .get() as { n: number }).n;
  if (distinctSenders > 0) {
    scope.push({
      key: "fun.distinctSenders",
      value: fmt(distinctSenders),
      sub: "different people in your chats",
    });
  }

  return { hasData: true, timeMarkers, interactions, records, scope };
}

