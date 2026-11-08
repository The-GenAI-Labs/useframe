import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAppliesWhen,
  buildStatement,
  buildTags,
  convertCorpus,
  extractDoi,
  mapCategory,
  matchReference,
  parseRawBatch,
  stripFences,
  type ConvertResult,
  type RawArticle,
  type RawFinding,
} from "./corpusConvert.js";
import { parseFindingFile } from "./findingFile.js";
import {
  ArticleFileSchema,
  articleData,
  importArticles,
  type ArticleStore,
} from "./corpusArticles.js";
import { checkUrls } from "./corpusReport.js";
import { runConvert, runImportArticles } from "./corpusFiles.js";
import {
  LabelCacheSchema,
  assignSlugs,
  findingKey,
  offlineTitle,
  slugify,
  type LabelCache,
  type LabelProvider,
  type LabelRequestItem,
} from "./labels.js";

const fixtureText = readFileSync(
  new URL("./fixtures/rawBatch.fixture.json", import.meta.url),
  "utf8",
);
const loaded = parseRawBatch(fixtureText);
if (!loaded.ok) throw new Error(loaded.error);
const fixture = { findings: loaded.findings, articles: loaded.articles };
const emptyCache = (): LabelCache => LabelCacheSchema.parse({});

const topicProvider =
  (calls: LabelRequestItem[][] = []): LabelProvider =>
  async (items) => {
    calls.push(items);
    return items.map((item) => {
      const word = item.claim.split(" ")[2]!;
      return {
        key: item.key,
        title: `Fixture topic ${word}`,
        slug: `fixture-topic-${word}`,
      };
    });
  };

const run = (
  batches = [{ file: "a.json", ...fixture }],
  cache = emptyCache(),
  provider: LabelProvider | null = topicProvider(),
  offline = false,
): Promise<ConvertResult> =>
  convertCorpus({ batches, cache, provider, offline });
const bySlug = (result: ConvertResult, word: string) =>
  result.findings.find((f) => f.slug === `fixture-topic-${word}`)!;

describe("statement and applicability", () => {
  it("is exactly the claim plus the fixed options block", async () => {
    const f = bySlug(await run(), "one");
    expect(f.output.statement).toBe(
      [
        fixture.findings[0]!.claim,
        "",
        "Options:",
        "- Option A: a (fits: trust, calm brand)",
        "- Option B: b (fits: energy, calm brand)",
        "- Option C: c (fits: trust)",
        "- Option D: d (fits: luxury)",
      ].join("\n"),
    );
  });
  it("keeps the claim verbatim, including odd whitespace", () => {
    expect(buildStatement("  Spaced claim.\n", [])).toBe("  Spaced claim.\n");
  });
  it("builds appliesWhen with underscores replaced", () => {
    expect(
      buildAppliesWhen(["landing_page", "pricing_page"], ["general_adults"]),
    ).toBe("Applies to: landing page, pricing page. Audience: general adults.");
    expect(buildAppliesWhen([], [])).toBeUndefined();
  });
});

describe("status rules", () => {
  it("marks VERIFIED only with the verified flag, a source title and a url or doi", async () => {
    const result = await run();
    const status = (w: string) => bySlug(result, w).output.status;
    expect(
      ["one", "two", "three", "four", "eight", "nine"].map(status),
    ).toEqual(Array(6).fill("VERIFIED"));
    expect(bySlug(result, "five").reasons).toEqual([
      "verified flag is not true",
    ]);
    expect(bySlug(result, "six").reasons).toEqual([
      "no article reference matches sourceUrl",
    ]);
    expect(bySlug(result, "six").output.source).toBeUndefined();
    expect(result.problems.downgraded.map((d) => d.slug).sort()).toEqual([
      "fixture-topic-five",
      "fixture-topic-seven",
      "fixture-topic-six",
      "fixture-topic-ten",
    ]);
  });
  it("downgrades a verified finding whose url is not a url and has no doi", async () => {
    const raw: RawFinding = {
      ...fixture.findings[0]!,
      sourceUrl: "not a url",
    };
    const article: RawArticle = {
      ...fixture.articles[0]!,
      references: [{ title: "Some Study", url: "not a url" }],
    };
    const result = await run([
      { file: "x.json", findings: [raw], articles: [article] },
    ]);
    expect(result.findings[0]!.output.status).toBe("DRAFT");
    expect(result.findings[0]!.reasons).toEqual([
      "sourceUrl is not a valid URL and has no DOI",
    ]);
    expect(result.findings[0]!.output.source).toBeUndefined();
  });
  it("never invents bibliographic fields and omits Phase 2 extras", async () => {
    const f = bySlug(await run(), "one").output;
    expect(f.source).toEqual({
      title: "Placeholder Study One",
      authors: "Placeholder, A.; Sample, B.",
      venue: "Journal of Placeholder Studies",
      year: 2021,
      url: "https://doi.org/10.1000/example.one",
      doi: "10.1000/example.one",
    });
    for (const key of [
      "sourceExcerpt",
      "sourceLocator",
      "confidenceScore",
      "effectSize",
      "contextHeader",
    ])
      expect(f).not.toHaveProperty(key);
    expect(f.relations).toEqual([]);
  });
});

