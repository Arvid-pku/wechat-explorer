/**
 * Render a self-contained light-theme HTML snapshot of a year recap.
 *
 * No Recharts / React in the output — just inline CSS + inline SVG. Should
 * open fine in any browser, can be e-mailed or zipped without a server.
 */

import { format } from "date-fns";
import { formatLatency } from "./latency";
import type { YearRecap } from "./recap";

const DOMAIN_LABELS: Record<string, string> = {
  "wechat-article": "公众号文章",
  wechat: "Weixin (其他)",
  xiaohongshu: "小红书",
  bilibili: "B 站",
  zhihu: "知乎",
  arxiv: "arXiv",
  github: "GitHub",
  huggingface: "Hugging Face",
  twitter: "Twitter / X",
};

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en").format(n);
}

export function renderRecapHtml(recap: YearRecap): string {
  const subject = recap.scopeDisplay ?? "all chats";
  const title = `${recap.year} Year in Review · ${subject}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${STYLE}
</style>
</head>
<body>
<main class="container">
  ${renderHeader(recap)}
  ${recap.ok ? renderBody(recap) : renderEmpty(recap)}
  <footer>
    <p>Generated ${esc(format(new Date(recap.computedAt), "PPpp"))} by WeChat Explorer. Local-only export.</p>
  </footer>
</main>
</body>
</html>`;
}

function renderHeader(recap: YearRecap): string {
  return `
<header class="page-header">
  <p class="eyebrow">Year in Review${recap.scopeDisplay ? ` · ${esc(recap.scopeDisplay)}` : ""}</p>
  <h1>${recap.year}</h1>
</header>
`;
}

function renderEmpty(recap: YearRecap): string {
  return `<section class="card"><p>No messages indexed for ${esc(recap.year)}.</p></section>`;
}

