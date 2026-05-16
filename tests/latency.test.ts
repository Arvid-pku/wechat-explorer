import { describe, it, expect } from "vitest";
import {
  computeLatencies,
  bucketLatencies,
  latencyStats,
  formatLatency,
  LATENCY_BUCKET_DEF,
} from "@/lib/latency";

describe("computeLatencies", () => {
  it("computes latencies for alternating senders in the correct direction", () => {
    // them speaks at 0, me at 30 → I took 30s to reply → youToThem
    // me at 30, them at 120 → they took 90s → themToYou
    const msgs = [
      { sender: "alice", timestamp: 0 },
      { sender: "me", timestamp: 30 },
      { sender: "alice", timestamp: 120 },
    ];
    const out = computeLatencies(msgs, ["me"]);
    expect(out.youToThem).toEqual([30]);
    expect(out.themToYou).toEqual([90]);
  });

  it("does NOT count consecutive same-side messages", () => {
    const msgs = [
      { sender: "alice", timestamp: 0 },
      { sender: "alice", timestamp: 10 },
      { sender: "alice", timestamp: 20 },
      { sender: "me", timestamp: 30 },
      { sender: "me", timestamp: 40 },
    ];
    const out = computeLatencies(msgs, ["me"]);
    // them at 20 → me at 30: 10s youToThem; me/me at 30→40 not counted
    expect(out.youToThem).toEqual([10]);
    expect(out.themToYou).toEqual([]);
  });

  it("drops gaps longer than maxGapSec", () => {
    const msgs = [
      { sender: "alice", timestamp: 0 },
      { sender: "me", timestamp: 100 }, // 100s, within default gap
      { sender: "alice", timestamp: 1_000_000 }, // huge gap from prev "me"
      { sender: "me", timestamp: 1_000_050 }, // 50s, within gap from prev them
    ];
    const out = computeLatencies(msgs, ["me"], { maxGapSec: 7 * 24 * 3600 });
    expect(out.youToThem).toEqual([100, 50]);
    // themToYou would be 1_000_000 - 100 = 999_900s ≈ 11.5d, which is > 7d → dropped
    expect(out.themToYou).toEqual([]);
  });
});

describe("bucketLatencies", () => {
  it("puts 30s in <1m and 90s in 1–5m", () => {
    const buckets = bucketLatencies([30, 90]);
    const under1m = buckets.find((b) => b.label === "<1m")!;
    const oneToFive = buckets.find((b) => b.label === "1–5m")!;
    expect(under1m.n).toBe(1);
    expect(oneToFive.n).toBe(1);
  });

  it("preserves the canonical bucket definition order and labels", () => {
    const buckets = bucketLatencies([]);
    expect(buckets.map((b) => b.label)).toEqual(LATENCY_BUCKET_DEF.map((b) => b.label));
    for (const b of buckets) expect(b.n).toBe(0);
  });
});

describe("latencyStats", () => {
  it("returns all zeros on empty input", () => {
    expect(latencyStats([])).toEqual({ median: 0, p25: 0, p75: 0, count: 0 });
  });

  it("returns middle element as median for odd-length sorted input", () => {
    // sorted: [1,2,3,4,5]; floor(0.5 * 5) = 2 → index 2 = 3
    const stats = latencyStats([3, 1, 5, 2, 4]);
    expect(stats.median).toBe(3);
    expect(stats.count).toBe(5);
  });
});

describe("formatLatency", () => {
  it("formats sub-minute as seconds", () => {
    expect(formatLatency(45)).toBe("45s");
  });

  it("boundary 60s → 1m", () => {
    expect(formatLatency(60)).toBe("1m");
  });

  it("boundary 3600s → 1.0h", () => {
    expect(formatLatency(3600)).toBe("1.0h");
  });

  it("boundary 86400s → 1.0d", () => {
    expect(formatLatency(86400)).toBe("1.0d");
  });
});
