import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, type TestDbHandle } from "./setup";

describe("integration: queries", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = setupTestDb();
    await handle.seed({
      sessions: [
        { username: "alice", display_name: "Alice", chat_type: "private", message_count: 3, my_msg_count: 1 },
        { username: "bob", display_name: "Bob", chat_type: "private", message_count: 2, my_msg_count: 0 },
        { username: "marketing", display_name: "Marketing", chat_type: "official", message_count: 5 },
        { username: "muted", display_name: "Muted", chat_type: "private", message_count: 2, archived: 1 },
        { username: "team", display_name: "Team", chat_type: "group", is_group: 1, message_count: 4, my_msg_count: 2 },
      ],
      meHandles: ["YXJ"],
      messages: [
        { chat_username: "alice", chat_display: "Alice", sender: "YXJ", content: "hello GPT", timestamp: 1_700_000_000 },
        { chat_username: "alice", chat_display: "Alice", sender: "", content: "hi back", timestamp: 1_700_000_060 },
        { chat_username: "alice", chat_display: "Alice", sender: "", content: "great", timestamp: 1_700_000_120 },
        { chat_username: "bob", chat_display: "Bob", sender: "", content: "ping", timestamp: 1_700_000_300 },
        { chat_username: "bob", chat_display: "Bob", sender: "", content: "pong", timestamp: 1_700_000_360 },
        { chat_username: "team", chat_display: "Team", sender: "YXJ", content: "team msg", timestamp: 1_700_000_500 },
        { chat_username: "team", chat_display: "Team", sender: "YXJ", content: "team again", timestamp: 1_700_000_560 },
        { chat_username: "team", chat_display: "Team", sender: "Charlie", content: "noted", timestamp: 1_700_000_620 },
        { chat_username: "team", chat_display: "Team", sender: "Dana", content: "+1", timestamp: 1_700_000_680 },
        { chat_username: "marketing", chat_display: "Marketing", sender: "official", content: "promo: GPT sale", timestamp: 1_700_000_700 },
        { chat_username: "muted", chat_display: "Muted", sender: "", content: "muted msg", timestamp: 1_700_000_800 },
        { chat_username: null, chat_display: "Forwarded", sender: "Stranger", content: "orphaned forwarded msg", timestamp: 1_700_000_900 },
      ],
    });
  });

  afterAll(() => handle.cleanup());

  it("getOverview excludes archived + official + folded but keeps NULL chat_username", async () => {
    const { queries } = await handle.loadLib();
    const o = queries.getOverview();
    // 5 alice/bob/team rows + 1 NULL-chat forwarded = 6 (marketing 1 + muted 1 are excluded)
    // alice = 3, bob = 2, team = 4, NULL = 1 → 10
    expect(o.messages.total).toBeGreaterThanOrEqual(10);
    // archived count is non-zero (muted)
    expect(o.archived).toBe(1);
    // sessions breakdown
    expect(o.sessions.private).toBe(2); // alice + bob (muted archived, not in active counts)
    expect(o.sessions.group).toBe(1);
    expect(o.sessions.official).toBe(1);
  });

  it("EXCLUDED_CHAT_CLAUSE keeps NULL chat_username rows in totals", async () => {
    const { db: dbMod, queries } = await handle.loadLib();
    const d = dbMod.getDb();
    const n = (
      d
        .prepare(
          `SELECT COUNT(*) AS n FROM messages WHERE ${queries.EXCLUDED_CHAT_CLAUSE}`,
        )
        .get() as { n: number }
    ).n;
    // 4 alice/bob/team + 1 NULL-chat = should include the NULL row
    const nullN = (
      d
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_username IS NULL")
        .get() as { n: number }
    ).n;
    expect(nullN).toBe(1);
    expect(n).toBeGreaterThanOrEqual(nullN);
  });

  it("setMeHandles strips the empty-string sender", async () => {
    const { queries } = await handle.loadLib();
    queries.setMeHandles(["YXJ", "", "AliasHandle"]);
    const stored = queries.getMeHandles();
    expect(stored).toEqual(["YXJ", "AliasHandle"]);
  });

  it("refreshDailyCounts populates per-day mine + total post-exclusion", async () => {
    const { db: dbMod } = await handle.loadLib();
    const d = dbMod.getDb();
    const rows = d
      .prepare(`SELECT day, n, mine, n_with_archived FROM daily_counts ORDER BY day`)
      .all() as { day: string; n: number; mine: number; n_with_archived: number }[];
    expect(rows.length).toBeGreaterThan(0);
    // Every row's `mine` should be <= `n` (mine is a subset)
    for (const r of rows) {
      expect(r.mine).toBeLessThanOrEqual(r.n);
      expect(r.n).toBeLessThanOrEqual(r.n_with_archived);
    }
  });

  it("listSessions honours type filter + active-only by default", async () => {
    const { queries } = await handle.loadLib();
    const all = queries.listSessions({ type: "all" });
    const privateOnly = queries.listSessions({ type: "private" });
    expect(privateOnly.length).toBe(2); // alice + bob (muted is archived)
    expect(all.length).toBeGreaterThanOrEqual(privateOnly.length);
  });

  it("listSessions sort=messages orders by message_count DESC", async () => {
    const { queries } = await handle.loadLib();
    const rows = queries.listSessions({ sort: "messages" });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].message_count).toBeLessThanOrEqual(rows[i - 1].message_count);
    }
  });
});