function renderBody(recap: YearRecap): string {
  const busiestMonth = recap.monthly.reduce(
    (a, b) => (b.total > a.total ? b : a),
    { ym: "—", total: 0, mine: 0, theirs: 0 },
  );

  return `
<section class="grid grid-4">
  ${heroCard("Messages", fmtNum(recap.totals.messages), `${fmtNum(recap.totals.mine)} you · ${fmtNum(recap.totals.theirs)} them`)}
  ${heroCard("Top contact", recap.topContacts[0]?.display_name ?? "—", recap.topContacts[0] ? `${fmtNum(recap.topContacts[0].n)} msgs` : "")}
  ${heroCard("Busiest month", busiestMonth.ym, `${fmtNum(busiestMonth.total)} msgs`)}
  ${heroCard("Longest dry streak", `${recap.totals.longestDryStreak}d`, `Active streak ${recap.totals.longestStreak}d`)}
</section>

<section class="card">
  <h2>A year of conversations</h2>
  <p class="muted">Stacked bars: your messages on top, theirs underneath. The thin line is the cumulative total.</p>
  ${monthlySvg(recap)}
</section>

<section class="card">
  <h2>When you were online</h2>
  <p class="muted">Cell darker = more messages that hour.</p>
  ${hourlyHtml(recap)}
</section>

<section class="grid grid-2">
  <div class="card">
    <h2>Top private chats</h2>
    ${barList(
      recap.topContacts.map((c) => ({
        label: c.display_name || c.username,
        n: c.n,
        sub: `${fmtNum(c.my_msgs)} yours · ${fmtNum(c.links)} links`,
      })),
    )}
  </div>
  <div class="card">
    <h2>Top groups</h2>
    ${barList(
      recap.topGroups.map((g) => ({
        label: g.display_name || g.username,
        n: g.n,
        sub: g.member_count ? `${g.member_count} members · ${fmtNum(g.my_msgs)} yours` : `${fmtNum(g.my_msgs)} yours`,
      })),
    )}
  </div>
</section>

<section class="grid grid-2">
  <div class="card">
    <h2>Top 25 link sources</h2>
    ${barList(
      recap.topDomains.map((d) => ({
        label: DOMAIN_LABELS[d.domain_group] ?? d.domain_group,
        sub: d.domain_group,
        n: d.n,
      })),
    )}
  </div>
  <div class="card">
    <h2>Records</h2>
    <ul class="records">
      ${recap.records
        .map(
          (r) => `
        <li>
          <div>
            <p class="record-label">${esc(r.label)}</p>
            ${r.detail ? `<p class="muted small">${esc(r.detail)}</p>` : ""}
          </div>
          <p class="record-value">${esc(r.value)}</p>
        </li>`,
        )
        .join("")}
    </ul>
  </div>
</section>

<section class="card">
  <h2>What you talked about</h2>
  <p class="muted">Top distinctive words.</p>
  <div class="cloud">
    ${recap.keywords
      .slice(0, 50)
      .map((w, i, arr) => {
        const min = Math.min(...arr.map((x) => x.weight));
        const max = Math.max(...arr.map((x) => x.weight));
        const range = max - min || 1;
        const fs = 11 + Math.round(((w.weight - min) / range) * 17);
        const opacity = 0.55 + ((w.weight - min) / range) * 0.45;
        return `<span class="word" style="font-size:${fs}px;opacity:${opacity.toFixed(2)};" title="${esc(w.word)} · ${w.count}× · ${w.weight.toFixed(1)}">${esc(w.word)}</span>`;
      })
      .join("\n      ")}
  </div>
</section>

<section class="grid grid-2">
  <div class="card">
    <h2>Reply latency</h2>
    <p class="muted">Median them → you ${recap.latencyMedians.themToYouSec > 0 ? esc(formatLatency(recap.latencyMedians.themToYouSec)) : "—"}, you → them ${recap.latencyMedians.youToThemSec > 0 ? esc(formatLatency(recap.latencyMedians.youToThemSec)) : "—"}.</p>
    <p class="muted small">them → you</p>
    ${histRows(recap.latencyHistThemToYou, "primary")}
    <p class="muted small" style="margin-top:12px">you → them</p>
    ${histRows(recap.latencyHistYouToThem, "muted")}
  </div>
  <div class="card">
    <h2>Latency over time</h2>
    ${recap.latencyTrend.length >= 2 ? latencyTrendSvg(recap) : `<p class="muted">Not enough data for a trend.</p>`}
  </div>
</section>

<section class="grid grid-2">
  <div class="card">
    <h2>New people in ${recap.year}</h2>
    ${
      recap.newContacts.length === 0
        ? `<p class="muted">No new contacts.</p>`
        : `<ul class="new-list">
        ${recap.newContacts
          .slice(0, 16)
          .map(
            (c) => `<li>
              <span class="new-name">${esc(c.display_name || c.username)}</span>
              <span class="muted small tab">${esc(c.chat_type)} · ${esc(format(new Date(c.first_ts * 1000), "MMM d"))} · ${fmtNum(c.n)}</span>
            </li>`,
          )
          .join("")}
      </ul>`
    }
  </div>
  <div class="card">
    <h2>First & last message</h2>
    ${bookend("First", recap.firstMessage)}
    ${bookend("Last", recap.lastMessage)}
  </div>
</section>

${
  recap.topEmojiMine.length > 0 || recap.topEmojiTheirs.length > 0
    ? `
<section class="grid grid-2">
  <div class="card">
    <h2>Your top emoji</h2>
    ${emojiRow(recap.topEmojiMine)}
  </div>
  <div class="card">
    <h2>Their top emoji</h2>
    ${emojiRow(recap.topEmojiTheirs)}
  </div>
</section>`
    : ""
}

${
  recap.busiestDay
    ? `<section class="card highlight">
  <p class="muted small">Busiest day</p>
  <h2 class="big">${esc(recap.busiestDay.day)}</h2>
  <p class="muted">${fmtNum(recap.busiestDay.n)} messages on a single day.</p>
</section>`
    : ""
}
`;
}

