import { describe, it, expect } from "vitest";
import {
  tokenize,
  termFreq,
  tfidfAgainst,
  topByCount,
  vocabDiff,
  countEmoji,
  topEmoji,
} from "@/lib/text";

describe("tokenize", () => {
  it("drops URLs entirely", () => {
    const toks = tokenize("see https://example.com/path?q=1 cool article");
    expect(toks).not.toContain("https");
    expect(toks).not.toContain("example.com");
    expect(toks).not.toContain("example");
    expect(toks).toContain("cool");
    expect(toks).toContain("article");
  });

  it("drops unicode emoji", () => {
    const toks = tokenize("party time 🎉🎊 woohoo");
    expect(toks).toContain("party");
    expect(toks).toContain("time");
    expect(toks).toContain("woohoo");
    expect(toks.some((t) => /\p{Extended_Pictographic}/u.test(t))).toBe(false);
  });

  it("drops single CJK chars and English stopwords; segments Chinese with Intl.Segmenter", () => {
    const toks = tokenize("你好世界 hello world the a");
    expect(toks).toContain("世界");
    expect(toks).toContain("hello");
    expect(toks).toContain("world");
    expect(toks).not.toContain("你");
    expect(toks).not.toContain("the");
    expect(toks).not.toContain("a");
  });

  it("returns lowercase tokens", () => {
    const toks = tokenize("MixedCase Banana APPLE");
    for (const t of toks) expect(t).toBe(t.toLowerCase());
    expect(toks).toContain("mixedcase");
    expect(toks).toContain("banana");
    expect(toks).toContain("apple");
  });

  it("returns [] on empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("termFreq", () => {
  it("counts repeated tokens across docs", () => {
    const docs = ["apple banana apple", "banana cherry", "apple"];
    const tf = termFreq(docs);
    expect(tf.get("apple")).toBe(3);
    expect(tf.get("banana")).toBe(2);
    expect(tf.get("cherry")).toBe(1);
  });

  it("accepts pre-tokenized arrays", () => {
    const tf = termFreq([["foo", "foo", "bar"], ["bar", "baz"]]);
    expect(tf.get("foo")).toBe(2);
    expect(tf.get("bar")).toBe(2);
    expect(tf.get("baz")).toBe(1);
  });
});

describe("tfidfAgainst", () => {
  it("ranks rare-in-baseline words higher than common-in-baseline words", () => {
    const subset = new Map<string, number>([
      ["common", 5],
      ["rare", 5],
    ]);
    const baseline = new Map<string, number>([
      ["common", 1000],
      ["rare", 1],
    ]);
    const out = tfidfAgainst(subset, baseline, { min: 1, top: 10 });
    const rareIdx = out.findIndex((s) => s.word === "rare");
    const commonIdx = out.findIndex((s) => s.word === "common");
    expect(rareIdx).toBeGreaterThanOrEqual(0);
    expect(commonIdx).toBeGreaterThanOrEqual(0);
    expect(rareIdx).toBeLessThan(commonIdx);
    const rare = out.find((s) => s.word === "rare")!;
    const common = out.find((s) => s.word === "common")!;
    expect(rare.weight).toBeGreaterThan(common.weight);
  });

  it("respects min count filter", () => {
    const subset = new Map<string, number>([
      ["keep", 5],
      ["drop", 1],
    ]);
    const baseline = new Map<string, number>();
    const out = tfidfAgainst(subset, baseline, { min: 2 });
    expect(out.find((s) => s.word === "keep")).toBeTruthy();
    expect(out.find((s) => s.word === "drop")).toBeUndefined();
  });

  it("respects top N slice", () => {
    const subset = new Map<string, number>(
      Array.from({ length: 50 }, (_, i) => [`w${i}`, 50 - i] as [string, number]),
    );
    const baseline = new Map<string, number>();
    const out = tfidfAgainst(subset, baseline, { min: 1, top: 5 });
    expect(out.length).toBe(5);
  });
});

describe("topByCount", () => {
  it("sorts descending by count", () => {
    const tf = new Map<string, number>([
      ["a", 3],
      ["b", 9],
      ["c", 5],
    ]);
    const out = topByCount(tf, { min: 1 });
    expect(out.map((s) => s.word)).toEqual(["b", "c", "a"]);
  });

  it("respects min", () => {
    const tf = new Map<string, number>([
      ["keep", 5],
      ["drop", 1],
    ]);
    const out = topByCount(tf, { min: 2 });
    expect(out.map((s) => s.word)).toEqual(["keep"]);
  });
});

describe("vocabDiff", () => {
  it("ranks A-only words higher in aOnly than B-only words", () => {
    const a = new Map<string, number>([
      ["aword", 5],
      ["shared", 3],
    ]);
    const b = new Map<string, number>([
      ["bword", 5],
      ["shared", 3],
    ]);
    const out = vocabDiff(a, b, { min: 1, top: 10 });
    const aTop = out.aOnly[0];
    const bTop = out.bOnly[0];
    expect(aTop.word).toBe("aword");
    expect(bTop.word).toBe("bword");
  });
});

describe("countEmoji", () => {
  it("counts unicode emoji", () => {
    expect(countEmoji("hello 🎉 world 🎊")).toBe(2);
  });

  it("ignores WeChat-style bracketed tokens", () => {
    expect(countEmoji("[微信表情] [开心] [呲牙]")).toBe(0);
  });

  it("returns 0 on empty / null-ish input", () => {
    expect(countEmoji("")).toBe(0);
    expect(countEmoji("plain text only")).toBe(0);
  });
});

describe("topEmoji", () => {
  it("returns top N unicode emoji by count", () => {
    const out = topEmoji(["🎉🎉🎉", "🎊", "🎉 🎊"]);
    expect(out[0].emoji).toBe("🎉");
    expect(out[0].n).toBe(4);
    expect(out.find((e) => e.emoji === "🎊")!.n).toBe(2);
  });

  it("ignores WeChat-style bracketed tokens", () => {
    const out = topEmoji(["[微信表情] hello", "[呲牙][呲牙]"]);
    expect(out.length).toBe(0);
  });
});
