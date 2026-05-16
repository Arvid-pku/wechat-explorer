import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_DIR = process.env.WE_DATA_DIR || join(homedir(), ".wechat-explorer");
mkdirSync(APP_DIR, { recursive: true });

const DB_PATH = join(APP_DIR, "index.db");

type DB = Database.Database;
let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  ensureSchema(db);
  applyMigrations(db);
  _db = db;
  return db;
}

export function dbPath() {
  return DB_PATH;
}

function ensureSchema(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      chat_type TEXT NOT NULL,
      is_group INTEGER NOT NULL DEFAULT 0,
      last_timestamp INTEGER,
      last_msg_type TEXT,
      last_summary TEXT,
      unread INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      first_msg_timestamp INTEGER,
      history_indexed_through INTEGER,
      indexed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(chat_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_ts ON sessions(last_timestamp DESC);

    CREATE TABLE IF NOT EXISTS contacts (
      username TEXT PRIMARY KEY,
      display_name TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_username TEXT,
      chat_display TEXT NOT NULL,
      sender TEXT NOT NULL DEFAULT '',
      msg_type TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL,
      local_id INTEGER,
      content_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_username, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_display ON messages(chat_display, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(msg_type);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_msg_local
      ON messages(chat_username, local_id)
      WHERE chat_username IS NOT NULL AND local_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_msg_hash ON messages(content_hash);

    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      domain_group TEXT NOT NULL,
      message_id INTEGER,
      chat_username TEXT,
      chat_display TEXT NOT NULL,
      sender TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL,
      preview TEXT,
      content_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_urls_group ON urls(domain_group, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain, timestamp DESC);
    -- idx_urls_chat (on chat_display) was here; superseded by the partial
    -- idx_urls_chat_username added by the migration block below. Dropped
    -- there with IF EXISTS so existing DBs upgrade cleanly.
    CREATE INDEX IF NOT EXISTS idx_urls_sender ON urls(sender);
    CREATE INDEX IF NOT EXISTS idx_urls_ts ON urls(timestamp DESC);
    -- uniq_url_msg(content_hash, url) was the original dedup key but two
    -- indexer paths (wx search --type link bulk vs per-chat wx history)
    -- can produce different messages.content_hash for the same shared URL,
    -- letting it sneak in twice. Migrations below add a real dedup_key
    -- column with a unique index; this constraint is retained for back-compat.
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_url_msg ON urls(content_hash, url);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      tokenize='trigram',
      content='messages',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function applyMigrations(db: DB) {
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("archived")) {
    db.exec("ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("archive_reason")) {
    db.exec("ALTER TABLE sessions ADD COLUMN archive_reason TEXT");
  }
  if (!names.has("archived_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN archived_at INTEGER");
  }
  if (!names.has("my_msg_count")) {
    db.exec("ALTER TABLE sessions ADD COLUMN my_msg_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("distinct_senders")) {
    db.exec("ALTER TABLE sessions ADD COLUMN distinct_senders INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("member_count")) {
    db.exec("ALTER TABLE sessions ADD COLUMN member_count INTEGER");
  }
  if (!names.has("member_count_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN member_count_at INTEGER");
  }
  if (!names.has("last_history_attempt_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN last_history_attempt_at INTEGER");
  }
  if (!names.has("last_history_error")) {
    db.exec("ALTER TABLE sessions ADD COLUMN last_history_error TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived)");
  // `idx_messages_chat_username` and `idx_urls_chat` were originally added to
  // accelerate single-column lookups on `chat_username` / `chat_display`. Both
  // are redundant given the wider `idx_messages_chat (chat_username, ts DESC)`
  // and `idx_urls_chat_username` partial index — the planner already prefers
  // those for the same queries. Drop the dead weight; together they free
  // ~32 MB on a 1 GB DB. Not destructive — schema, not data. The CREATE
  // statements above used to live here; we now make this one-time DROP
  // idempotent by including IF EXISTS so older DBs upgrade cleanly.
  db.exec("DROP INDEX IF EXISTS idx_messages_chat_username");
  db.exec("DROP INDEX IF EXISTS idx_urls_chat");
  // Keep the partial `idx_urls_chat_username` (covers most read paths) and
  // re-create it here for new databases that skipped the pre-drop block.
  db.exec("CREATE INDEX IF NOT EXISTS idx_urls_chat_username ON urls(chat_username) WHERE chat_username IS NOT NULL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_username TEXT NOT NULL,
      member_username TEXT NOT NULL,
      member_display TEXT,
      group_nickname TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL,
      PRIMARY KEY (group_username, member_username)
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_username);
    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_username);
  `);

  // ── urls dedup: was a SELECT-time view (full table scan every read). Now
  // a real `dedup_key` column with a unique index — duplicates are rejected
  // at insert time. Migration: add column, backfill, drop historical dupes,
  // create unique index, simplify the view to a trivial alias.
  const urlCols = db.prepare("PRAGMA table_info(urls)").all() as { name: string }[];
  const urlNames = new Set(urlCols.map((c) => c.name));
  const dropOldViewFirst = !urlNames.has("dedup_key");
  if (dropOldViewFirst) {
    // The old `urls_dedup` view referenced `urls.*` — and SQLite freezes the
    // column list at view-creation time. Dropping it before the ALTER TABLE
    // avoids the "view references undefined columns" trap when we add the
    // new column and recreate the view below.
    db.exec(`DROP VIEW IF EXISTS urls_dedup`);
    db.exec("ALTER TABLE urls ADD COLUMN dedup_key TEXT");
    db.exec(
      `UPDATE urls SET dedup_key =
         url || char(31) || timestamp || char(31) || sender || char(31)
              || COALESCE(chat_username, chat_display)
       WHERE dedup_key IS NULL`,
    );
    // Drop historical duplicate rows (before the unique index existed).
    db.exec(
      `DELETE FROM urls WHERE id NOT IN (
         SELECT MIN(id) FROM urls GROUP BY dedup_key
       )`,
    );
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_urls_dedup_key ON urls(dedup_key)`,
  );

  db.exec(`DROP VIEW IF EXISTS urls_dedup`);
  // Trivial alias kept for call-site compatibility. The unique index above
  // guarantees one row per dedup_key going forward.
  db.exec(`CREATE VIEW urls_dedup AS SELECT * FROM urls`);

  // ── daily_counts: per-day rollup that powers /, /calendar heatmaps, and
  // /surprises without scanning 614k messages on every page load. Refreshed
  // by indexer.ts at the end of each indexing run via `refreshDailyCounts()`.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_counts (
      day TEXT PRIMARY KEY,        -- 'YYYY-MM-DD' local time
      n INTEGER NOT NULL,          -- post-exclusion message count
      mine INTEGER NOT NULL DEFAULT 0,
      n_with_archived INTEGER NOT NULL,  -- same count but only excluding official/folded
      mine_with_archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_daily_counts_day ON daily_counts(day);
  `);

  // ── read_urls: per-URL read state for the /reading queue. Keyed by the
  // stable `urls.id`; populated client-side from a "mark read" checkbox.
  db.exec(`
    CREATE TABLE IF NOT EXISTS read_urls (
      url_id INTEGER PRIMARY KEY,
      read_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_read_urls_read_at ON read_urls(read_at DESC);
  `);

  // ── query_cache: durable JSON cache for expensive aggregates (recap,
  // me-stats, year keywords, etc). Invalidation is epoch-based, not TTL:
  // each cached row records the `cache_epoch_index` + `cache_epoch_archive`
  // it was computed under. Indexing bumps the index epoch; archive ops bump
  // the archive epoch. A cached value stays valid until one of those changes.
  // Past-year recaps therefore stay cached indefinitely after the first hit.
  db.exec(`
    CREATE TABLE IF NOT EXISTS query_cache (
      cache_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      epoch_index INTEGER NOT NULL,
      epoch_archive INTEGER NOT NULL,
      computed_at INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_query_cache_computed ON query_cache(computed_at DESC);
  `);
}

export function setMeta(key: string, value: string) {
  const db = getDb();
  db.prepare(
    "INSERT INTO meta(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
  ).run(key, value, Date.now());
}

export function getMeta(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function contentHash(parts: (string | number | null | undefined)[]): string {
  const h = createHash("sha256");
  h.update(parts.map((p) => String(p ?? "")).join(""));
  return h.digest("hex");
}