function heroCard(label: string, value: string, sub: string): string {
  return `<div class="card hero">
    <p class="muted small">${esc(label)}</p>
    <p class="hero-value">${esc(value)}</p>
    ${sub ? `<p class="muted small">${esc(sub)}</p>` : ""}
  </div>`;
}

function barList(rows: { label: string; n: number; sub?: string }[]): string {
  if (rows.length === 0) return `<p class="muted">No data.</p>`;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return `<ul class="bars">
    ${rows
      .map(
        (r) => `<li>
          <div class="bar-line">
            <span class="bar-label">${esc(r.label)}</span>
            <span class="bar-count">${fmtNum(r.n)}</span>
          </div>
          ${r.sub ? `<p class="muted small">${esc(r.sub)}</p>` : ""}
          <div class="bar-track"><div class="bar-fill" style="width:${(r.n / max) * 100}%"></div></div>
        </li>`,
      )
      .join("")}
  </ul>`;
}

function histRows(buckets: { label: string; n: number }[], tone: "primary" | "muted"): string {
  const max = Math.max(...buckets.map((b) => b.n), 1);
  return `<ul class="hist">
    ${buckets
      .map(
        (b) => `<li>
          <span class="hist-label">${esc(b.label)}</span>
          <span class="hist-bar">
            <span class="hist-fill ${tone}" style="width:${(b.n / max) * 100}%"></span>
          </span>
          <span class="hist-n">${fmtNum(b.n)}</span>
        </li>`,
      )
      .join("")}
  </ul>`;
}

function bookend(
  label: string,
  m: {
    chat_display: string;
    sender: string;
    content: string;
    timestamp: number;
  } | null,
): string {
  if (!m) return "";
  return `<div class="bookend">
    <p class="muted small"><strong>${esc(label)}</strong> · ${esc(m.chat_display)} · ${esc(m.sender || "—")} · ${esc(format(new Date(m.timestamp * 1000), "MMM d, HH:mm"))}</p>
    <p class="bookend-body">${esc(m.content || "(no text)")}</p>
  </div>`;
}

function emojiRow(items: { emoji: string; n: number }[]): string {
  if (items.length === 0) return `<p class="muted">No emoji.</p>`;
  const max = Math.max(...items.map((x) => x.n));
  return `<div class="emoji-row">
    ${items
      .map(
        (it) =>
          `<span class="emoji" style="opacity:${(0.4 + (it.n / max) * 0.6).toFixed(2)}">
        <span class="glyph">${esc(it.emoji)}</span>
        <span class="muted small">${fmtNum(it.n)}</span>
      </span>`,
      )
      .join("")}
  </div>`;
}

