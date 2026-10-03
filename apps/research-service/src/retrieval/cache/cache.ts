import { decide, jevConfig } from "@repo/jev";
import { ResearchTrace, withResearchTrace } from "@repo/rag";
import {
  verifyForCache,
  overlapRatio,
  CACHE_VERIFY_QUESTIONS,
} from "./verifier.js";
import { z } from "zod";
import { ResearchCategoryEnum } from "@repo/schemas";
import type { AreaRetrievalCache, RetrievedFinding } from "@repo/rag";
import { type CacheConfig } from "./config.js";
import { exactCacheKey, normalizeHydePassage, hash } from "./normalize.js";
export type Context = Parameters<AreaRetrievalCache>[0];
export type Metadata = {
  area: Context["area"];
  niche: Context["input"]["niche"];
  version: number;
  model: string;
  fingerprint: string;
};
export type Candidate = {
  id: string;
  hydePassage: string;
  findings: unknown;
  distance: number;
};
export type CacheTier =
  | "exact"
  | "semantic_direct"
  | "semantic_verified"
  | "miss";
export interface CacheStore {
  version(): Promise<number>;
  exact(key: string): Promise<string | null>;
  nearest(
    meta: Metadata,
    vector: number[],
    limit: number,
  ): Promise<Candidate[]>;
  hit(id: string, version: number): Promise<void>;
  backfill(
    key: string,
    findings: RetrievedFinding[],
    ttl: number,
  ): Promise<void>;
  write(
    meta: Metadata,
    passage: string,
    vector: number[],
    findings: RetrievedFinding[],
    dedup: number,
  ): Promise<boolean>;
  observe(
    tier: CacheTier,
    similarity: number | null,
    reused: boolean,
    findings: RetrievedFinding[],
  ): Promise<void>;
}
const FindingsSchema = z
  .array(
    z.object({
      findingId: z.string().min(1),
      slug: z.string(),
      title: z.string(),
      statement: z.string(),
      appliesWhen: z.string().nullable(),
      category: ResearchCategoryEnum,
      rrfScore: z.number().finite(),
      rerankScore: z.number().finite().nullable(),
      viaRelation: z.boolean(),
    }),
  )
  .max(100);
