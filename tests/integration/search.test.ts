import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, type TestDbHandle } from "./setup";

describe("integration: searchMessages", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = setupTestDb();
    await handle.seed({
      sessions: [
        { username: "alice", display_name: "Alice", chat_type: "private", message_count: 3 },
        { username: "marketing", display_name: "Marketing", chat_type: "official", message_count: 2 },
      ],
      messages: [
        { chat_username: "alice", chat_display: "Alice", sender: "YXJ", content: "checked out GPT today", timestamp: 1_700_001_000 },
        { chat_username: "alice", chat_display: "Alice", sender: "", content: "我也是", timestamp: 1_700_001_060 },
        { chat_username: "alice", chat_display: "Alice", sender: "", content: "<script>alert(1)</script> looks bad", timestamp: 1_700_001_120 },
        { chat_username: "marketing", chat_display: "Marketing", sender: "newsletter", content: "GPT promo", timestamp: 1_700_001_180 },
      ],
    });
  });

  afterAll(() => handle.cleanup());

  it("FTS path returns matches with html-escaped snippets", async () => {
    const { queries } = await handle.loadLib();
    const rows = queries.searchMessages("GPT");
    // The marketing match is excluded (official); only Alice's GPT remains.
    expect(rows.length).toBe(1);
    expect(rows[0].chat_display).toBe("Alice");
    expect(rows[0].snippet).toContain("<mark>GPT</mark>");
    expect(rows[0].snippet).not.toContain("<script>");
  });

  it("LIKE fallback fires for 2-char CJK queries", async () => {
    const { queries } = await handle.loadLib();
    const rows = queries.searchMessages("我也");
    expect(rows.length).toBe(1);
    expect(rows[0].content).toContain("我也是");
  });

  it("buildSnippet escapes raw HTML in the message body", async () => {
    const { queries } = await handle.loadLib();
    const rows = queries.searchMessages("looks");
    expect(rows.length).toBe(1);
    // The injected <script> tag must appear as escaped text — no live tags.
    expect(rows[0].snippet).not.toMatch(/<script[^>]*>/);
    // Either the opening `&lt;script` or the closing `&lt;/script&gt;` should
    // be present depending on where the snippet window lands.
    expect(rows[0].snippet).toMatch(/&lt;\/?script/);
  });

  it("parseSearchTokens preserves quoted phrases + handles double quotes", async () => {
    const { queries } = await handle.loadLib();
    expect(queries.parseSearchTokens('foo bar')).toEqual(["foo", "bar"]);
    expect(queries.parseSearchTokens('"hello world" foo')).toEqual(["hello world", "foo"]);
    expect(queries.parseSearchTokens('"escape ""this"""')).toEqual([`escape "this"`]);
    expect(queries.parseSearchTokens("")).toEqual([]);
  });
});
