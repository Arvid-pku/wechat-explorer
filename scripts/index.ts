#!/usr/bin/env bun
import { runQuickIndex, runDeepIndex, type IndexerProgress } from "../lib/indexer";
import { dbPath, getDb } from "../lib/db";

const args = new Set(process.argv.slice(2));
const mode = args.has("--deep") ? "deep" : args.has("--full") ? "full" : "quick";
const recentDays = args.has("--all") ? 0 : 365;

function log(p: IndexerProgress) {
  const detail = p.detail ? `  ${p.detail}` : "";
  const progress = p.total ? ` (${p.current}/${p.total})` : "";
  console.log(`[${p.stage}]${progress}${detail}`);
}

console.log(`Index DB: ${dbPath()}`);
console.log(`Mode: ${mode}`);

const start = Date.now();
if (mode === "quick" || mode === "full") {
  const r = await runQuickIndex(log);
  console.log(
    `\n✓ Quick index done in ${(r.elapsedMs / 1000).toFixed(1)}s — ${r.sessions} sessions, ${r.contacts} contacts, ${r.links} link messages`,
  );
}
if (mode === "deep" || mode === "full") {
  console.log(`\nDeep indexing (recent ${recentDays} days)...`);
  const r = await runDeepIndex({ recentDays, types: ["private", "group"] }, log);
  console.log(`\n✓ Deep index done — ${r.sessionsProcessed} sessions processed`);
}

const db = getDb();
const counts = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM sessions) AS sessions,
    (SELECT COUNT(*) FROM contacts) AS contacts,
    (SELECT COUNT(*) FROM messages) AS messages,
    (SELECT COUNT(*) FROM urls) AS urls
`).get();
console.log(`\nTotals:`, counts);
console.log(`Wall: ${((Date.now() - start) / 1000).toFixed(1)}s`);
