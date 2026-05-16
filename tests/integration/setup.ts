/**
 * Helpers for the integration test suite. Each test file calls `setupTestDb()`
 * inside its top-level setup block to redirect `lib/db` at a fresh on-disk
 * (well, technically per-worker tmpfile) SQLite — keeps the suite isolated
 * from `~/.wechat-explorer/index.db`.
 *
 * Why not `:memory:`? `better-sqlite3` opens the file from a path string;
 * routing it to a tmpdir gives us identical semantics (WAL, ANALYZE,
 * triggers, FTS5) without the special-case handling `:memory:` would need.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

export interface SeedMessage {
  chat_username: string | null;
  chat_display: string;
  sender: string;
  msg_type?: string;
  content: string;
  timestamp: number;
}

export interface SeedSession {
  username: string;
  display_name: string;
  chat_type: "private" | "group" | "official" | "folded";
  archived?: 0 | 1;
  is_group?: 0 | 1;
  message_count?: number;
  my_msg_count?: number;
}

export interface TestDbHandle {
  dir: string;
  cleanup: () => void;
  /**
   * Re-import the data layer with the new path active. Returns the modules a
   * test wants so the test stays terse. Always call this AFTER `setupTestDb`
   * — the env var must be in place before `lib/db.ts` first runs.
   */
  loadLib: () => Promise<{
    db: typeof import("../../lib/db");
    queries: typeof import("../../lib/queries");
    cache: typeof import("../../lib/cache");
  }>;
  seed: (opts: {
    sessions?: SeedSession[];
    messages?: SeedMessage[];
    meHandles?: string[];
  }) => Promise<void>;
}

/**
 * Stand up a private DB directory for the calling test file. Returns a
 * handle with helpers for seeding canonical fixtures + tearing down.
 *
 * Sets `process.env.WE_DATA_DIR` synchronously so any subsequent
 * `await import("@/lib/db")` opens the test DB. Tests must use the
 * `handle.loadLib()` accessor instead of importing lib/db at the file top
 * level — top-level imports would fix the path to the user's real DB.
 */
export function setupTestDb(): TestDbHandle {
  const dir = mkdtempSync(join(tmpdir(), "we-test-"));
  process.env.WE_DATA_DIR = dir;
  // Vitest preserves the module graph between tests in the same file. Reset
  // it so the new env var is seen on first import.
  vi.resetModules();

  const handle: TestDbHandle = {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
    loadLib: async () => {
      // Re-resolve the modules AFTER env mutation. We avoid a singleton-import
      // at the test file's top so different files get distinct DB handles.
      const db = await import("../../lib/db");
      const queries = await import("../../lib/queries");
      const cache = await import("../../lib/cache");
      return { db, queries, cache };
    },
    seed: async ({ sessions = [], messages = [], meHandles }) => {
      const { db: dbMod, queries } = await handle.loadLib();
      const d = dbMod.getDb();
      const now = Math.floor(Date.now() / 1000);
      const insertSession = d.prepare(
        `INSERT INTO sessions
           (username, display_name, chat_type, is_group, archived,
            message_count, my_msg_count, last_timestamp, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertMsg = d.prepare(
        `INSERT INTO messages
           (chat_username, chat_display, sender, msg_type, content, timestamp,
            local_id, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = d.transaction(() => {
        for (const s of sessions) {
          insertSession.run(
            s.username,
            s.display_name,
            s.chat_type,
            s.is_group ?? (s.chat_type === "group" ? 1 : 0),
            s.archived ?? 0,
            s.message_count ?? 0,
            s.my_msg_count ?? 0,
            now,
            now,
          );
        }
        let i = 0;
        for (const m of messages) {
          // Synthesise a content-hash deterministically — uses the same parts
          // as production's contentHash (lib/db.ts) but doesn't need to match,
          // it just has to be unique.
          insertMsg.run(
            m.chat_username,
            m.chat_display,
            m.sender,
            m.msg_type ?? "文本",
            m.content,
            m.timestamp,
            i++,
            `test-${i}`,
          );
        }
      });
      tx();
      if (meHandles) queries.setMeHandles(meHandles);
      queries.refreshDailyCounts();
    },
  };
  return handle;
}
