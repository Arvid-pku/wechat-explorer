/**
 * Persistent query cache with epoch-based invalidation.
 *
 * Concept: most aggregates over the WeChat corpus are immutable once
 * computed — the underlying messages don't change unless we re-index or
 * the user archives/restores a session. Both events are explicit, so we
 * bump a small integer epoch counter on each and stamp every cached row
 * with the epochs in force at the time of compute. Reads check the row's
 * epochs against the live ones; if either has advanced the cache is
 * considered stale and the producer is re-run.
 *
 * Two epochs:
 *   - `cache_epoch_index`   — bumped by `runQuickIndex` / `runDeepIndex`.
 *   - `cache_epoch_archive` — bumped by archive / restore POSTs.
 *
 * Stored layer is SQLite (`query_cache` table). Hot reads also hit a tiny
 * in-process map keyed by `cache_key` to skip the JSON parse on repeat
 * renders within the same Node process. The in-process map is cleared on
 * any epoch bump in this process and stays correct across other processes
 * because they re-check epochs on their own reads.
 */
import type Database from "better-sqlite3";
import { getDb, getMeta, setMeta } from "./db";

const INDEX_EPOCH_KEY = "cache_epoch_index";
const ARCHIVE_EPOCH_KEY = "cache_epoch_archive";

function readEpoch(key: string): number {
  return Number(getMeta(key) ?? "0");
}

export interface CacheEpochs {
  index: number;
  archive: number;
}

export function getCacheEpochs(): CacheEpochs {
  return { index: readEpoch(INDEX_EPOCH_KEY), archive: readEpoch(ARCHIVE_EPOCH_KEY) };
}

function bumpEpoch(key: string): number {
  const next = readEpoch(key) + 1;
  setMeta(key, String(next));
  _memCache.clear();
  return next;
}

// Prepared statements cached at module scope. `better-sqlite3` only keeps a
// tiny internal LRU; for hot paths (getCachedJSON fires several times per
// page render) recompiling each call is ~0.1ms per call × N keys, enough to
// show up in cold settings/me-stats profiles. The lazy helper rebinds on
// first call against a live db (handle survives dev-server hot reloads via
// the singleton in lib/db.ts).
let _selectStmt: Database.Statement | null = null;
let _upsertStmt: Database.Statement | null = null;
function prepared() {
  const db = getDb();
  if (!_selectStmt) {
    _selectStmt = db.prepare(
      `SELECT value, epoch_index, epoch_archive FROM query_cache WHERE cache_key = ?`,
    );
    _upsertStmt = db.prepare(
      `INSERT INTO query_cache (cache_key, value, epoch_index, epoch_archive, computed_at, hits, size_bytes)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         value = excluded.value,
         epoch_index = excluded.epoch_index,
         epoch_archive = excluded.epoch_archive,
         computed_at = excluded.computed_at,
         hits = 0,
         size_bytes = excluded.size_bytes`,
    );
  }
  return { select: _selectStmt!, upsert: _upsertStmt! };
}

/** Called by the indexer at the end of a successful run. */
export function bumpIndexEpoch(): number {
  return bumpEpoch(INDEX_EPOCH_KEY);
}

/** Called by the archive route after a successful archive/restore. */
export function bumpArchiveEpoch(): number {
  return bumpEpoch(ARCHIVE_EPOCH_KEY);
}

// In-process layer. Bounded by `MAX_MEM_ENTRIES` to keep dev-server memory
// reasonable; SQLite-layer rows are unbounded but small.
interface MemEntry<T> { value: T; epochIndex: number; epochArchive: number }
const MAX_MEM_ENTRIES = 64;
const _memCache = new Map<string, MemEntry<unknown>>();

function memGet<T>(key: string, current: CacheEpochs): T | undefined {
  const hit = _memCache.get(key) as MemEntry<T> | undefined;
  if (!hit) return undefined;
  if (hit.epochIndex !== current.index || hit.epochArchive !== current.archive) {
    _memCache.delete(key);
    return undefined;
  }
  // True LRU: re-insert so the most-recently-used key sits at the tail
  // (`Map` iterates insertion order, so the oldest is at the head and gets
  // evicted first in `memSet`).
  _memCache.delete(key);
  _memCache.set(key, hit as MemEntry<unknown>);
  return hit.value;
}

function memSet<T>(key: string, value: T, current: CacheEpochs) {
  if (_memCache.size >= MAX_MEM_ENTRIES) {
    const first = _memCache.keys().next().value;
    if (first !== undefined) _memCache.delete(first);
  }
  _memCache.set(key, { value, epochIndex: current.index, epochArchive: current.archive });
}

