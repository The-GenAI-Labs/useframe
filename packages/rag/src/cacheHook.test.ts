import { it, expect, vi } from "vitest";
import { prisma } from "@useframe/db";
import { createRetriever, type RetrievalDependencies } from "./retrieval.js";
import { RagEnvSchema } from "./config.js";
import { DECISION_AREAS, type RetrievedFinding } from "./contract.js";
const input = {
  projectId: "fixture",
  rawIdea: "Research",
  niche: "SAAS_B2B" as const,
  intakeAnswers: {},
};
const finding: RetrievedFinding = {
  findingId: "cached",
  slug: "cached",
  title: "Cached",
  statement: "Statement",
  appliesWhen: null,
  category: "LAYOUT",
  rrfScore: 0.1,
  rerankScore: 0.9,
  viaRelation: false,
};
function setup() {
  const conflicts = vi.fn(async () => [
    { findingId: "cached", relatedFindingId: "fresh", note: "tension" },
  ]);
  const deps: RetrievalDependencies = {
    db: {
      researchFinding: {
        findMany: async () => [
          {
            id: "fresh",
            slug: "fresh",
            title: "Fresh",
            statement: "Statement",
            appliesWhen: null,
            category: "LAYOUT",
          },
        ],
      },
      findingRelation: {
        findMany: async (args: { where: { relationType: unknown } }) =>
          args.where.relationType === "CONFLICTS" ? conflicts() : [],
      },
    } as unknown as typeof prisma,
    config: RagEnvSchema.parse({}),
    embedder: {
      model: "fixture",
      dims: 1,
      embedQuery: vi.fn(async () => [1]),
      embedQueries: vi.fn(async (texts: string[]) => texts.map(() => [1])),
      embedDocuments: async () => [],
    },
    hyde: async () => ({
      areas: DECISION_AREAS.map((area) => ({
        area,
        applies: area === "COLOR" || area === "LAYOUT",
        passage: "Needs",
        keywords: ["needs"],
      })),
    }),
    dense: vi.fn(async () => [{ id: "fresh", score: 1 }]),
    sparse: vi.fn(async () => []),
    rerank: vi.fn(async () => [{ index: 0, relevance_score: 0.9 }]),
  };
  return { deps, conflicts };
}
it("mixed cached/fresh areas recompute tensions and a miss reuses the same embedding", async () => {
  const { deps, conflicts } = setup();
  deps.areaCache = async (ctx) => {
    if (ctx.area === "COLOR") return [finding];
    await ctx.embed();
    return (await ctx.run()).findings;
  };
  const result = await createRetriever(deps)(input);
  expect(deps.embedder.embedQueries).toHaveBeenCalledOnce();
  expect(deps.embedder.embedQuery).not.toHaveBeenCalled();
  expect(deps.dense).toHaveBeenCalledOnce();
  expect(deps.rerank).toHaveBeenCalledOnce();
  expect(result.areas[0]?.findings[0]?.findingId).toBe("cached");
  expect(result.tensions).toEqual([
    { findingIdA: "cached", findingIdB: "fresh", note: "tension" },
  ]);
  expect(conflicts).toHaveBeenCalledOnce();
});
it("no-cache bypasses every cache hook and embeds all passages in one request", async () => {
  const { deps } = setup();
  deps.areaCache = vi.fn();
  await createRetriever(deps, { noCache: true })(input);
  expect(deps.areaCache).not.toHaveBeenCalled();
  expect(deps.embedder.embedQueries).toHaveBeenCalledOnce();
  expect(deps.embedder.embedQueries).toHaveBeenCalledWith(["Needs", "Needs"]);
  expect(deps.dense).toHaveBeenCalledTimes(2);
});
it("provider fallback results are flagged as uncacheable", async () => {
  const { deps } = setup();
  deps.rerank = vi.fn().mockRejectedValue(new Error("provider down"));
  const statuses: boolean[] = [];
  deps.areaCache = async (ctx) => {
    const result = await ctx.run();
    statuses.push(result.cacheable);
    return result.findings;
  };
  await createRetriever(deps)(input);
  expect(statuses).toEqual([false, false]);
});
