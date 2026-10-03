import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ResearchTrace, type RetrievedFinding } from "@repo/rag";
import { RagEnvSchema } from "@repo/rag/config";
const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  log: vi.fn(async () => {}),
  promotion: vi.fn(async () => true),
}));
vi.mock("./verifier.js", async (original) => ({
  ...(await original<typeof import("./verifier.js")>()),
  verifyForCache: mocks.verify,
}));
vi.mock("@repo/jev", async (original) => {
  const actual = await original<typeof import("@repo/jev")>();
  return {
    ...actual,
    decide: actual.createDecider({
      log: mocks.log,
      promotable: mocks.promotion,
    }),
  };
});
import { flushJev } from "@repo/jev";
import { createAreaCache, type CacheStore, type Context } from "./cache.js";
import { cacheConfig } from "./config.js";
import { normalizeHydePassage, exactCacheKey } from "./normalize.js";
const finding: RetrievedFinding = {
  findingId: "f",
  slug: "research",
  title: "Trust",
  statement: "Evidence improves trust",
  appliesWhen: null,
  category: "CONVERSION",
  rrfScore: 0.03,
  rerankScore: 0.9,
  viaRelation: false,
};
function setup(sim = 0) {
  const store = {
    version: vi.fn(async () => 1),
    exact: vi.fn(async (): Promise<string | null> => null),
    nearest: vi.fn(async () =>
      sim
        ? [
            {
              id: "cached",
              hydePassage: "Old research need",
              findings: [finding],
              distance: 1 - sim,
            },
          ]
        : [],
    ),
    hit: vi.fn(async () => {}),
    backfill: vi.fn(async () => {}),
    write: vi.fn(async () => true),
    observe: vi.fn(async () => {}),
  } satisfies CacheStore;
  const context: Context = {
    area: "CONVERSION",
    input: {
      projectId: "p",
      niche: "SAAS_B2B",
      rawIdea: "Business",
      intakeAnswers: {},
    },
    passage: "Trust for business buyers",
    keywords: ["trust"],
    config: RagEnvSchema.parse({}),
    embeddingModel: "voyage-4",
    trace: new ResearchTrace("test"),
    embed: vi.fn(async () => [1]),
    run: vi.fn(async () => ({
      findings: [{ ...finding, findingId: "fresh" }],
      cacheable: true,
    })),
  };
  return {
    store,
    context,
    run: (mode = "off") =>
      createAreaCache(
        store,
        cacheConfig({ JEV_MODE_RETRIEVAL_CACHE_VERIFY: mode }),
      )(context),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(0.95);
  mocks.promotion.mockResolvedValue(true);
});
afterEach(async () => {
  await flushJev();
  vi.useRealTimers();
});
describe("per-area retrieval cache", () => {
  it("normalizes punctuation, case, Unicode and whitespace", () => {
    expect(normalizeHydePassage("  TRUST—ＢＵＹＥＲＳ!\n now ")).toBe(
      "trust buyers now",
    );
    expect(exactCacheKey("COLOR", "SAAS_B2B", 1, "hello")).not.toBe(
      exactCacheKey("COLOR", "SAAS_B2B", 2, "hello"),
    );
  });
  it("exact hits skip embedding and the entire baseline", async () => {
    const t = setup();
    t.store.exact.mockResolvedValue(JSON.stringify([finding]));
    expect(await t.run()).toEqual([finding]);
    expect(t.context.embed).not.toHaveBeenCalled();
    expect(t.context.run).not.toHaveBeenCalled();
    expect(t.store.nearest).not.toHaveBeenCalled();
  });
  it("high similarity directly reuses findings, increments and backfills without Jev", async () => {
    const t = setup(0.98);
    expect(await t.run()).toEqual([finding]);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(t.store.hit).toHaveBeenCalledWith("cached", 1);
    expect(t.store.backfill).toHaveBeenCalledOnce();
    expect(t.context.run).not.toHaveBeenCalled();
  });
  it("a miss embeds once before baseline and writes through", async () => {
    const t = setup(0.87);
    await t.run();
    expect(t.context.embed).toHaveBeenCalledOnce();
    expect(t.context.run).toHaveBeenCalledOnce();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(t.store.write).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        model: "voyage-4",
        area: "CONVERSION",
        niche: "SAAS_B2B",
      }),
      t.context.passage,
      [1],
      expect.any(Array),
      0.99,
    );
    expect(t.store.backfill).toHaveBeenCalledOnce();
  });
  it("accepts the middle band only in promoted on mode", async () => {
    const t = setup(0.92);
    expect(await t.run("on")).toEqual([finding]);
    expect(t.context.run).not.toHaveBeenCalled();
    expect(mocks.verify).toHaveBeenCalledOnce();
  });
  it.each([0.4, null])(
    "rejected/unavailable middle band (%s) runs and caches baseline",
    async (probability) => {
      const t = setup(0.92);
      mocks.verify.mockResolvedValue(probability);
      expect((await t.run("on"))[0]?.findingId).toBe("fresh");
      expect(t.context.run).toHaveBeenCalledOnce();
      expect(t.store.write).toHaveBeenCalledOnce();
    },
  );
  it("shadow returns baseline without waiting for Jev and logs agreement later", async () => {
    const t = setup(0.92);
    let resolve!: (n: number) => void;
    mocks.verify.mockImplementation(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    expect((await t.run("shadow"))[0]?.findingId).toBe("fresh");
    expect(mocks.log).not.toHaveBeenCalled();
    resolve(0.99);
    await flushJev();
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "shadow",
        agreement: false,
        accepted: true,
      }),
    );
    expect(t.store.hit).not.toHaveBeenCalled();
    expect(t.store.write).toHaveBeenCalledOnce();
  });
  it("off middle band never calls the verifier", async () => {
    const t = setup(0.92);
    await t.run();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(t.context.run).toHaveBeenCalledOnce();
  });
  it("corpus changes invalidate exact and semantic hits", async () => {
    const t = setup(0.99);
    t.store.exact.mockResolvedValue(JSON.stringify([finding]));
    t.store.version.mockResolvedValueOnce(1).mockResolvedValue(2);
    t.store.write.mockResolvedValue(false);
    expect((await t.run())[0]?.findingId).toBe("fresh");
    expect(t.store.backfill).not.toHaveBeenCalled();
  });
  it("corrupt Redis and cache database failures still retrieve", async () => {
    const t = setup();
    t.store.exact.mockResolvedValue("invalid");
    t.store.nearest.mockRejectedValue(new Error("DB timeout"));
    expect((await t.run())[0]?.findingId).toBe("fresh");
  });
  it("degraded pipeline results are never cached", async () => {
    const t = setup();
    t.context.run = vi.fn(async () => ({ findings: [], cacheable: false }));
    await t.run();
    expect(t.store.write).not.toHaveBeenCalled();
    expect(t.store.backfill).not.toHaveBeenCalled();
  });
  it("baseline failures are propagated once, never retried as cache failures", async () => {
    const t = setup(0.92);
    t.context.run = vi
      .fn()
      .mockRejectedValue(new Error("baseline unavailable"));
    await expect(t.run()).rejects.toThrow("baseline unavailable");
    expect(t.context.run).toHaveBeenCalledOnce();
  });
  it("exact keys isolate embedding models and sparse keyword changes", async () => {
    const t = setup();
    await t.run();
    const first = t.store.exact.mock.calls[0]?.[0];
    t.context.embeddingModel = "new-model";
    await t.run();
    expect(t.store.exact.mock.calls[1]?.[0]).not.toBe(first);
    t.context.embeddingModel = "voyage-4";
    t.context.keywords = ["different"];
    await t.run();
    expect(t.store.exact.mock.calls[2]?.[0]).not.toBe(first);
  });
});

it("shadow rejection logs whether a different baseline supports the rejection", async () => {
  const t = setup(0.92);
  mocks.verify.mockResolvedValue(0.1);
  await t.run("shadow");
  await flushJev();
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      agreement: true,
      mode: "shadow",
    }),
  );
});
