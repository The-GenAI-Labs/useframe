import { describe, expect, it } from "vitest";
import { etagMatches, normalizePath, parseEntry, planServe } from "../src/resolve.js";

describe("normalizePath", () => {
  it("accepts ordinary paths", () => {
    expect(normalizePath("/")).toEqual({ ok: true, path: "/" });
    expect(normalizePath("/about/")).toEqual({ ok: true, path: "/about/" });
    expect(normalizePath("/caf%C3%A9")).toEqual({ ok: true, path: "/café" });
  });

  it.each([
    ["encoded traversal", "/%2e%2e/secret"],
    ["encoded slash producing //", "/a%2F/b"],
    ["leading encoded slash", "/%2Fetc"],
    ["backslash", "/a%5Cb"],
    ["NUL", "/a%00b"],
    ["dot-dot", "/a/../b"],
    ["single dot", "/a/./b"],
    ["malformed percent-encoding", "/%E0%A4%A"],
    ["overlong", "/" + "a".repeat(901)],
  ])("rejects %s", (_name, raw) => {
    expect(normalizePath(raw)).toEqual({ ok: false });
  });
});

describe("planServe (Next static export)", () => {
  it.each([
    ["/", { kind: "object", key: "index.html", onMiss: "404" }],
    ["/about", { kind: "redirect", path: "/about/" }],
    ["/about/", { kind: "object", key: "about/index.html", onMiss: "404" }],
    ["/_next/static/x.js", { kind: "object", key: "_next/static/x.js", onMiss: "404" }],
    ["/favicon.ico", { kind: "object", key: "favicon.ico", onMiss: "404" }],
    [
      "/.well-known/apple-app-site-association",
      { kind: "object", key: ".well-known/apple-app-site-association", onMiss: "404" },
    ],
  ])("%s", (path, plan) => {
    expect(planServe("n", path)).toEqual(plan);
  });
});

describe("planServe (Vite SPA)", () => {
  it.each([
    ["/", { kind: "object", key: "index.html", onMiss: "none" }],
    ["/about", { kind: "object", key: "index.html", onMiss: "none" }],
    ["/pricing/plans", { kind: "object", key: "index.html", onMiss: "none" }],
    ["/assets/a.js", { kind: "object", key: "assets/a.js", onMiss: "404" }],
    ["/missing.js", { kind: "object", key: "missing.js", onMiss: "404" }],
    ["/favicon.ico", { kind: "object", key: "favicon.ico", onMiss: "404" }],
    [
      "/.well-known/apple-app-site-association",
      { kind: "object", key: ".well-known/apple-app-site-association", onMiss: "404" },
    ],
  ])("%s", (path, plan) => {
    expect(planServe("s", path)).toEqual(plan);
  });
});

describe("parseEntry", () => {
  it("accepts the three contract shapes", () => {
    expect(parseEntry({ v: 1, t: "p", k: "proj/dep", m: "n" })).not.toBeNull();
    expect(parseEntry({ v: 1, t: "r", u: "https://www.acme.com" })).not.toBeNull();
    expect(parseEntry({ v: 1, t: "x" })).not.toBeNull();
  });

  it.each([
    [{ v: 2, t: "x" }],
    [{ v: 1, t: "z" }],
    [{ v: 1, t: "p", k: "../x/y", m: "n" }],
    [{ v: 1, t: "p", k: "a/b", m: "q" }],
    [{ v: 1, t: "r", u: "http://acme.com" }],
    [{ v: 1, t: "r", u: "https://acme.com/" }],
    [null],
    ["string"],
  ])("rejects %j", (value) => {
    expect(parseEntry(value)).toBeNull();
  });
});

describe("etagMatches", () => {
  it("ignores weak prefixes and handles lists", () => {
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x", "abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x"', '"abc"')).toBe(false);
    expect(etagMatches(null, '"abc"')).toBe(false);
  });
});
