# Per-area retrieval cache

Research-service wraps the existing RAG per-area operation with Redis exact lookup, pgvector semantic lookup, and shared Jev verification. HyDE still runs once per project, area concurrency stays three, and cross-area tensions are recomputed after all areas resolve. Cache hits skip retrieval work; a semantic miss passes the one already-computed embedding to dense search. Degraded provider-fallback results are returned normally but never written into the cache.

Exact keys contain area, niche, corpus version and the normalized passage hash. A suffix isolates the embedding model, retrieval settings and sparse-search keywords. PostgreSQL applies the same metadata filters before cosine ranking. Scores at or above 0.97 reuse findings directly; below 0.88 runs the normal pipeline. The middle band delegates to `@repo/jev`.

The shared Jev package was absent in this checkout and was implemented with user authorization. It uses the [official TypeSafe API](https://docs.typesafe.ai/api), not a separate LLM fixer or unofficial gateway. `noul` is a yes-probability. Acceptance requires at least 0.75. The 1-second default deadline aborts the HTTP request and falls back even if a provider promise never resolves. Missing credentials, invalid responses and provider errors return baseline retrieval.

## Rollout

The default is `off`, as required by the acceptance checklist. Configure `shadow` for the initial rollout after supplying a TypeSafe API key. Shadow always returns fresh retrieval and computes agreement in the background. Logs contain area/niche/similarity/candidate identifiers and probability, never raw passages or keys. Accepted findings are compared by finding-ID Jaccard overlap (at least 0.6); known rejections are compared with the opposite outcome. Unavailable verdicts are not counted as agreement.

Setting `on` does not automatically promote the feature: the shared wrapper requires at least 200 comparable shadow decisions and at least 90% agreement among the latest 1,000 for the same verifier prompt, pinned model, threshold and retrieval settings. Otherwise it stays in shadow. This implementation does not enable `on` in any environment.

## Setup

Apply `20260930000000_retrieval_cache`, regenerate Prisma, rebuild `@repo/rag` and `@repo/jev`, and restart research-service and corpus workers. The migration adds RetrievalCacheEntry, singleton CorpusVersion, JevDecisionLog and a cosine HNSW index. Ingestion updates the version in its existing advisory-locked transaction; the legacy relation seeder also invalidates transactionally. Future finding/relation mutation paths must do the same. Cache writes hold a shared version lock and refuse stale writes; Redis keys for old versions are unreachable and expire naturally.

Use `apps/research-service/.env`. All tuning values are optional:

| Variable                        | Default    | Purpose                                                                                                                                                     |
| ------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REDIS_URL                       | omitted    | Existing Redis deployment; required for exact caching and aggregate counters. One app-local connection is reused. Without it the semantic tiers still work. |
| CACHE_SIM_HIGH                  | 0.97       | Direct reuse threshold                                                                                                                                      |
| CACHE_SIM_LOW                   | 0.88       | Minimum similarity for verifier consideration                                                                                                               |
| CACHE_SEMANTIC_CANDIDATES       | 3          | Candidate limit                                                                                                                                             |
| CACHE_DEDUP_SIM                 | 0.99       | Skip inserting a near duplicate                                                                                                                             |
| CACHE_EXACT_TTL_SECONDS         | 2592000    | Redis hygiene TTL, maximum 30 days                                                                                                                          |
| JEV_CACHE_ACCEPT_THRESHOLD      | 0.75       | Minimum yes-probability                                                                                                                                     |
| JEV_MODE_RETRIEVAL_CACHE_VERIFY | off        | off/shadow/on; use shadow before promotion                                                                                                                  |
| TYPESAFE_API_KEY                | empty      | Required for actual Jev requests in shadow/on; unavailable calls otherwise safely fall back                                                                 |
| JEV_MODEL                       | jev-1.13.0 | Pinned verifier model; changes reset promotion evidence                                                                                                     |
| JEV_TIMEOUT_MS                  | 1000       | Verifier deadline, 50–10000ms                                                                                                                               |

Restart research-service after configuration changes. Keep credentials server-side. Redis or cache-database errors only disable cache reuse; they do not suppress the fresh retrieval path. No credentials are required for mocked tests.

## Operations and evaluation

- `pnpm retrieval-cache:stats`: Redis hit counters by tier, average semantic-hit similarity, estimated embedding/rerank calls avoided, Jev shadow evidence, and rows grouped by corpus version. Counters describe observations since their Redis key was created and are unavailable if Redis is unavailable; row hitCount includes dedup writes and is not substituted for request hit-rate.
- `pnpm retrieval-cache:prune`: dry-run eligible row count. Add `--yes` to delete old-version rows and never-hit rows older than 30 days, including in CI. Redis expiration provides independent key hygiene.
- `pnpm eval:retrieval -- --no-cache`: full pipeline quality metrics. Evaluations are uncached by default and all ablations bypass the cache, so cache hit rates cannot improve Recall/MRR figures.
- `pnpm --filter @repo/jev test`, `pnpm --filter @useframe/research-service test`, and `pnpm --filter @repo/rag test`: mocked regression suites. PostgreSQL integration suites run when DATABASE_URL is supplied and roll back all fixtures.

Avoided call counts are estimates, not billing savings. [Voyage prices embeddings by tokens](https://docs.voyageai.com/docs/pricing), with voyage-4 listed at $0.06/million tokens. [Cohere's current public Rerank pricing](https://cohere.com/pricing) is per instance rather than a fixed per-request quote. Stats report those pricing limitations instead of inventing a per-call dollar estimate. Pricing checked September 30, 2026.

## Observability and migration protection

Each area starts with a `cache_lookup` span carrying tier, exact-hit status, semantic similarity and reuse status. Reused areas tag the trace to explain skipped downstream spans. Background Jev decisions export a linked verifier trace even if the retrieval trace already finished. Decision logs share one table across Jev features.

The migration guard rejects removal of protected indexes/triggers and the vector extension. A disposable PostgreSQL test confirmed that raw `prisma db push` drops all three custom search indexes with the installed Prisma version. The CI fixture therefore inspects the proposed schema-push SQL first: `check-migrations.mjs --diff <sql-file>` exits 2 if it drops protected objects. Only a safe diff may proceed to db push; catalog checks then confirm preservation. Use reviewed migrations on shared databases. This guard prevents unsupported Prisma schema synchronization from silently removing search indexes.
