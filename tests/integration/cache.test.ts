import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, type TestDbHandle } from "./setup";

describe("integration: cache epoch invalidation", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = setupTestDb();
    await handle.seed({
      sessions: [
        { username: "alice", display_name: "Alice", chat_type: "private", message_count: 1 },
      ],
      messages: [
        { chat_username: "alice", chat_display: "Alice", sender: "YXJ", content: "hi", timestamp: 1_700_002_000 },
      ],
    });
  });

  afterAll(() => handle.cleanup());

  it("getCachedJSON returns a stable value across reads with no epoch bump", async () => {
    const { cache } = await handle.loadLib();
    let calls = 0;
    const factory = () => {
      calls++;
      return { v: 42 };
    };
    cache.getCachedJSON("test-stable", factory);
    cache.getCachedJSON("test-stable", factory);
    cache.getCachedJSON("test-stable", factory);
    expect(calls).toBe(1);
  });

  it("bumpIndexEpoch invalidates the cached value", async () => {
    const { cache } = await handle.loadLib();
    let calls = 0;
    const factory = () => {
      calls++;
      return { v: calls };
    };
    const a = cache.getCachedJSON("test-bump", factory);
    cache.bumpIndexEpoch();
    const b = cache.getCachedJSON("test-bump", factory);
    expect(a.v).toBe(1);
    expect(b.v).toBe(2);
    expect(calls).toBe(2);
  });

  it("bumpArchiveEpoch invalidates by default but not when ignoreArchive=true", async () => {
    const { cache } = await handle.loadLib();
    let runs = 0;
    const factory = () => ({ v: ++runs });
    const r1 = cache.getCachedJSON("test-arc", factory);
    cache.bumpArchiveEpoch();
    const r2 = cache.getCachedJSON("test-arc", factory);
    expect(r2.v).toBeGreaterThan(r1.v);

    let runs2 = 0;
    const factory2 = () => ({ v: ++runs2 });
    const a1 = cache.getCachedJSON("test-arc-ignore", factory2, { ignoreArchive: true });
    cache.bumpArchiveEpoch();
    const a2 = cache.getCachedJSON("test-arc-ignore", factory2, { ignoreArchive: true });
    // Same value — archive bump shouldn't trigger a recompute when ignored.
    expect(a2.v).toBe(a1.v);
  });

  it("clearCacheByPrefix drops matching rows in-process + in SQLite", async () => {
    const { cache } = await handle.loadLib();
    // Start from a known state — prior tests in this file may have populated
    // unrelated rows. We measure the delta, not the absolute count.
    const before = cache.getCacheStats().rows;
    cache.getCachedJSON("p:one", () => ({ a: 1 }));
    cache.getCachedJSON("p:two", () => ({ a: 2 }));
    cache.getCachedJSON("q:three", () => ({ a: 3 }));
    const dropped = cache.clearCacheByPrefix("p:");
    expect(dropped.dropped).toBe(2);
    const after = cache.getCacheStats().rows;
    // Net change: +3 inserted, -2 dropped via prefix clear → +1 vs before.
    expect(after - before).toBe(1);
  });
});