describe("source matching and DOI", () => {
  const refs = [
    { title: "Exact", url: "https://example.org/a#frag" },
    { title: "Plain", url: "https://example.org/a" },
  ];
  it("prefers an exact url match", () => {
    expect(matchReference("https://example.org/a#frag", refs).title).toBe(
      "Exact",
    );
  });
  it("retries ignoring the fragment and trailing slash", () => {
    expect(
      matchReference("https://example.org/a/#other", [refs[1]!]).title,
    ).toBe("Plain");
    expect(matchReference("https://example.org/a/", refs).titles).toEqual([
      "Exact",
      "Plain",
    ]);
    expect(matchReference("https://example.org/zzz", refs).title).toBeNull();
  });
  it("reports several distinct titles for one url", () => {
    const m = matchReference("https://example.org/a", [
      { title: "One", url: "https://example.org/a" },
      { title: "Two", url: "https://example.org/a" },
      { title: "One", url: "https://example.org/a" },
    ]);
    expect(m.titles).toEqual(["One", "Two"]);
  });
  it("matches the fixture fragment, slash and pubmed cases", async () => {
    const result = await run();
    expect(bySlug(result, "two").sourceTitle).toBe("Placeholder Study Two");
    expect(bySlug(result, "three").sourceTitle).toBe("Placeholder Study Three");
    expect(bySlug(result, "four").output.source).toMatchObject({
      title: "Placeholder Study Four",
      url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
    });
    expect(bySlug(result, "four").output.source?.doi).toBeUndefined();
    expect(result.problems.multipleTitles).toEqual([
      {
        slug: "fixture-topic-eight",
        titles: [
          "Placeholder Duplicate Source Alpha",
          "Placeholder Duplicate Source Beta",
        ],
      },
    ]);
  });
  it.each([
    ["https://doi.org/10.1145/3290605.3300233", "10.1145/3290605.3300233"],
    ["https://dx.doi.org/10.1000/abc.def?utm=1", "10.1000/abc.def"],
    ["https://example.org/x/10.12345/part-1#ref", "10.12345/part-1"],
    ["https://pubmed.ncbi.nlm.nih.gov/12345678/", undefined],
    ["https://example.org/10.12/short", undefined],
  ])("extracts a DOI from %s", (url, doi) => {
    expect(extractDoi(url)).toBe(doi);
  });
});

