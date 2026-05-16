/**
 * Read queries powering the stat-drilldown pages under /stats/<topic>.
 *
 * Each top-level function returns a single object with every panel's data so
 * a server-component can render a 5-chart dashboard in one pass.
 */

import { getDb } from "./db";
import { EXCLUDED_SUBQUERY, excludedSubquery, getMeHandles } from "./queries";
import { getCachedJSON } from "./cache";

// ────────────────────────────────────────────────────────────────────────────
// Sessions
// ────────────────────────────────────────────────────────────────────────────

export interface SessionsStats {
  totals: { total: number; active: number; archived: number };
  byType: { chat_type: string; n: number }[];
  byArchive: { kind: "Active" | "Archived"; n: number }[];
  msgsPerSessionBuckets: { label: string; n: number }[];
  lastActiveBuckets: { label: string; n: number }[];
  topGroupsBySize: { username: string; display_name: string; member_count: number }[];
  noMessageCount: number; // sessions with 0 indexed messages
  archivedReasons: { reason: string; n: number }[];
}

export function getSessionsStats(): SessionsStats {
  return getCachedJSON("stats:sessions", () => computeSessionsStats());
}

function computeSessionsStats(): SessionsStats {
  const db = getDb();
  const nowSec = Math.floor(Date.now() / 1000);

  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN archived = 0 THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived
       FROM sessions`,
    )
    .get() as { total: number; active: number; archived: number };

  const byType = db
    .prepare(
      `SELECT chat_type, COUNT(*) AS n FROM sessions
       WHERE archived = 0 GROUP BY chat_type ORDER BY n DESC`,
    )
    .all() as { chat_type: string; n: number }[];

  const byArchive = [
    { kind: "Active" as const, n: totalsRow.active },
    { kind: "Archived" as const, n: totalsRow.archived },
  ];

  const msgBuckets = [
    { min: 0, max: 1, label: "0" },
    { min: 1, max: 10, label: "1–9" },
    { min: 10, max: 100, label: "10–99" },
    { min: 100, max: 1_000, label: "100–999" },
    { min: 1_000, max: 10_000, label: "1k–10k" },
    { min: 10_000, max: 1_000_000, label: "10k+" },
  ];
  const rawCounts = db
    .prepare(`SELECT COALESCE(message_count, 0) AS n FROM sessions WHERE archived = 0`)
    .all() as { n: number }[];
  const msgsPerSessionBuckets = msgBuckets.map((b) => ({
    label: b.label,
    n: rawCounts.filter((r) => r.n >= b.min && r.n < b.max).length,
  }));
  const noMessageCount = rawCounts.filter((r) => r.n === 0).length;

  const day = 86400;
  const ageBuckets = [
    { label: "Today", from: nowSec - day, to: nowSec + day },
    { label: "Last 7 days", from: nowSec - 7 * day, to: nowSec - day },
    { label: "Last 30 days", from: nowSec - 30 * day, to: nowSec - 7 * day },
    { label: "Last 90 days", from: nowSec - 90 * day, to: nowSec - 30 * day },
    { label: "Last year", from: nowSec - 365 * day, to: nowSec - 90 * day },
    { label: "Older", from: 0, to: nowSec - 365 * day },
    { label: "Never", from: -1, to: -1 },
  ];
  const sessionRows = db
    .prepare(`SELECT last_timestamp FROM sessions WHERE archived = 0`)
    .all() as { last_timestamp: number | null }[];
  const lastActiveBuckets = ageBuckets.map((b) => ({
    label: b.label,
    n:
      b.label === "Never"
        ? sessionRows.filter((r) => r.last_timestamp == null).length
        : sessionRows.filter((r) => r.last_timestamp != null && r.last_timestamp >= b.from && r.last_timestamp < b.to).length,
  }));

  const topGroupsBySize = db
    .prepare(
      `SELECT username, display_name, COALESCE(member_count, 0) AS member_count
       FROM sessions
       WHERE chat_type = 'group' AND archived = 0 AND member_count IS NOT NULL
       ORDER BY member_count DESC
       LIMIT 10`,
    )
    .all() as { username: string; display_name: string; member_count: number }[];

  const archivedReasons = db
    .prepare(
      `SELECT COALESCE(archive_reason, '—') AS reason, COUNT(*) AS n
       FROM sessions WHERE archived = 1
       GROUP BY reason ORDER BY n DESC`,
    )
    .all() as { reason: string; n: number }[];

  return {
    totals: totalsRow,
    byType,
    byArchive,
    msgsPerSessionBuckets,
    lastActiveBuckets,
    topGroupsBySize,
    noMessageCount,
    archivedReasons,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Messages
// ────────────────────────────────────────────────────────────────────────────

export interface MessagesStats {
  total: number;
  mine: number;
  theirs: number;
  byMsgType: { msg_type: string; n: number; mine: number }[];
  byMonth: { ym: string; mine: number; theirs: number; total: number }[];
  byDow: { dow: number; label: string; n: number }[]; // 0=Sun ... 6=Sat
  byHour: { hour: number; mine: number; theirs: number }[]; // 0-23
  longest: { id: number; chat_display: string; chat_username: string | null; len: number; preview: string }[];
  bursts: { minute: string; chat_display: string; chat_username: string | null; n: number }[];
  excludedFromCount: number; // official + folded messages we left out
}

export function getMessagesStats(): MessagesStats {
  return getCachedJSON("stats:messages", () => computeMessagesStats());
}

function computeMessagesStats(): MessagesStats {
  const db = getDb();
  const meHandles = getMeHandles();
  const meIn = meHandles.length ? `IN (${meHandles.map(() => "?").join(",")})` : `IN ('')`;
  const excl = EXCLUDED_SUBQUERY;

  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})`,
    )
    .get(...meHandles) as { total: number; mine: number };

  const excludedFromCount = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE chat_username IN ${excl}`,
    )
    .get() as { n: number }).n;

  const byMsgType = db
    .prepare(
      `SELECT msg_type,
              COUNT(*) AS n,
              SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY msg_type
       ORDER BY n DESC
       LIMIT 12`,
    )
    .all(...meHandles) as { msg_type: string; n: number; mine: number }[];

  const monthRaw = db
    .prepare(
      `SELECT strftime('%Y-%m', timestamp, 'unixepoch', 'localtime') AS ym,
              COUNT(*) AS total,
              SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY ym
       ORDER BY ym`,
    )
    .all(...meHandles) as { ym: string; total: number; mine: number }[];
  const byMonth = monthRaw.map((r) => ({ ...r, theirs: r.total - r.mine }));

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowRaw = db
    .prepare(
      `SELECT CAST(strftime('%w', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS dow,
              COUNT(*) AS n
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY dow
       ORDER BY dow`,
    )
    .all() as { dow: number; n: number }[];
  const byDow = Array.from({ length: 7 }, (_, i) => {
    const r = dowRaw.find((x) => x.dow === i);
    return { dow: i, label: dowLabels[i], n: r?.n ?? 0 };
  });

  const hourRaw = db
    .prepare(
      `SELECT CAST(strftime('%H', timestamp, 'unixepoch', 'localtime') AS INTEGER) AS hour,
              COUNT(*) AS total,
              SUM(CASE WHEN sender ${meIn} THEN 1 ELSE 0 END) AS mine
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY hour`,
    )
    .all(...meHandles) as { hour: number; total: number; mine: number }[];
  const byHour = Array.from({ length: 24 }, (_, h) => {
    const r = hourRaw.find((x) => x.hour === h);
    return { hour: h, mine: r?.mine ?? 0, theirs: (r?.total ?? 0) - (r?.mine ?? 0) };
  });

  const longest = db
    .prepare(
      `SELECT id, chat_display, chat_username, length(content) AS len, substr(content, 1, 80) AS preview
       FROM messages
       WHERE msg_type IN ('文本','text','文字')
         AND (chat_username IS NULL OR chat_username NOT IN ${excl})
         AND length(content) BETWEEN 50 AND 5000
       ORDER BY len DESC
       LIMIT 5`,
    )
    .all() as { id: number; chat_display: string; chat_username: string | null; len: number; preview: string }[];

  const bursts = db
    .prepare(
      `SELECT chat_display, chat_username,
              strftime('%Y-%m-%d %H:%M', timestamp, 'unixepoch', 'localtime') AS minute,
              COUNT(*) AS n
       FROM messages
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY chat_username, minute
       ORDER BY n DESC
       LIMIT 5`,
    )
    .all() as { chat_display: string; chat_username: string | null; minute: string; n: number }[];

  return {
    total: totalsRow.total,
    mine: totalsRow.mine,
    theirs: totalsRow.total - totalsRow.mine,
    byMsgType,
    byMonth,
    byDow,
    byHour,
    longest,
    bursts,
    excludedFromCount,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Links
// ────────────────────────────────────────────────────────────────────────────

export interface LinksStats {
  total: number;
  byGroup: { domain_group: string; n: number }[];
  topDomains: { domain: string; domain_group: string; n: number }[];
  byMonth: { ym: string; n: number }[];
  topSenders: { sender: string; n: number }[];
  topChats: { chat_display: string; chat_username: string | null; n: number }[];
}

export function getLinksStats(opts: { includeArchived?: boolean } = {}): LinksStats {
  const key = `stats:links:a=${opts.includeArchived ? 1 : 0}`;
  return getCachedJSON(key, () => computeLinksStats(opts));
}

function computeLinksStats(opts: { includeArchived?: boolean } = {}): LinksStats {
  const db = getDb();
  const excl = excludedSubquery(opts);

  const total = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM urls_dedup WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})`,
    )
    .get() as { n: number }).n;

  const byGroup = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n FROM urls_dedup
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY domain_group
       ORDER BY n DESC LIMIT 12`,
    )
    .all() as { domain_group: string; n: number }[];

  const topDomains = db
    .prepare(
      `SELECT domain, domain_group, COUNT(*) AS n FROM urls_dedup
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY domain
       ORDER BY n DESC LIMIT 20`,
    )
    .all() as { domain: string; domain_group: string; n: number }[];

  const byMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', timestamp, 'unixepoch', 'localtime') AS ym, COUNT(*) AS n
       FROM urls_dedup
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY ym
       ORDER BY ym`,
    )
    .all() as { ym: string; n: number }[];

  const topSenders = db
    .prepare(
      `SELECT sender, COUNT(*) AS n FROM urls_dedup
       WHERE sender != '' AND (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY sender
       ORDER BY n DESC LIMIT 15`,
    )
    .all() as { sender: string; n: number }[];

  const topChats = db
    .prepare(
      `SELECT chat_display, chat_username, COUNT(*) AS n FROM urls_dedup
       WHERE (chat_username IS NULL OR chat_username NOT IN ${excl})
       GROUP BY chat_username, chat_display
       ORDER BY n DESC LIMIT 15`,
    )
    .all() as { chat_display: string; chat_username: string | null; n: number }[];

  return { total, byGroup, topDomains, byMonth, topSenders, topChats };
}