const ignoreCacheFailure = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch {}
};
export function createAreaCache(
  store: CacheStore,
  config: CacheConfig,
): AreaRetrievalCache {
  return async (context) => {
    const { area, input, passage, trace } = context;
    let tier: CacheTier = "miss";
    let similarity: number | null = null;
    let reused = false;
    let fresh: Awaited<ReturnType<Context["run"]>> | undefined;
    let baselinePromise: Promise<RetrievedFinding[]> | undefined;
    const baseline = () =>
      (baselinePromise ??= context.run().then((result) => {
        fresh = result;
        return result.findings;
      }));
    let confidence: number | null = null;
    let version: number;
    let vector: number[];
    let meta: Metadata;
    let key: string;
    const lookup = await trace.span(
      `${area}.cache_lookup`,
      { area, niche: input.niche },
      async () => {
        try {
          version = await store.version();
          // Keywords affect sparse search; retrieval settings and model changes must not reuse older answers.
          const c = context.config;
          const fingerprint = hash(
            JSON.stringify([
              "area-cache-v1",
              context.embeddingModel,
              c.EMBEDDING_DIMS,
              c.COHERE_RERANK_MODEL,
              c.RERANK_MIN_SCORE,
              c.PER_AREA_TOP_K,
              c.RRF_K,
              c.DENSE_CANDIDATES,
              c.SPARSE_CANDIDATES,
              c.FUSED_CANDIDATES,
              [...new Set(context.keywords.map((k) => k.toLowerCase()))].sort(),
            ]),
          );
          meta = {
            area,
            niche: input.niche,
            version,
            model: context.embeddingModel,
            fingerprint,
          };
          key = `${exactCacheKey(area, input.niche, version, normalizeHydePassage(passage))}:${fingerprint}`;
          let exact: string | null = null;
          try {
            exact = await store.exact(key);
          } catch {}
          if (exact) {
            try {
              const findings = FindingsSchema.parse(JSON.parse(exact));
              if ((await store.version()) === version) {
                tier = "exact";
                reused = true;
                return findings;
              }
            } catch {}
          }
          vector = await context.embed();
          const candidates = await store.nearest(
            meta,
            vector,
            config.CACHE_SEMANTIC_CANDIDATES,
          );
          const best = candidates[0];
          if (!best || !Number.isFinite(best.distance)) return null;
          similarity = 1 - best.distance;
          const parsed = FindingsSchema.safeParse(best.findings);
          if (!parsed.success || similarity < config.CACHE_SIM_LOW) return null;
          if (
            similarity >= config.CACHE_SIM_HIGH &&
            (await store.version()) === version
          ) {
            tier = "semantic_direct";
            reused = true;
            await ignoreCacheFailure(() => store.hit(best.id, version));
            await ignoreCacheFailure(() =>
              store.backfill(key, parsed.data, config.CACHE_EXACT_TTL_SECONDS),
            );
            return parsed.data;
          }
          if (similarity < config.CACHE_SIM_HIGH) {
            tier = "semantic_verified";
            const result = await decide<RetrievedFinding[]>({
              feature: "retrieval_cache_verify",
              mode: config.JEV_MODE_RETRIEVAL_CACHE_VERIFY,
              policyKey: hash(
                JSON.stringify([
                  CACHE_VERIFY_QUESTIONS,
                  jevConfig().JEV_MODEL,
                  config.JEV_CACHE_ACCEPT_THRESHOLD,
                  context.embeddingModel,
                  c.COHERE_RERANK_MODEL,
                  c.RERANK_MIN_SCORE,
                  c.PER_AREA_TOP_K,
                  c.RRF_K,
                  c.DENSE_CANDIDATES,
                  c.SPARSE_CANDIDATES,
                  c.FUSED_CANDIDATES,
                  config.CACHE_SIM_LOW,
                  config.CACHE_SIM_HIGH,
                ]),
              ),
              baseline,
              viaJev: async (signal) => {
                confidence = await verifyForCache(
                  passage,
                  { hydePassage: best.hydePassage, findings: parsed.data },
                  signal,
                );
                return !signal.aborted &&
                  confidence !== null &&
                  confidence >= config.JEV_CACHE_ACCEPT_THRESHOLD &&
                  (await store.version()) === version
                  ? parsed.data
                  : null;
              },
              same: (a, b) => overlapRatio(a, b) >= 0.6,
              rejectedAgreement: (baseline) =>
                confidence !== null &&
                confidence < config.JEV_CACHE_ACCEPT_THRESHOLD
                  ? overlapRatio(parsed.data, baseline) < 0.6
                  : null,
              logInput: {
                area,
                niche: input.niche,
                sim: similarity,
                candidateId: best.id,
              },
              confidence: () => confidence,
              onDecision: (event) => {
                // Shadow verdicts may finish after the parent request exports its trace.
                withResearchTrace(
                  trace.traceId,
                  () => {
                    const verifierTrace = new ResearchTrace(
                      "research.cache_verifier",
                      { area, ...event },
                    );
                    void verifierTrace.finish("SUCCESS");
                  },
                  trace.spanId,
                );
              },
            });
            if (!fresh) {
              reused = true;
              await ignoreCacheFailure(() => store.hit(best.id, version));
              await ignoreCacheFailure(() =>
                store.backfill(key, result, config.CACHE_EXACT_TTL_SECONDS),
              );
            }
            return result;
          }
          return null;
        } catch {
          return null;
        }
      },
      () => ({
        exactHit: tier === "exact",
        similarity,
        tier,
        reused,
        verifier:
          tier === "semantic_verified"
            ? {
                mode: config.JEV_MODE_RETRIEVAL_CACHE_VERIFY,
                confidence,
                reused,
              }
            : undefined,
      }),
    );
    const findings = lookup ?? fresh?.findings ?? (await baseline());
    if (reused) trace.tag(`${area}.cache_skipped_retrieval`, true);
    if (fresh?.cacheable && meta! && key! && vector!) {
      await ignoreCacheFailure(async () => {
        if (
          await store.write(
            meta,
            passage,
            vector,
            findings,
            config.CACHE_DEDUP_SIM,
          )
        )
          await store.backfill(key, findings, config.CACHE_EXACT_TTL_SECONDS);
      });
    }
    await ignoreCacheFailure(() =>
      store.observe(tier, similarity, reused, findings),
    );
    return findings;
  };
}