describe("tags and categories", () => {
  const option = (fits: string[]) => ({ value: "v", label: "l", fits });
  it("orders field, decision, fits by frequency then alphabetical", async () => {
    expect(bySlug(await run(), "one").output.tags).toEqual([
      "color-psychology",
      "primary-color",
      "calm-brand",
      "trust",
      "energy",
      "luxury",
    ]);
  });
  it("de-duplicates and kebab-cases", () => {
    expect(
      buildTags("Color_Psychology", "color_psychology", [
        option(["Big_Text", "big text", "big-text"]),
      ]),
    ).toEqual(["color-psychology", "big-text"]);
  });
  it("caps at 12 tags keeping field and decision first", async () => {
    const tags = bySlug(await run(), "ten").output.tags;
    expect(tags).toHaveLength(12);
    expect(tags.slice(0, 3)).toEqual([
      "color-psychology",
      "accent-color",
      "fit-a",
    ]);
  });
  it("maps fields to the enum and never falls back to OTHER", async () => {
    expect(mapCategory("color_psychology")).toBe("COLOR_PSYCHOLOGY");
    expect(mapCategory("motion")).toBe("MOTION");
    expect(mapCategory("typography")).toBe("TYPOGRAPHY");
    expect(mapCategory("made_up")).toBeNull();
    const bad: RawFinding = { ...fixture.findings[0]!, field: "made_up" };
    const result = await run([
      { file: "bad.json", findings: [bad], articles: [] },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.errors[0]).toMatch(/made_up.*no ResearchCategory member/);
  });
});

describe("labels and slugs", () => {
  it("calls the provider once per 20 uncached findings with only the claim", async () => {
    const many: RawFinding[] = Array.from({ length: 45 }, (_, i) => ({
      ...fixture.findings[0]!,
      claim: `Fixture claim n${i} says something unique ${"x".repeat(i)}`,
    }));
    const calls: LabelRequestItem[][] = [];
    await run(
      [{ file: "m.json", findings: many, articles: [] }],
      emptyCache(),
      topicProvider(calls),
    );
    expect(calls.map((c) => c.length)).toEqual([20, 20, 5]);
    expect(Object.keys(calls[0]![0]!).sort()).toEqual(["claim", "key"]);
  });
  it("keeps slugs stable across reruns without calling the model again", async () => {
    const first = await run();
    const calls: LabelRequestItem[][] = [];
    const second = await run(
      [{ file: "a.json", ...fixture }],
      first.cache,
      topicProvider(calls),
    );
    expect(calls).toHaveLength(0);
    expect(second.findings.map((f) => f.slug)).toEqual(
      first.findings.map((f) => f.slug),
    );
    expect(second.cache).toEqual(first.cache);
  });
  it("lets a hand-edited cache label win", async () => {
    const first = await run();
    const key = findingKey(
      fixture.findings[0]!.claim,
      fixture.findings[0]!.sourceUrl,
    );
    first.cache.findings[key] = { title: "Hand edited", slug: "hand-edited" };
    const second = await run(
      [{ file: "a.json", ...fixture }],
      first.cache,
      null,
    );
    const edited = second.findings.find((f) => f.key === key)!;
    expect([edited.slug, edited.title, edited.labelSource]).toEqual([
      "hand-edited",
      "Hand edited",
      "cache",
    ]);
  });
  it("resolves collisions deterministically in key order regardless of input order", async () => {
    const same: LabelProvider = async (items) =>
      items.map((i) => ({
        key: i.key,
        title: "Same topic",
        slug: "same-topic",
      }));
    const [a, b, c] = fixture.findings as [RawFinding, RawFinding, RawFinding];
    const forward = await run(
      [{ file: "x.json", findings: [a, b, c], articles: [] }],
      emptyCache(),
      same,
    );
    const reversed = await run(
      [{ file: "x.json", findings: [c, b, a], articles: [] }],
      emptyCache(),
      same,
    );
    const mapping = (r: ConvertResult) =>
      Object.fromEntries(r.findings.map((f) => [f.key, f.slug]));
    expect(mapping(forward)).toEqual(mapping(reversed));
    expect(forward.findings.map((f) => f.slug).sort()).toEqual([
      "same-topic",
      "same-topic-2",
      "same-topic-3",
    ]);
    const order = [a, b, c].map((f) => findingKey(f.claim, f.sourceUrl)).sort();
    expect(mapping(forward)[order[0]!]).toBe("same-topic");
    expect(mapping(forward)[order[2]!]).toBe("same-topic-3");
  });
  it("never lets a new finding take a cached slug", () => {
    const slugs = assignSlugs([
      { key: "0000", slug: "taken", cached: false },
      { key: "ffff", slug: "taken", cached: true },
    ]);
    expect(slugs.get("ffff")).toBe("taken");
    expect(slugs.get("0000")).toBe("taken-2");
  });
  it("falls back offline: claim truncated at a word boundary, no model call, nothing cached", async () => {
    const long = `${"word ".repeat(30)}end`;
    expect(offlineTitle(long).length).toBeLessThanOrEqual(90);
    expect(offlineTitle(long).endsWith("word")).toBe(true);
    const calls: LabelRequestItem[][] = [];
    const result = await run(
      [{ file: "a.json", ...fixture }],
      emptyCache(),
      topicProvider(calls),
      true,
    );
    expect(calls).toHaveLength(0);
    expect(result.findings.every((f) => f.labelSource === "offline")).toBe(
      true,
    );
    expect(result.cache.findings).toEqual({});
    expect(result.findings.every((f) => f.title.length <= 90)).toBe(true);
  });
  it("uses offline labels when no provider is configured and warns", async () => {
    const result = await run(
      [{ file: "a.json", ...fixture }],
      emptyCache(),
      null,
    );
    expect(result.warnings[0]).toMatch(/INTERNAL_SERVICE_SECRET/);
    expect(result.findings).toHaveLength(10);
  });
  it("rejects model labels that invent numbers and falls back for them", async () => {
    const inventive: LabelProvider = async (items) =>
      items.map((i) => ({
        key: i.key,
        title: "Boosts clicks by 99 percent",
        slug: "boosts-99",
      }));
    const result = await run(
      [{ file: "a.json", findings: [fixture.findings[0]!], articles: [] }],
      emptyCache(),
      inventive,
    );
    expect(result.findings[0]!.labelSource).toBe("offline");
    expect(result.warnings[0]).toMatch(/numbers not in the claim: 99/);
  });
  it("falls back when the provider throws", async () => {
    const result = await run(
      [{ file: "a.json", ...fixture }],
      emptyCache(),
      async () => {
        throw new Error("boom");
      },
    );
    expect(result.warnings[0]).toMatch(/label request failed \(boom\)/);
    expect(result.findings).toHaveLength(10);
  });
  it("slugifies to kebab-case within 60 characters", () => {
    expect(slugify("Café Menu: Large & Bold!")).toBe("cafe-menu-large-bold");
    const long = slugify("alpha ".repeat(30));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("raw parsing", () => {
  const json = '{ "findings": [], "articles": [] }';
  it("strips leading and trailing code fences", () => {
    expect(stripFences("```json\n" + json + "\n```\n").body.trim()).toBe(json);
    expect(stripFences("```\n" + json).body.trim()).toBe(json);
    expect(stripFences(json + "\n```").body.trim()).toBe(json);
    expect(parseRawBatch("```json\n" + json + "\n```").ok).toBe(true);
  });
  it("reports the line and column of a parse error in the original file", () => {
    const parsed = parseRawBatch(
      '```json\n{\n  "findings": [\n    { "claim": }\n  ]\n}\n```',
    );
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toMatch(/line 4, column 16/);
  });
  it("reports truncated input", () => {
    const parsed = parseRawBatch('{ "findings": [');
    expect(!parsed.ok && parsed.error).toMatch(/line 1, column 16/);
  });
  it("keeps valid items and reports invalid ones by index", () => {
    const parsed = parseRawBatch(
      JSON.stringify({
        findings: [fixture.findings[0], { claim: "" }],
        articles: [{ title: "No body" }],
      }),
    );
    expect(parsed.ok && parsed.findings).toHaveLength(1);
    expect(parsed.ok && parsed.errors.map((e) => e.split(":")[0])).toEqual([
      "findings[1]",
      "articles[0]",
    ]);
  });
});

describe("checks", () => {
  it("reports duplicates across batches, few options and unmatched article references", async () => {
    const second = {
      file: "b.json",
      findings: [
        fixture.findings[0]!,
        {
          ...fixture.findings[3]!,
          claim: fixture.findings[3]!.claim + " Indeed.",
        },
      ],
      articles: [] as RawArticle[],
    };
    const result = await run([{ file: "a.json", ...fixture }, second]);
    expect(result.findingsIn).toBe(12);
    expect(result.findings).toHaveLength(11);
    expect(result.problems.duplicateClaims).toEqual([
      { claim: fixture.findings[0]!.claim, files: ["a.json", "b.json"] },
    ]);
    expect(result.problems.nearDuplicates.length).toBeGreaterThan(0);
    expect(result.problems.fewOptions).toEqual([
      { slug: "fixture-topic-seven", count: 2 },
    ]);
    expect(result.problems.unmatchedReferences).toEqual([
      {
        article: "fixture-article-two",
        reference: "Placeholder Orphan Reference",
      },
    ]);
    expect(result.problems.sharedSources[0]!.slugs).toHaveLength(3);
  });
  it("checks urls with HEAD then GET, three at a time, as warnings", async () => {
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      seen.push(`${init.method} ${url}`);
      if (url.endsWith("/head-blocked"))
        return new Response(null, {
          status: init.method === "HEAD" ? 405 : 200,
        });
      if (url.endsWith("/gone")) return new Response(null, { status: 404 });
      if (url.endsWith("/down")) throw new Error("ECONNREFUSED");
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const urls = [
      "ok1",
      "ok2",
      "ok3",
      "head-blocked",
      "gone",
      "down",
      "ok1",
    ].map((p) => `https://example.org/${p}`);
    const checks = await checkUrls(urls, { fetchImpl: fake });
    expect(peak).toBeLessThanOrEqual(3);
    expect(checks).toHaveLength(6);
    expect(
      Object.fromEntries(
        checks.map((c) => [c.url.split("/").pop(), c.problem]),
      ),
    ).toEqual({
      ok1: null,
      ok2: null,
      ok3: null,
      "head-blocked": null,
      gone: "HTTP 404",
      down: "ECONNREFUSED",
    });
    expect(seen).toContain("GET https://example.org/head-blocked");
  });
});

describe("articles", () => {
  it("maps to the ResearchArticle shape", async () => {
    const result = await run();
    expect(result.articles.map((a) => a.slug)).toEqual([
      "fixture-article-one",
      "fixture-article-three",
      "fixture-article-two",
    ]);
    const article = result.articles.find(
      (a) => a.slug === "fixture-article-three",
    )!;
    expect(article.output).toMatchObject({
      kind: "ARTICLE",
      category: "MOTION",
      isPublished: true,
    });
    const data = articleData(article.output);
    expect(Object.keys(data).sort()).toEqual([
      "body",
      "category",
      "isPublished",
      "kind",
      "references",
      "sections",
      "slug",
      "summary",
      "tags",
      "title",
    ]);
    expect(data.sections).toEqual(fixture.articles[2]!.sections);
    expect(data.references).toEqual(fixture.articles[2]!.references);
    expect(() =>
      ArticleFileSchema.parse({ ...article.output, extra: 1 }),
    ).toThrow();
  });
  it("keeps article slugs stable through the cache", async () => {
    const first = await run();
    const again = await run(
      [{ file: "a.json", ...fixture }],
      first.cache,
      null,
    );
    expect(again.articles.map((a) => a.slug)).toEqual(
      first.articles.map((a) => a.slug),
    );
    expect(Object.keys(first.cache.articles)).toHaveLength(3);
  });
  it("upserts idempotently and never changes publishedAt on update", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const store: ArticleStore = {
      find: async (slug) => rows.get(slug) ?? null,
      create: async (data) => void rows.set(data.slug, { ...data }),
      update: async (slug, data) =>
        void rows.set(slug, { ...rows.get(slug), ...data }),
    };
    const files = (await run()).articles.map((a) => a.output);
    const created = new Date("2026-01-01T00:00:00Z");
    expect(await importArticles(store, files, { dryRun: true })).toEqual({
      created: 3,
      updated: 0,
      unchanged: 0,
    });
    expect(rows.size).toBe(0);
    expect(
      await importArticles(store, files, { dryRun: false, now: created }),
    ).toEqual({ created: 3, updated: 0, unchanged: 0 });
    expect(await importArticles(store, files, { dryRun: false })).toEqual({
      created: 0,
      updated: 0,
      unchanged: 3,
    });
    const edited = { ...files[0]!, summary: "Edited summary." };
    expect(
      await importArticles(store, [edited, ...files.slice(1)], {
        dryRun: false,
        now: new Date(),
      }),
    ).toEqual({ created: 0, updated: 1, unchanged: 2 });
    expect(rows.get(edited.slug)).toMatchObject({
      summary: "Edited summary.",
      publishedAt: created,
    });
  });
});

describe("files on disk", () => {
  const setup = async (
    batches: Record<string, string> = { "batch-1.json": fixtureText },
  ) => {
    const dir = await mkdtemp(join(tmpdir(), "corpus-"));
    await mkdir(join(dir, "raw"));
    for (const [name, content] of Object.entries(batches))
      await writeFile(join(dir, "raw", name), content);
    return dir;
  };
  const options = (corpusDir: string, extra = {}) => ({
    corpusDir,
    dryRun: false,
    offline: false,
    checkUrls: false,
    provider: topicProvider(),
    log: () => {},
    ...extra,
  });

  it("writes findings that all pass corpus:validate, plus the cache, articles and reports", async () => {
    const dir = await setup();
    const { exitCode } = await runConvert(options(dir));
    expect(exitCode).toBe(0);
    const names = await readdir(join(dir, "findings"));
    expect(names).toHaveLength(10);
    for (const name of names)
      expect(() =>
        parseFindingFile(
          JSON.parse(readFileSync(join(dir, "findings", name), "utf8")),
          `findings/${name}`,
        ),
      ).not.toThrow();
    expect(await readdir(join(dir, "articles"))).toHaveLength(3);
    const summary = await readFile(join(dir, "_review", "summary.md"), "utf8");
    expect(summary).toMatch(/\| VERIFIED \| 6 \|/);
    expect(summary).toMatch(/\| DRAFT \| 4 \|/);
    expect(await readFile(join(dir, "_review", "problems.md"), "utf8")).toMatch(
      /Fewer than 3 options/,
    );
    expect(
      JSON.parse(await readFile(join(dir, "_labels.json"), "utf8")).articles,
    ).toBeTruthy();
  });
  it("is idempotent and writes nothing in a dry run", async () => {
    const dir = await setup();
    const dry = await runConvert(options(dir, { dryRun: true }));
    expect(dry.exitCode).toBe(0);
    await expect(readdir(join(dir, "findings"))).rejects.toThrow();
    await runConvert(options(dir));
    const again = await runConvert(options(dir, { provider: null }));
    expect(again.changes.every((c) => c.action === "unchanged")).toBe(true);
  });
  it("continues past a broken file and exits non-zero", async () => {
    const dir = await setup({
      "good.json": fixtureText,
      "bad.json": '```json\n{ "findings": [ }\n```',
    });
    const { exitCode, result } = await runConvert(options(dir));
    expect(exitCode).toBe(1);
    expect(result.findings).toHaveLength(10);
    expect(await readFile(join(dir, "_review", "problems.md"), "utf8")).toMatch(
      /bad\.json: parse error at line 2, column 17/,
    );
  });
  it("only overwrites a differing file when it belongs to the same claim", async () => {
    const dir = await setup({
      "one.json": JSON.stringify({
        findings: [fixture.findings[0]],
        articles: [],
      }),
    });
    await runConvert(options(dir));
    const path = join(dir, "findings", "fixture-topic-one.json");
    const original = JSON.parse(await readFile(path, "utf8"));

    await writeFile(
      path,
      JSON.stringify({ ...original, tags: ["stale"] }, null, 2) + "\n",
    );
    const updated = await runConvert(options(dir));
    expect(updated.changes[0]!.action).toBe("update");
    expect(updated.changes[0]!.diff).toMatch(/- .*stale/);
    expect(JSON.parse(await readFile(path, "utf8")).tags).toEqual(
      original.tags,
    );

    const foreign = {
      ...original,
      statement: "A hand written, different claim.",
    };
    await writeFile(path, JSON.stringify(foreign, null, 2) + "\n");
    const skipped = await runConvert(options(dir));
    expect(skipped.changes[0]!.action).toBe("skip");
    expect(JSON.parse(await readFile(path, "utf8")).statement).toBe(
      foreign.statement,
    );
  });
  it("rejects an invalid label cache before writing anything", async () => {
    const dir = await setup();
    await writeFile(
      join(dir, "_labels.json"),
      JSON.stringify({ findings: { k: { title: "T", slug: "Not Kebab" } } }),
    );
    await expect(runConvert(options(dir))).rejects.toThrow(
      /_labels\.json is invalid/,
    );
  });
  it("imports articles from disk and aborts when a file is invalid", async () => {
    const dir = await setup();
    await runConvert(options(dir));
    const rows = new Map<string, Record<string, unknown>>();
    const store: ArticleStore = {
      find: async (slug) => rows.get(slug) ?? null,
      create: async (data) => void rows.set(data.slug, data),
      update: async () => {},
    };
    const ok = await runImportArticles({
      corpusDir: dir,
      dryRun: false,
      store,
      log: () => {},
    });
    expect(ok.counts).toEqual({ created: 3, updated: 0, unchanged: 0 });
    await writeFile(
      join(dir, "articles", "wrong-name.json"),
      await readFile(join(dir, "articles", "fixture-article-one.json")),
    );
    const bad = await runImportArticles({
      corpusDir: dir,
      dryRun: false,
      store,
      log: () => {},
    });
    expect(bad.exitCode).toBe(1);
  });
});