// ────────────────────────────────────────────────────────────────────────────
// Contacts
// ────────────────────────────────────────────────────────────────────────────

export interface ContactsStats {
  total: number;
  /** Contacts you have a 1:1 session with (sessions table chat_type='private'). */
  directMessaged: number;
  /** Contacts who are members of at least one group with you. */
  inGroupsWithYou: number;
  /** Contacts known only through groups, never via a 1:1 chat. */
  groupOnly: number;
  /** Contacts only in your address book — no 1:1 session, no group together. */
  unconnected: number;
  groupMembershipBuckets: { label: string; n: number }[];
  topGroupOverlapPeople: { username: string; display_name: string; groups: number }[];
  sessionsVsContacts: { kind: "Contacts only" | "Both" | "Sessions only"; n: number }[];
}

export function getContactsStats(): ContactsStats {
  return getCachedJSON("stats:contacts", () => computeContactsStats());
}

function computeContactsStats(): ContactsStats {
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }).n;

  const directMessaged = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts c
       WHERE EXISTS (
         SELECT 1 FROM sessions s WHERE s.username = c.username AND s.chat_type = 'private'
       )`,
    )
    .get() as { n: number }).n;

  const inGroupsWithYou = (db
    .prepare(
      `SELECT COUNT(DISTINCT member_username) AS n FROM group_members
       WHERE EXISTS (SELECT 1 FROM contacts c WHERE c.username = group_members.member_username)`,
    )
    .get() as { n: number }).n;

  const groupOnlyRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts c
       WHERE EXISTS (
         SELECT 1 FROM group_members gm WHERE gm.member_username = c.username
       )
         AND NOT EXISTS (
           SELECT 1 FROM sessions s WHERE s.username = c.username AND s.chat_type = 'private'
         )`,
    )
    .get() as { n: number };

  // 'Unconnected' from the contacts table's point of view:
  // in contacts but no 1:1 session AND not appearing in any group_members row.
  const unconnected = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts c
       WHERE NOT EXISTS (
         SELECT 1 FROM sessions s WHERE s.username = c.username AND s.chat_type = 'private'
       )
         AND NOT EXISTS (
           SELECT 1 FROM group_members gm WHERE gm.member_username = c.username
         )`,
    )
    .get() as { n: number }).n;

  // Group-overlap distribution: how many distinct groups each contact shares with you.
  const groupCounts = db
    .prepare(
      `SELECT gm.member_username, COUNT(DISTINCT gm.group_username) AS g
       FROM group_members gm
       WHERE EXISTS (SELECT 1 FROM contacts c WHERE c.username = gm.member_username)
       GROUP BY gm.member_username`,
    )
    .all() as { member_username: string; g: number }[];

  const buckets = [
    { min: 1, max: 2, label: "1 group" },
    { min: 2, max: 3, label: "2 groups" },
    { min: 3, max: 6, label: "3–5 groups" },
    { min: 6, max: 11, label: "6–10 groups" },
    { min: 11, max: 21, label: "11–20 groups" },
    { min: 21, max: 1_000, label: "21+ groups" },
  ];
  const groupMembershipBuckets = buckets.map((b) => ({
    label: b.label,
    n: groupCounts.filter((r) => r.g >= b.min && r.g < b.max).length,
  }));

  // Top people by number of shared groups — these are your "social hub" contacts.
  const topGroupOverlapPeople = db
    .prepare(
      `SELECT gm.member_username AS username,
              COALESCE(c.display_name, gm.member_display, gm.member_username) AS display_name,
              COUNT(DISTINCT gm.group_username) AS groups
       FROM group_members gm
       LEFT JOIN contacts c ON c.username = gm.member_username
       GROUP BY gm.member_username
       ORDER BY groups DESC
       LIMIT 10`,
    )
    .all() as { username: string; display_name: string; groups: number }[];

  // Cross-set: contacts table vs sessions table.
  const onlyContacts = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts c
       WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.username = c.username)`,
    )
    .get() as { n: number }).n;
  const onlySessions = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM sessions s
       WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.username = s.username)`,
    )
    .get() as { n: number }).n;
  const both = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM contacts c
       WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.username = c.username)`,
    )
    .get() as { n: number }).n;

  return {
    total,
    directMessaged,
    inGroupsWithYou,
    groupOnly: groupOnlyRow.n,
    unconnected,
    groupMembershipBuckets,
    topGroupOverlapPeople,
    sessionsVsContacts: [
      { kind: "Contacts only", n: onlyContacts },
      { kind: "Both", n: both },
      { kind: "Sessions only", n: onlySessions },
    ],
  };
}
