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
    CREATE INDEX IF NOT EXISTS idx_urls_chat ON urls(chat_display);
    CREATE INDEX IF NOT EXISTS idx_urls_sender ON urls(sender);
    CREATE INDEX IF NOT EXISTS idx_urls_ts ON urls(timestamp DESC);
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
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_urls_chat_username ON urls(chat_username) WHERE chat_username IS NOT NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_chat_username ON messages(chat_username) WHERE chat_username IS NOT NULL");

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
