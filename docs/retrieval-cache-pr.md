# Per-area retrieval cache and shared Jev verification

Research retrieval now checks an exact Redis cache, then metadata-filtered pgvector candidates, before running the existing per-area pipeline. Direct semantic reuse starts at 0.97; similarities from 0.88 to 0.97 can use shared Jev verification. Corpus mutations invalidate cached results transactionally. Provider failures fall back to fresh retrieval, and degraded retrieval results are never cached.

## Implementation decisions

- The nine-area loop remains in `packages/rag/src/retrieval.ts`. Research-service supplies an optional cache hook; uncached consumers and evaluations retain the existing pipeline. A semantic miss reuses its query embedding for dense retrieval.
- Cache keys and SQL candidates isolate area, niche, corpus version, embedding model, retrieval settings, and sparse-search keywords. Expansion happens before caching; cross-area tensions are recomputed afterward.
- Research-service now owns one lazy Redis connection to the existing deployment. No Redis client existed in this app before this change.
- The user authorized implementing the missing `packages/jev`. It provides bounded TypeSafe evaluation, shared `decide()`, decision logs, and off/shadow/on modes. Default is off. Shadow returns baseline immediately; on requires at least 200 comparable shadow decisions and 90% agreement for the same policy.
- SUCCESS/RETIRED ingestion transactions and the existing relation seeder increment CorpusVersion. Stale writes are refused. Stats and dry-run-by-default pruning are available from root scripts.
- A disposable PostgreSQL fixture demonstrated that unguarded Prisma db push removes custom search indexes. CI now checks the proposed SQL before allowing schema synchronization and verifies the resulting catalog. Shared databases use reviewed migrations.

## Verification

- 64 distinct tests passed: Jev (9), research cache/adapter (17), real PostgreSQL cache integration (4), RAG unit/guard tests (26), and RAG PostgreSQL integration (8). Database fixtures rolled back.
- RAG, Jev, research, worker, and orchestrator builds passed; API type checking and eval type checking passed. The final research build includes the CLI hit-rate output.
- Migration `20260930000000_retrieval_cache` was applied and Prisma regenerated. Final read-only inspection confirmed 155 existing findings and zero failed migrations.
- Stats completed. Pruning dry-run reported zero eligible rows; no pruning deletion was performed.
- The disposable pgvector migration fixture passed catalog checks after exercising the guard. Its container and volume were removed.
- API, orchestrator, and research were restarted with rebuilt packages. Frontend (3000), API (4000), orchestrator (4001), and research (4004) all returned HTTP 200. Updated services remain running.
- Authored tracked changes passed `git diff --check`. Generated Prisma output was excluded from whitespace review.

## Remaining live-environment limitations

Redis connectivity is unavailable, so live exact-cache hits and Redis counters could not be verified. The worker remains stopped following the existing Redis quota/connectivity problem. Research-service lacks Voyage and TypeSafe credentials, so no live embedding/verifier retrieval run is claimed. Mocked failure paths and real PostgreSQL cache behavior were verified. Jev remains off.

Configuration, defaults, rollout, and operational commands are documented in [retrieval-cache.md](./retrieval-cache.md). Research-service's local environment received the existing Redis connection setting; example files contain placeholders only.
