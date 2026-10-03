import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@useframe/db";
import { getRedis } from "../../lib/redis.js";
import type { CacheStore, Candidate, Metadata } from "./cache.js";
export const STATS_KEY = "rag:cache:stats:v1";
export const dbOperation = <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
      return fn(tx);
    },
    { timeout: 2500, maxWait: 1000 },
  );
export function nearest(
  tx: Prisma.TransactionClient,
  meta: Metadata,
  vector: number[],
  limit: number,
) {
  if (vector.length !== 1024 || vector.some((n) => !Number.isFinite(n)))
    throw new Error("Invalid cache embedding");
  const literal = `[${vector.join(",")}]`;
  return tx.$queryRaw<
    Candidate[]
  >`SELECT id, "hydePassage", findings, embedding <=> ${literal}::vector AS distance
    FROM retrieval_cache_entries
    WHERE "decisionArea" = ${meta.area}::"DecisionArea" AND niche = ${meta.niche}::"NicheCategory"
      AND "corpusVersion" = ${meta.version} AND "embeddingModel" = ${meta.model} AND fingerprint = ${meta.fingerprint}
    ORDER BY embedding <=> ${literal}::vector LIMIT ${limit}`;
}
export const cacheStore: CacheStore = {
  version: () =>
    dbOperation(async (tx) => {
      const row = await tx.corpusVersion.findUniqueOrThrow({
        where: { id: 1 },
      });
      return row.version;
    }),
  exact: async (key) => (await (await getRedis())?.get(key)) ?? null,
  nearest: (meta, vector, limit) =>
    dbOperation((tx) => nearest(tx, meta, vector, limit)),
  hit: (id, version) =>
    dbOperation(async (tx) => {
      await tx.retrievalCacheEntry.updateMany({
        where: { id, corpusVersion: version },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      });
    }),
  backfill: async (key, findings, ttl) => {
    await (await getRedis())?.set(key, JSON.stringify(findings), "EX", ttl);
  },
  write: (meta, passage, vector, findings, dedup) =>
    dbOperation(async (tx) => {
      // Serialize equivalent writes and keep the version stable until the insert commits.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${JSON.stringify(meta)}))::text`;
      const rows = await tx.$queryRaw<
        Array<{ version: number }>
      >`SELECT version FROM corpus_version WHERE id = 1 FOR SHARE`;
      if (rows[0]?.version !== meta.version) return false;
      const best = (await nearest(tx, meta, vector, 1))[0];
      if (best && 1 - best.distance >= dedup) {
        await tx.retrievalCacheEntry.update({
          where: { id: best.id },
          data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
        });
      } else {
        const literal = `[${vector.join(",")}]`;
        await tx.$executeRaw`INSERT INTO retrieval_cache_entries (id, "decisionArea", niche, "hydePassage", embedding, "embeddingModel", fingerprint, findings, "corpusVersion")
        VALUES (${randomUUID()}, ${meta.area}::"DecisionArea", ${meta.niche}::"NicheCategory", ${passage}, ${literal}::vector, ${meta.model}, ${meta.fingerprint}, ${JSON.stringify(findings)}::jsonb, ${meta.version})`;
      }
      return true;
    }),
  observe: async (tier, similarity, reused, findings) => {
    const redis = await getRedis();
    if (!redis) return;
    const batch = redis.multi().hincrby(STATS_KEY, `requests.${tier}`, 1);
    if (reused) {
      batch.hincrby(STATS_KEY, `hits.${tier}`, 1);
      if (tier === "exact")
        batch.hincrby(STATS_KEY, "embeddingCallsAvoided", 1);
      if (findings.some((f) => f.rerankScore !== null))
        batch.hincrby(STATS_KEY, "rerankCallsAvoided", 1);
      if (similarity !== null)
        batch
          .hincrbyfloat(STATS_KEY, "similaritySum", similarity)
          .hincrby(STATS_KEY, "similarityCount", 1);
    }
    await batch.exec();
  },
};
