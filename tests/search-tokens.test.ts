import { describe, it, expect } from "vitest";
import { parseSearchTokens } from "@/lib/queries";

describe("parseSearchTokens", () => {
  it("parses a single bare word", () => {
    expect(parseSearchTokens("hello")).toEqual(["hello"]);
  });

  it("splits multiple bare words on whitespace", () => {
    expect(parseSearchTokens("hello world")).toEqual(["hello", "world"]);
  });

  it("treats a quoted phrase as a single token", () => {
    expect(parseSearchTokens('"hello world"')).toEqual(["hello world"]);
  });

  it("mixes bare words and quoted phrases", () => {
    expect(parseSearchTokens('foo "bar baz" qux')).toEqual(["foo", "bar baz", "qux"]);
  });

  it("treats doubled quotes inside a phrase as an escaped quote", () => {
    expect(parseSearchTokens('"say ""hi""!"')).toEqual(['say "hi"!']);
  });

  it("returns [] on empty input", () => {
    expect(parseSearchTokens("")).toEqual([]);
  });

  it("returns [] on whitespace-only input", () => {
    expect(parseSearchTokens("   \t\n  ")).toEqual([]);
  });
});
