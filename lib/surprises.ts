/**
 * Compute "surprising" insights for the overview page — anomalies, spikes,
 * fresh contacts, and shifts in domain mix.
 *
 * Each query is small (≤ 1 quick aggregate) so the whole pass should land in
 * well under 200ms warm.
 */

import { getDb } from "./db";
import { EXCLUDED_SUBQUERY, ensureDailyCountsFresh, getMeHandles } from "./queries";
import { getCachedJSON } from "./cache";

export interface Surprise {
  kind: "spike" | "fresh-contact" | "new-domain" | "quiet-streak" | "favorite-shift" | "milestone";
  title: string;
  body: string;
  href?: string;
}

export function getSurprises(): Surprise[] {
  // Surprises has a slight time component (anchored to "today"), so we key
  // the cache by today's local date too — invalidates naturally at midnight.
  const today = new Date();
  const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return getCachedJSON(`surprises:d=${dayKey}`, () => computeSurprises());
}

function computeSurprises(): Surprise[] {
  ensureDailyCountsFresh();
  const db = getDb();
  const surprises: Surprise[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const day = 86400;

  // Local-day strings keyed against daily_counts, replacing the previous
  // full-table scan of `messages` for the past 60 days.
  const localDayKey = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dailyRows = db
    .prepare(
      `SELECT day, n FROM daily_counts WHERE day >= ? ORDER BY day DESC LIMIT 60`,
    )
    .all(localDayKey(60)) as { day: string; n: number }[];
  if (dailyRows.length > 7) {
    const sorted = [...dailyRows.map((r) => r.n)].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const recent14 = dailyRows.slice(0, 14);
    const spike = recent14
      .filter((r) => r.n > median * 2 && r.n > 40)
      .reduce((a, b) => (b.n > (a?.n ?? 0) ? b : a), undefined as { day: string; n: number } | undefined);
    if (spike) {
      const ratio = (spike.n / Math.max(median, 1)).toFixed(1);
      surprises.push({
        kind: "spike",
        title: `Spike on ${spike.day}`,
        body: `${spike.n.toLocaleString()} messages — ${ratio}× the 60-day median (${median}).`,
        href: `/calendar?year=${spike.day.slice(0, 4)}&day=${spike.day}`,
      });
    }
  }

  // --- Quiet streaks: longest run of zero-message days in last 90.
  if (dailyRows.length > 0) {
    const map = new Map(dailyRows.map((r) => [r.day, r.n]));
    let cur = 0;
    let longest = 0;
    let longestEnd: string | null = null;
    for (let i = 0; i < 90; i++) {
      const key = localDayKey(i); // local day, matches daily_counts keys
      const n = map.get(key) ?? 0;
      if (n === 0) {
        cur++;
        if (cur > longest) {
          longest = cur;
          longestEnd = key;
        }
      } else {
        cur = 0;
      }
    }
    if (longest >= 3 && longestEnd) {
      surprises.push({
        kind: "quiet-streak",
        title: `${longest}-day quiet stretch`,
        body: `Recent silence ending around ${longestEnd}.`,
        href: `/calendar?year=${longestEnd.slice(0, 4)}&day=${longestEnd}`,
      });
    }
  }

  // --- Fresh contact: someone whose first-ever message in your data landed in the last 30 days
  //     and who has > 20 messages with you since.
  const fresh = db
    .prepare(
      `SELECT s.username, s.display_name, s.chat_type,
              MIN(m.timestamp) AS first_ts,
              COUNT(*) AS n
       FROM messages m
       JOIN sessions s ON s.username = m.chat_username
       WHERE (m.chat_username IS NULL OR m.chat_username NOT IN ${EXCLUDED_SUBQUERY})
       GROUP BY s.username
       HAVING first_ts >= ? AND n >= 20
       ORDER BY n DESC
       LIMIT 1`,
    )
    .get(nowSec - 30 * day) as
    | { username: string; display_name: string; chat_type: string; first_ts: number; n: number }
    | undefined;
  if (fresh) {
    surprises.push({
      kind: "fresh-contact",
      title: `New regular: ${fresh.display_name || fresh.username}`,
      body: `${fresh.n.toLocaleString()} messages since you first connected ${formatRelative(fresh.first_ts, nowSec)}.`,
      href: `/contacts/${encodeURIComponent(fresh.username)}`,
    });
  }

  // --- Domain shift: top domain in last 14 days that's >3× its share over the prior 90 days.
  const recentDomains = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n FROM urls_dedup
       WHERE timestamp >= ? AND (chat_username IS NULL OR chat_username NOT IN ${EXCLUDED_SUBQUERY})
       GROUP BY domain_group`,
    )
    .all(nowSec - 14 * day) as { domain_group: string; n: number }[];
  const baseDomains = db
    .prepare(
      `SELECT domain_group, COUNT(*) AS n FROM urls_dedup
       WHERE timestamp < ? AND timestamp >= ? AND (chat_username IS NULL OR chat_username NOT IN ${EXCLUDED_SUBQUERY})
       GROUP BY domain_group`,
    )
    .all(nowSec - 14 * day, nowSec - 90 * day) as { domain_group: string; n: number }[];
  const recentTotal = recentDomains.reduce((a, b) => a + b.n, 0);
  const baseTotal = baseDomains.reduce((a, b) => a + b.n, 0);
  if (recentTotal > 20 && baseTotal > 20) {
    const baseMap = new Map(baseDomains.map((d) => [d.domain_group, d.n / baseTotal]));
    const shifted = recentDomains
      .map((d) => ({
        ...d,
        share: d.n / recentTotal,
        baseShare: baseMap.get(d.domain_group) ?? 0,
      }))
      .filter((d) => d.n >= 5 && d.share > 3 * (d.baseShare + 1e-3))
      .sort((a, b) => b.share - a.share)[0];
    if (shifted) {
      const factor = ((shifted.share / Math.max(shifted.baseShare, 1e-4)) || 1).toFixed(1);
      surprises.push({
        kind: "favorite-shift",
        title: `Domain trending: ${shifted.domain_group}`,
        body: `${shifted.n} links in last 14 days — ${factor}× its usual share.`,
        href: `/links/${encodeURIComponent(shifted.domain_group)}`,
      });
    }
  }

  // --- Milestone: hit a round-numbered total messages this week
  const totalThisWeek = (db
    .prepare(
      `SELECT COALESCE(SUM(n), 0) AS n FROM daily_counts WHERE day >= ?`,
    )
    .get(localDayKey(7)) as { n: number }).n;
  if (totalThisWeek >= 5000) {
    surprises.push({
      kind: "milestone",
      title: `Busy week`,
      body: `${totalThisWeek.toLocaleString()} messages in the last 7 days.`,
    });
  }

  // --- "Closest" contact this week: most exchanges with you specifically
  const meHandles = getMeHandles();
  if (meHandles.length > 0) {
    const placeholders = meHandles.map(() => "?").join(",");
    const closest = db
      .prepare(
        `SELECT s.username, s.display_name, s.chat_type,
                COUNT(*) AS total,
                SUM(CASE WHEN m.sender IN (${placeholders}) THEN 1 ELSE 0 END) AS mine
         FROM messages m
         JOIN sessions s ON s.username = m.chat_username
         WHERE m.timestamp >= ?
           AND (m.chat_username IS NULL OR m.chat_username NOT IN ${EXCLUDED_SUBQUERY})
           AND s.chat_type = 'private'
         GROUP BY s.username
         HAVING mine >= 5 AND total - mine >= 5
         ORDER BY total DESC
         LIMIT 1`,
      )
      .get(...meHandles, nowSec - 7 * day) as
      | { username: string; display_name: string; chat_type: string; total: number; mine: number }
      | undefined;
    if (closest) {
      surprises.push({
        kind: "milestone",
        title: `Most active chat this week`,
        body: `${closest.display_name || closest.username} · ${closest.total.toLocaleString()} messages (${closest.mine} from you).`,
        href: `/contacts/${encodeURIComponent(closest.username)}`,
      });
    }
  }

  return surprises.slice(0, 6);
}

function formatRelative(thenSec: number, nowSec: number): string {
  const dt = nowSec - thenSec;
  const days = Math.round(dt / 86400);
  if (days < 2) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
