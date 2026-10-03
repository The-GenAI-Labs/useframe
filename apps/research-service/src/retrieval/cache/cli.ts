import { prisma } from "@useframe/db";
import { getRedis, closeRedis } from "../../lib/redis.js";
import { STATS_KEY } from "./store.js";
const args = process.argv.slice(2).filter((a) => a !== "--");
const [command] = args;
if (
  !["stats", "prune"].includes(command ?? "") ||
  args.slice(1).some((a) => a !== "--yes")
)
  throw new Error("Usage: retrieval-cache stats | prune [--yes]");
try {
  const { version } = await prisma.corpusVersion.findUniqueOrThrow({
    where: { id: 1 },
  });
  if (command === "stats") {
    let metrics: Record<string, string> | null = null;
    try {
      metrics = (await (await getRedis())?.hgetall(STATS_KEY)) ?? null;
    } catch {}
    const count = (field: string) => Number(metrics?.[field] ?? 0);
    const tiers = ["exact", "semantic_direct", "semantic_verified", "miss"];
    const requests = tiers.reduce((n, t) => n + count(`requests.${t}`), 0);
    const rows = await prisma.retrievalCacheEntry.groupBy({
      by: ["corpusVersion"],
      _count: true,
    });
    const evidence = await prisma.jevDecisionLog.groupBy({
      by: ["policyKey", "agreement"],
      where: {
        feature: "retrieval_cache_verify",
        mode: "shadow",
        agreement: { not: null },
      },
      _count: true,
    });
    console.log(
      JSON.stringify(
        {
          currentVersion: version,
          shadowEvidence: evidence,
          metricsAvailable: metrics !== null,
          tiers: Object.fromEntries(
            tiers.map((t) => [
              t,
              {
                requests: count(`requests.${t}`),
                hits: count(`hits.${t}`),
                hitRate: count(`requests.${t}`)
                  ? count(`hits.${t}`) / count(`requests.${t}`)
                  : null,
                shareOfAllRequests: requests
                  ? count(`hits.${t}`) / requests
                  : null,
              },
            ]),
          ),
          averageSemanticHitSimilarity: count("similarityCount")
            ? count("similaritySum") / count("similarityCount")
            : null,
          estimatedEmbeddingCallsAvoided: count("embeddingCallsAvoided"),
          estimatedRerankCallsAvoided: count("rerankCallsAvoided"),
          pricing: {
            voyage4UsdPerMillionTokens: 0.06,
            cohereRerankPerCallUsd: null,
            note: "No fixed per-call embedding price; token usage is not inferred. Cohere current public Rerank 4 pricing is per-instance, so no fabricated per-call dollar savings.",
            sources: [
              "https://docs.voyageai.com/docs/pricing",
              "https://cohere.com/pricing",
            ],
            checkedAt: "2026-09-30",
          },
          rowsByCorpusVersion: rows.map((row) => ({
            version: row.corpusVersion,
            rows: row._count,
            stale: row.corpusVersion < version,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    const cutoff = new Date(Date.now() - 30 * 86400000);
    const where = {
      OR: [
        { corpusVersion: { lt: version } },
        { hitCount: 0, createdAt: { lt: cutoff } },
      ],
    };
    const eligible = await prisma.retrievalCacheEntry.count({ where });
    if (!args.includes("--yes"))
      console.log(
        JSON.stringify({
          dryRun: true,
          eligible,
          instruction: "Pass --yes to delete eligible cache rows.",
        }),
      );
    else
      console.log(
        JSON.stringify({
          dryRun: false,
          deleted: (await prisma.retrievalCacheEntry.deleteMany({ where }))
            .count,
        }),
      );
  }
} finally {
  closeRedis();
  await prisma.$disconnect();
}