function monthlySvg(recap: YearRecap): string {
  const data = recap.monthly;
  if (data.length === 0) return `<p class="muted">No data.</p>`;
  const w = 760;
  const h = 220;
  const padL = 40;
  const padR = 60;
  const padT = 16;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxBar = Math.max(...data.map((d) => d.total), 1);
  const barW = (innerW / data.length) * 0.6;

  let running = 0;
  const cum: { x: number; y: number; cum: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    running += data[i].total;
    const x = padL + (i + 0.5) * (innerW / data.length);
    cum.push({ x, y: 0, cum: running });
  }
  const maxCum = running || 1;
  for (const p of cum) {
    p.y = padT + innerH - (p.cum / maxCum) * innerH;
  }

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxBar * i) / yTicks));

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">
    ${yTickValues
      .map((tv) => {
        const y = padT + innerH - (tv / maxBar) * innerH;
        return `<line x1="${padL}" x2="${padL + innerW}" y1="${y}" y2="${y}" stroke="#e5e5e5" stroke-dasharray="2 3"/>
        <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#737373">${tv.toLocaleString()}</text>`;
      })
      .join("\n    ")}
    ${data
      .map((d, i) => {
        const cx = padL + (i + 0.5) * (innerW / data.length);
        const x = cx - barW / 2;
        const theirsH = (d.theirs / maxBar) * innerH;
        const mineH = (d.mine / maxBar) * innerH;
        const yTheirs = padT + innerH - theirsH;
        const yMine = yTheirs - mineH;
        return `<rect x="${x}" y="${yTheirs}" width="${barW}" height="${theirsH}" fill="#737373" opacity="0.35"/>
        <rect x="${x}" y="${yMine}" width="${barW}" height="${mineH}" fill="#171717" opacity="0.85"/>
        ${i % 2 === 0 ? `<text x="${cx}" y="${h - padB + 14}" text-anchor="middle" font-size="9" fill="#737373">${d.ym.slice(5)}</text>` : ""}`;
      })
      .join("\n    ")}
    <path d="${cum.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#525252" stroke-width="1.5"/>
    ${cum.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#525252"><title>cum ${p.cum.toLocaleString()}</title></circle>`).join("")}
    <text x="${w - 4}" y="${cum[cum.length - 1].y + 3}" text-anchor="end" font-size="10" fill="#525252">cum ${cum[cum.length - 1].cum.toLocaleString()}</text>
  </svg>`;
}

function hourlyHtml(recap: YearRecap): string {
  const data = recap.hourly;
  const maxMine = Math.max(...data.map((d) => d.mine), 1);
  const maxTheirs = Math.max(...data.map((d) => d.theirs), 1);
  function cell(label: string, n: number, max: number, tone: "primary" | "muted"): string {
    const r = n === 0 ? 0 : 0.15 + (n / max) * 0.85;
    const bg = tone === "primary" ? `rgba(23,23,23,${r})` : `rgba(115,115,115,${r * 0.7})`;
    return `<div class="hour-cell" title="${esc(label)}: ${fmtNum(n)}" style="background:${bg};opacity:${n === 0 ? 0.18 : 1}"></div>`;
  }
  return `<div class="hour-grid">
    <div class="hour-label">you</div>
    <div class="hour-row">${data.map((d) => cell(`${String(d.hour).padStart(2, "0")}:00 — you`, d.mine, maxMine, "primary")).join("")}</div>
    <div class="hour-label">them</div>
    <div class="hour-row">${data.map((d) => cell(`${String(d.hour).padStart(2, "0")}:00 — them`, d.theirs, maxTheirs, "muted")).join("")}</div>
    <div></div>
    <div class="hour-row hour-axis">${data.map((d) => `<div>${d.hour % 3 === 0 ? String(d.hour).padStart(2, "0") : ""}</div>`).join("")}</div>
  </div>`;
}

function latencyTrendSvg(recap: YearRecap): string {
  const filtered = recap.latencyTrend.filter((d) => d.count > 4);
  if (filtered.length < 2) return `<p class="muted">Not enough data.</p>`;
  const w = 720;
  const h = 160;
  const padL = 40;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const yScale = (sec: number) => {
    if (sec <= 0) return innerH;
    const log = Math.log10(sec);
    const norm = Math.max(0, Math.min(1, (log - 1) / 5));
    return innerH - norm * innerH;
  };
  const xFor = (i: number) => padL + (i / Math.max(1, filtered.length - 1)) * innerW;
  const them = filtered.map((d, i) => ({ x: xFor(i), y: padT + yScale(d.themToYouMedianSec) }));
  const you = filtered.map((d, i) => ({ x: xFor(i), y: padT + yScale(d.youToThemMedianSec) }));
  const ticks = [60, 300, 1800, 3600, 14400, 86400, 259200];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">
    ${ticks
      .map((sec) => {
        const y = padT + yScale(sec);
        const lbl = sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 86400 ? `${Math.round(sec / 3600)}h` : `${Math.round(sec / 86400)}d`;
        return `<line x1="${padL}" x2="${padL + innerW}" y1="${y}" y2="${y}" stroke="#e5e5e5" stroke-dasharray="2 3"/>
        <text x="${padL - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#737373">${lbl}</text>`;
      })
      .join("\n    ")}
    <path d="${them.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#171717" stroke-width="1.5"/>
    <path d="${you.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#525252" stroke-width="1.5"/>
    ${them.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#171717"/>`).join("")}
    ${you.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#525252"/>`).join("")}
    <g transform="translate(${padL + 4}, ${padT + 4})">
      <rect width="160" height="22" fill="#ffffff" opacity="0.85" rx="4"/>
      <circle cx="8" cy="8" r="3" fill="#171717"/><text x="16" y="11" font-size="10">them → you</text>
      <circle cx="8" cy="18" r="3" fill="#525252"/><text x="16" y="21" font-size="10">you → them</text>
    </g>
  </svg>`;
}

const STYLE = `
:root {
  color-scheme: light;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #fafafa;
  color: #171717;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 32px 24px 96px;
}
.page-header { padding: 16px 0 32px; }
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  color: #737373;
}
h1 {
  margin: 8px 0 0;
  font-size: 56px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.muted { color: #737373; }
.small { font-size: 12px; }
.card {
  background: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 20px;
}
.card.hero { padding: 16px 18px; }
.hero-value {
  margin: 4px 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grid { display: grid; gap: 16px; margin-bottom: 20px; }
.grid > .card { margin-bottom: 0; }
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
.grid-4 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.bars { list-style: none; padding: 0; margin: 0; }
.bars li { padding: 6px 0; border-bottom: 1px solid #f4f4f4; }
.bars li:last-child { border-bottom: none; }
.bar-line {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  font-size: 13px; font-weight: 500;
}
.bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-count { color: #525252; font-variant-numeric: tabular-nums; }
.bar-track {
  height: 4px; background: #f4f4f4; border-radius: 999px; margin-top: 4px; overflow: hidden;
}
.bar-fill { height: 100%; background: #171717; opacity: 0.7; }
.records { list-style: none; padding: 0; margin: 0; }
.records li {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 10px; border: 1px solid #f4f4f4; border-radius: 8px; margin-bottom: 8px;
}
.record-label { margin: 0; font-weight: 500; font-size: 13px; }
.record-value { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.cloud { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; line-height: 1.1; }
.cloud .word { color: #171717; font-weight: 500; }
.hist { list-style: none; padding: 0; margin: 0; }
.hist li {
  display: grid; grid-template-columns: 60px 1fr 48px; gap: 8px; align-items: center;
  font-size: 12px; padding: 2px 0;
}
.hist-label { text-align: right; color: #737373; font-variant-numeric: tabular-nums; }
.hist-bar { background: #f4f4f4; border-radius: 4px; height: 10px; overflow: hidden; }
.hist-fill.primary { background: #171717; opacity: 0.7; height: 100%; display: block; }
.hist-fill.muted { background: #737373; opacity: 0.6; height: 100%; display: block; }
.hist-n { text-align: right; color: #737373; font-variant-numeric: tabular-nums; }
.hour-grid {
  display: grid; grid-template-columns: 64px 1fr; gap: 4px 12px; align-items: center;
}
.hour-label { color: #737373; font-size: 11px; text-align: right; }
.hour-row { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 2px; }
.hour-cell { height: 22px; border-radius: 3px; }
.hour-row.hour-axis div { text-align: center; font-size: 10px; color: #737373; }
.new-list { list-style: none; padding: 0; margin: 0; }
.new-list li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; }
.new-name { font-weight: 500; }
.tab { font-variant-numeric: tabular-nums; }
.bookend { border-left: 2px solid #d4d4d4; padding-left: 12px; margin-top: 12px; }
.bookend:first-child { margin-top: 0; }
.bookend-body { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; }
.emoji-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
.emoji { display: inline-flex; flex-direction: column; align-items: center; min-width: 48px; }
.glyph { font-size: 24px; line-height: 1; }
.highlight {
  background: linear-gradient(180deg, #fefce8 0%, #ffffff 100%);
  border-color: #fde68a;
}
.big {
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 4px 0;
}
footer {
  text-align: center;
  margin-top: 48px;
  color: #a3a3a3;
  font-size: 12px;
}
@media print {
  body { background: #ffffff; }
  .card { break-inside: avoid; }
}
`;
