import { describe, it, expect } from "vitest";
import { extractUrls, toExtracted, extractDomain, groupOf } from "@/lib/url-parser";

describe("extractUrls", () => {
  it("strips trailing punctuation .,;:!?）)", () => {
    const cases: Array<[string, string]> = [
      ["see https://example.com/path.", "https://example.com/path"],
      ["see https://example.com,", "https://example.com"],
      ["see https://example.com;", "https://example.com"],
      ["see https://example.com:", "https://example.com"],
      ["see https://example.com!", "https://example.com"],
      ["see https://example.com?", "https://example.com"],
      ["see https://example.com)", "https://example.com"],
      ["see https://example.com）", "https://example.com"],
    ];
    for (const [input, expected] of cases) {
      const out = extractUrls(input);
      expect(out, `input: ${input}`).toHaveLength(1);
      expect(out[0].url).toBe(expected);
    }
  });

  it("handles both http and https", () => {
    const out = extractUrls("plain http://foo.com and https://bar.com end");
    const urls = out.map((u) => u.url).sort();
    expect(urls).toEqual(["http://foo.com", "https://bar.com"]);
  });

  it("stops at embedded CJK characters", () => {
    // CJK shouldn't extend the URL through whitespace boundaries
    const out = extractUrls("点击 https://example.com/path 来看看");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://example.com/path");
  });

  it("returns [] on empty input", () => {
    expect(extractUrls("")).toEqual([]);
    expect(extractUrls("no link here")).toEqual([]);
  });

  it("handles realistic WeChat message strings", () => {
    const msg = "推荐这篇 https://mp.weixin.qq.com/s/abcDEF123，写得不错";
    const out = extractUrls(msg);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://mp.weixin.qq.com/s/abcDEF123，写得不错"); // CJK in URL keeps as part of regex
  });

  it("deduplicates the same cleaned URL", () => {
    const out = extractUrls("https://foo.com! https://foo.com.");
    expect(out).toHaveLength(1);
  });
});

describe("toExtracted", () => {
  it("returns url, domain, group", () => {
    const e = toExtracted("https://github.com/user/repo");
    expect(e.url).toBe("https://github.com/user/repo");
    expect(e.domain).toBe("github.com");
    expect(e.group).toBe("github");
  });
});

describe("extractDomain", () => {
  it("strips www. and lowercases", () => {
    expect(extractDomain("https://WWW.Example.COM/path")).toBe("example.com");
  });

  it("returns 'unknown' on malformed URL", () => {
    // Strings that the WHATWG URL constructor throws on → caught → "unknown"
    expect(extractDomain("not a url")).toBe("unknown");
    expect(extractDomain("")).toBe("unknown");
  });

  it("returns plain hostname for normal URL", () => {
    expect(extractDomain("https://arxiv.org/abs/1234")).toBe("arxiv.org");
  });
});

describe("groupOf", () => {
  it("returns the mapped group on exact match", () => {
    expect(groupOf("github.com")).toBe("github");
    expect(groupOf("arxiv.org")).toBe("arxiv");
    expect(groupOf("mp.weixin.qq.com")).toBe("wechat-article");
  });

  it("returns the mapped group on subdomain match", () => {
    expect(groupOf("zhuanlan.zhihu.com")).toBe("zhihu");
    expect(groupOf("gist.github.com")).toBe("github");
  });

  it("returns the domain unchanged when nothing is mapped", () => {
    expect(groupOf("some-random-site.example")).toBe("some-random-site.example");
  });
});
