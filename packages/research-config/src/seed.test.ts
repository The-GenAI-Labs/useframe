import { describe, expect, it } from "vitest";
import { loadStyleDirectiveSeed, loadStyleTagSeed, validateStyleDirectives, validateStyleTags } from "./index.js";

const NICHES = ["EDTECH", "HEALTH_WELLNESS", "FINTECH", "SAAS_B2B", "ECOMMERCE", "FOOD_LIFESTYLE", "FITNESS", "LUXURY", "MEDITATION", "KIDS", "OTHER"];

const tag = (key: string, compatibleWith: string[] = [], extra: Record<string, unknown> = {}) => ({
  key,
  label: key,
  description: "",
  designTokens: {},
  exemplarUrls: [],
  requiresCapability: null,
  compatibleWith,
  avoidPatterns: [],
  status: "DRAFT",
  ...extra,
});

describe("shipped seeds", () => {
  it("style tags validate, with exactly the four filled examples ACTIVE", () => {
    const tags = loadStyleTagSeed();
    expect(tags).toHaveLength(24);
    expect(tags.filter((t) => t.status === "ACTIVE").map((t) => t.key).sort()).toEqual(["brutalism", "editorial", "glassmorphism", "minimal"]);
    expect(tags.find((t) => t.key === "three_d")?.requiresCapability).toBe("three_js");
    expect(tags.find((t) => t.key === "horizontal_layout")?.requiresCapability).toBe("horizontal_scroll");
  });

  it("style directives cover every niche once, all DRAFT", () => {
    const directives = loadStyleDirectiveSeed(NICHES);
    expect(directives.map((d) => d.niche).sort()).toEqual([...NICHES].sort());
    expect(directives.every((d) => d.status === "DRAFT" && d.modelTarget === "all")).toBe(true);
  });
});

describe("validateStyleTags", () => {
  it("rejects asymmetric compatibleWith", () => {
    expect(() => validateStyleTags([tag("a", ["b"]), tag("b")])).toThrow(/not symmetric: "a" lists "b"/);
  });

  it("rejects unknown and self references", () => {
    expect(() => validateStyleTags([tag("a", ["zzz"])])).toThrow(/unknown style tag "zzz"/);
    expect(() => validateStyleTags([tag("a", ["a"])])).toThrow(/lists itself/);
  });

  it("rejects duplicate keys", () => {
    expect(() => validateStyleTags([tag("a"), tag("a")])).toThrow(/duplicate style tag key "a"/);
  });

  it("rejects design token values outside the token schema", () => {
    expect(() => validateStyleTags([tag("a", [], { designTokens: { radius: "huge" } })])).toThrow();
    expect(() => validateStyleTags([tag("a", [], { designTokens: { notAToken: "x" } })])).toThrow();
  });

  it("rejects unknown capabilities but allows known-not-yet-supported ones", () => {
    expect(() => validateStyleTags([tag("a", [], { requiresCapability: "webgl_magic" })])).toThrow();
    expect(validateStyleTags([tag("a", [], { requiresCapability: "three_js" })])).toHaveLength(1);
  });

  it("requires a description before a tag can be ACTIVE", () => {
    expect(() => validateStyleTags([tag("a", [], { status: "ACTIVE" })])).toThrow(/need a description/);
  });
});

describe("validateStyleDirectives", () => {
  const directive = { niche: "FINTECH", modelTarget: "all", promptText: "", referenceProducts: [], avoidPatterns: [], status: "DRAFT" };

  it("rejects unknown niches and duplicate niche/model pairs", () => {
    expect(() => validateStyleDirectives([{ ...directive, niche: "SPACE" }], NICHES)).toThrow(/unknown niche "SPACE"/);
    expect(() => validateStyleDirectives([directive, directive], NICHES)).toThrow(/duplicate style directive for FINTECH:all/);
  });

  it("requires promptText before a directive can be ACTIVE", () => {
    expect(() => validateStyleDirectives([{ ...directive, status: "ACTIVE" }], NICHES)).toThrow(/need promptText/);
  });
});
