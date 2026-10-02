# Phase 2: research corpus ingestion and retrieval

Uploading a hand-authored JSON finding to GCS now queues deterministic ingestion into PostgreSQL. Project retrieval uses one HyDE call, Voyage query embeddings plus PostgreSQL full-text search, RRF, Cohere reranking, and bounded relation expansion. Citations retain full finding text and source metadata, including retired findings, behind an authenticated project-owner API.

## Inspection before implementation

- `apps/worker/src/index.ts` starts existing BullMQ processors with the shared Redis connection; corpus ingestion joins that worker rather than adding a service. Queue contracts live in `packages/events/src/queues.ts` and `payloads.ts`.
- `apps/server/src/app.ts` mounts feature routes. `modules/projects/projects.service.ts` and `modules/plan/plan.service.ts` check authenticated `userId` and `deletedAt`; the new citations route uses that same ownership pattern.
- `packages/validation/src/storage.ts` already contained a lazy GCS client; its shared getter now serves corpus storage too. No Pub/Sub or Voyage client existed. Legacy Cohere reranking remains in `apps/research-service/src/retrieval/rerank.ts`; the new full-text finding pipeline uses the documented v2 HTTP endpoint.
- `packages/evals/src/report.ts` had Langfuse score reporting, but no ingestion/retrieval tracing. RAG adds a small OTLP HTTP exporter with optional parent context and failure-isolated export.
- `apps/orchestrator-service/src/llm/router.ts` exposes `getModelForTier`; HyDE uses its free-tier DeepSeek model and existing provider options, with one attempt. Ingestion never uses a language model.
- `packages/evals` contained `src/runEvals.ts`, scorers, datasets, and reporting. `retrieval/run.ts` adds separate corpus evaluations and four ablation switches.
- Read-only inspection confirmed PostgreSQL 16.15 and pgvector 0.8.0 on `ep-odd-smoke-ap8a8pjz-pooler.c-7.us-east-1.aws.neon.tech`, database `neondb`. The Phase 1 migration was already applied. No Pinecone code/config or Terraform was found.

## Implementation and compatibility

- `packages/db/prisma/migrations/20260929000000_research_corpus/migration.sql` adds the corpus enums/tables, 1024-dimensional chunk vectors, full-text trigger, GIN/HNSW indexes, and normalized citations. Existing IDs, 1536-dimensional legacy embeddings, text columns, relation labels, and JSON citation cache remain. Legacy rows become DRAFT in the new retrieval path until reviewed source JSON is uploaded.
- The migration was generated with a schema-to-schema diff, amended for safe backfills, and executed once inside a rollback-only transaction before deployment. Using `migrate dev` against this shared managed target was avoided to prevent a drift/reset workflow. No reset or reseed occurred. The migration is now applied; Prisma Client was regenerated.
- `packages/rag` exports the exact Phase 1 contract; the research service adapter delegates to it. Mock mode returns empty evidence. Existing decision-specific routes remain compatible.
- Ingestion handles duplicate deliveries, generations, overwrite deletes, delete-before-finalize tombstones, invalid uploads, metadata-only edits, source deduplication, pending relations, and transient retries. Network embedding finishes before transactions; slug locks have stable ordering.
- `GET /api/projects/:projectId/research/citations` verifies project ownership before making an internally authenticated service call. No GCS reads occur when rendering citations.
- Local/GCS ingestion, validation, reembedding, reconciliation, result reports, database logs, Langfuse traces, safe configuration templates, and operator setup are documented in `docs/rag-corpus.md`.
- Existing Phase 1 working-tree edits were preserved and integrated. No frontend component changes were required.

## Verification

- Migration preflight and deployment passed; all 155 existing findings and 5 relations were preserved.
- Seven PostgreSQL integration scenarios passed using mocked providers and rollback-only fixture writes: ingestion/idempotency and invalid-update preservation, deletion/generation order, relation resolution, transient failures, status/model filtering, fallback retrieval/expansion/tensions, and citation replacement/reuse/source views.
- 31 tests passed: 22 core/provider/PubSub/migration-guard tests, 7 PostgreSQL integration scenarios, and 2 Phase 1 adapter tests.
- Shared schemas/events/validation/RAG builds and API/orchestrator/research/worker builds pass. Evaluation runner type-check passes.
- Existing check limitations: `@useframe/db check-types` has no tsconfig; API lint has no ESLint 9 flat configuration. Generated Prisma files contain generator-produced trailing whitespace; authored changes are checked separately.
- Live Voyage/Cohere/GCS/PubSub/Langfuse round trips are not configured in this checkout. Research remains in existing mock mode. Evaluation starter labels reference the build-spec example; the runner rejects missing VERIFIED labels instead of reporting misleading quality metrics. Real corpus quality/ablation scores require uploaded reviewed findings and provider configuration.

## Environment changes

Reused the existing worker `INTERNAL_SERVICE_SECRET` in local `apps/server/.env`, `apps/research-service/.env`, and `apps/orchestrator-service/.env`; no secret values are committed or printed. New `.env.example` files and the complete required/optional/default matrix are in `docs/rag-corpus.md`. Corpus ingestion remains disabled until the bucket, subscription, and Voyage settings are supplied. Shared embedding model/dimension settings must match across ingestion and retrieval. Restart consumers after changing configuration.

## Runtime verification

Frontend (3000), API (4000), orchestrator (4001), and research service (4004) returned HTTP 200. API/orchestrator/research were rebuilt and restarted as hidden processes without watch mode because the local native Node watcher repeatedly restarted them. They remain running; restart them after further edits. Research retains existing mock mode until live provider configuration is supplied.

The worker connected to PostgreSQL and started its processors, but the configured Upstash Redis account rejected commands with `ERR max requests limit exceeded` (limit 500000). The newly launched worker was stopped to prevent continuous retries. Redis also reports an existing eviction policy incompatible with BullMQ's recommended `noeviction`; no remote account settings were changed. Queue operation cannot be verified until the quota is restored or a working Redis target is configured.

HTTP smoke checks verified 401 for unauthenticated public/internal requests, 404 for another user's project, and 422 for invalid internally authenticated retrieval input. The database retains 155 findings and zero integration fixture findings. The owned citation response returned HTTP 200 using a temporary user/project/report; the fixture was removed after the check.