interface CacheOptions {
  /**
   * Skip the archive-epoch check. Use for caches whose result genuinely
   * doesn't change with archive flips (e.g. the full unfiltered message
   * count). Default false — most aggregates respect EXCLUDED_SUBQUERY.
   */
  ignoreArchive?: boolean;
}

/**
 * Cache wrapper: return the cached value when valid, otherwise compute,
 * persist, and return. JSON-serializable values only — pass primitives,
 * arrays, plain objects. Date / Map / Set will lose fidelity.
 */
export function getCachedJSON<T>(
  key: string,
  factory: () => T,
  opts: CacheOptions = {},
): T {
  const epochs = getCacheEpochs();

  // L1: in-process map. No hit-count write — L1 hits dominate hot pages and
  // counting each in SQLite defeats the whole point. The hits column only
  // tracks L2 hits, which are the meaningful "did anyone re-render this
  // aggregate" signal anyway.
  const memHit = memGet<T>(key, epochs);
  if (memHit !== undefined) return memHit;

  // L2: SQLite.
  const { select, upsert } = prepared();
  const row = select.get(key) as
    | { value: string; epoch_index: number; epoch_archive: number }
    | undefined;
  if (
    row &&
    row.epoch_index === epochs.index &&
    (opts.ignoreArchive || row.epoch_archive === epochs.archive)
  ) {
    try {
      const parsed = JSON.parse(row.value) as T;
      memSet(key, parsed, epochs);
      bumpHit(key);
      return parsed;
    } catch (err) {
      // Corrupted row — log once so we know it happened, then recompute.
      console.warn(
        `cache.ts: bad JSON for "${key}" (${row.value.length}B); recomputing.`,
        err,
      );
    }
  }

  // Miss → compute.
  const value = factory();
  const serialized = JSON.stringify(value);
  upsert.run(key, serialized, epochs.index, epochs.archive, Date.now(), serialized.length);
  memSet(key, value, epochs);
  return value;
}

let _bumpHitStmt: Database.Statement | null = null;
function bumpHit(key: string): void {
  try {
    if (!_bumpHitStmt) {
      _bumpHitStmt = getDb().prepare(
        `UPDATE query_cache SET hits = hits + 1 WHERE cache_key = ?`,
      );
    }
    _bumpHitStmt.run(key);
  } catch {
    // Hit counter is observational; never let it fail a request.
  }
}

export interface CacheStats {
  rows: number;
  totalBytes: number;
  totalHits: number;
  epochs: CacheEpochs;
  topByHits: { cache_key: string; hits: number; size_bytes: number; computed_at: number }[];
  topBySize: { cache_key: string; hits: number; size_bytes: number; computed_at: number }[];
}

export function getCacheStats(): CacheStats {
  const db = getDb();
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS rows, COALESCE(SUM(size_bytes), 0) AS bytes, COALESCE(SUM(hits), 0) AS hits FROM query_cache`,
    )
    .get() as { rows: number; bytes: number; hits: number };
  const topByHits = db
    .prepare(
      `SELECT cache_key, hits, size_bytes, computed_at FROM query_cache ORDER BY hits DESC LIMIT 10`,
    )
    .all() as CacheStats["topByHits"];
  const topBySize = db
    .prepare(
      `SELECT cache_key, hits, size_bytes, computed_at FROM query_cache ORDER BY size_bytes DESC LIMIT 10`,
    )
    .all() as CacheStats["topBySize"];
  return {
    rows: agg.rows,
    totalBytes: agg.bytes,
    totalHits: agg.hits,
    epochs: getCacheEpochs(),
    topByHits,
    topBySize,
  };
}

/** Drop every cached row. Used by a Settings button when something looks off. */
export function clearAllCaches(): { dropped: number } {
  const db = getDb();
  const res = db.prepare(`DELETE FROM query_cache`).run();
  _memCache.clear();
  return { dropped: res.changes };
}

/** Drop rows whose key starts with `prefix` — for targeted invalidation. */
export function clearCacheByPrefix(prefix: string): { dropped: number } {
  const db = getDb();
  const res = db
    .prepare(`DELETE FROM query_cache WHERE cache_key LIKE ?`)
    .run(`${prefix}%`);
  // Walk the in-process map to drop matching keys too.
  for (const k of _memCache.keys()) {
    if (k.startsWith(prefix)) _memCache.delete(k);
  }
  return { dropped: res.changes };
}
