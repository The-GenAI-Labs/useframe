# Research corpus operations

Phase 2 stores hand-authored findings in PostgreSQL and uses GCS only for ingestion and audit copies. The Research tab reads PostgreSQL through the authenticated API; it does not download finding files. Uploading a finding never calls an LLM. Only query-side HyDE calls the existing orchestrator model router.

## Components and deployment

- `packages/rag/src`: strict file validation, deterministic chunking, Voyage, GCS ingestion, hybrid SQL search, RRF/Cohere, relations, citation persistence, and Langfuse OTLP traces.
- `apps/worker/src/processors/corpus.processor.ts`: Pub/Sub pull messages become durable BullMQ `corpus.ingest` jobs. Ack follows successful enqueue; failures nack. Queue attempts are five, with exponential backoff; completed jobs remain for duplicate suppression.
- `apps/orchestrator-service/src/routes/hyde.route.ts`: one authenticated, schema-validated HyDE call through `getModelForTier("free")`. No automatic LLM retries; failure falls back to the original idea.
- `apps/research-service/src/routes/project.route.ts`: internal retrieval/citation APIs protected by `INTERNAL_SERVICE_SECRET`. Send an optional 32-character hex `x-research-trace-id` to join a parent trace; library callers can use `withResearchTrace(traceId, fn, parentSpanId)`.
- `GET /api/projects/:projectId/research/citations`: the public API authenticates the user, checks project ownership and soft deletion, then proxies the grouped citation view. Missing project/report returns 404; unauthorized requests return 401.

Use Node 24 and the pinned pnpm version. Install, generate Prisma, and build exports before restarting consumers:

```sh
pnpm install
pnpm --dir packages/db exec prisma generate
pnpm --filter @repo/schemas --filter @repo/events --filter @repo/validation build
pnpm --filter @repo/rag build
pnpm --dir packages/db exec prisma migrate deploy
```

The migration preserves legacy finding columns, IDs, relations, and the report JSON citation cache. Legacy findings become DRAFT in the new corpus because their free-text bibliography is insufficient for VERIFIED source validation. Upload reviewed JSON files to enter the new retrieval path. The old decision endpoint continues to use its existing columns and embedding model; its 1536-dimensional vectors are separate from the new 1024-dimensional chunk vectors. No Pinecone integration was found.

The initial migration was generated with `prisma migrate diff` against the inspected pre-change schema, then amended and transaction-tested. `migrate dev` was deliberately avoided on the shared managed database because drift handling can request a reset. Future development migrations should use an isolated database and `migrate dev --create-only`; inspect the SQL before deployment. `pnpm --filter @repo/rag check:migrations` and CI reject drops of the corpus GIN/HNSW indexes or search-vector trigger. Never reset/reseed a shared database to validate this feature.

## Configuration

App-local `.env.example` files contain safe additions. Preserve existing application settings. CLI commands run in `packages/rag` and load its `.env`; evaluations run in `packages/evals` and load its `.env`. They do not inherit `packages/db/.env` automatically. Use the same database target explicitly.

| Variable                                                      | Target `.env`                                  | Required / default                                                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTERNAL_SERVICE_SECRET`                                     | server, research-service, orchestrator-service | Required for internal corpus APIs; the same secret in all three. Existing orchestrator/worker setting is reused. Never expose it to the browser.                            |
| `ORCHESTRATOR_URL`                                            | research-service; rag/evals for live retrieval | Optional, `http://localhost:4001`.                                                                                                                                          |
| `RESEARCH_MOCK`                                               | research-service                               | Existing switch; set `false` for real project retrieval. `true` returns empty evidence, never fabricated citations.                                                         |
| `GCP_PROJECT_ID`                                              | worker, rag                                    | Optional when ADC resolves the project; set for explicit Pub/Sub ownership.                                                                                                 |
| `GCS_RESEARCH_CORPUS_BUCKET`                                  | worker, rag                                    | Required to enable ingestion/GCS CLI operations; omission disables the worker.                                                                                              |
| `CORPUS_PUBSUB_TOPIC`                                         | worker, rag / operator shell                   | Ops notification topic; runtime does not create it.                                                                                                                         |
| `CORPUS_PUBSUB_SUBSCRIPTION`                                  | worker                                         | Required for automatic event delivery; optional for queue-only/manual operation.                                                                                            |
| `EMBEDDING_PROVIDER`                                          | worker, research-service, rag, evals           | Optional, `voyage`; no other provider currently implemented.                                                                                                                |
| `VOYAGE_API_KEY`                                              | worker, research-service, rag, evals           | Required for ingestion and dense retrieval. Retrieval falls back to sparse search if unavailable.                                                                           |
| `EMBEDDING_MODEL`                                             | worker, research-service, rag, evals           | Optional, `voyage-4`. Keep identical across producers and consumers.                                                                                                        |
| `EMBEDDING_DIMS`                                              | worker, research-service, rag, evals           | Optional, `1024`; must match the database column. Startup rejects a mismatch.                                                                                               |
| `COHERE_API_KEY`                                              | research-service, rag/evals for retrieval      | Required for reranking; missing/failing provider falls back to RRF with null rerank scores.                                                                                 |
| `COHERE_RERANK_MODEL`                                         | research-service, rag, evals                   | Optional, `rerank-v4.0-fast`.                                                                                                                                               |
| `RERANK_MIN_SCORE`, `PER_AREA_TOP_K`, `RRF_K`                 | research-service, rag, evals                   | Optional defaults `0.15`, `5`, `60`.                                                                                                                                        |
| `DENSE_CANDIDATES`, `SPARSE_CANDIDATES`, `FUSED_CANDIDATES`   | research-service, rag, evals                   | Optional defaults `40`, `40`, `30`.                                                                                                                                         |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | worker, research-service, rag, evals           | Optional as a complete set; omission disables export. Host example `https://cloud.langfuse.com`; choose your actual region. Export failure never fails ingestion/retrieval. |

`DATABASE_URL` and `REDIS_URL` are existing settings; CLI reconciliation with `--fix` requires Redis. GCS/Pub/Sub use Application Default Credentials (ADC) or Workload Identity, never embedded key files. Restart the affected service after configuration changes. Do not put secret values in committed examples.

Model defaults were checked against [Voyage embeddings documentation](https://docs.voyageai.com/docs/embeddings) and [Cohere model documentation](https://docs.cohere.com/v2/docs/models). Voyage uses separate document/query input types with explicit output dimensions and bounded batches. Changing model names requires `corpus:reembed`; retrieval excludes chunks from other models throughout a partial migration. Changing dimensions also requires a reviewed vector-column/index migration. Langfuse exports use [OTLP HTTP ingestion](https://langfuse.com/integrations/native/opentelemetry).

## GCS and Pub/Sub setup

Use a private bucket with uniform bucket-level access and public access prevention. Keep Object Versioning disabled. If enabled later, subscribe to OBJECT_ARCHIVE too; the consumer treats archive events like deletes. No Terraform was found in this repository, so these commands are operator-run setup.

```sh
gcloud storage buckets create gs://$GCS_RESEARCH_CORPUS_BUCKET --project=$GCP_PROJECT_ID --location=$GCP_REGION --uniform-bucket-level-access --public-access-prevention
gcloud pubsub topics create $CORPUS_PUBSUB_TOPIC --project=$GCP_PROJECT_ID
gcloud pubsub topics create $CORPUS_DEAD_LETTER_TOPIC --project=$GCP_PROJECT_ID
gcloud pubsub subscriptions create $CORPUS_PUBSUB_SUBSCRIPTION --topic=$CORPUS_PUBSUB_TOPIC --dead-letter-topic=$CORPUS_DEAD_LETTER_TOPIC --max-delivery-attempts=5 --ack-deadline=60 --project=$GCP_PROJECT_ID
gcloud pubsub subscriptions create $CORPUS_DEAD_LETTER_SUBSCRIPTION --topic=$CORPUS_DEAD_LETTER_TOPIC --project=$GCP_PROJECT_ID
gcloud storage buckets notifications create gs://$GCS_RESEARCH_CORPUS_BUCKET --topic=$CORPUS_PUBSUB_TOPIC --event-types=OBJECT_FINALIZE,OBJECT_DELETE --object-prefix=findings/
```

`GCP_REGION`, `CORPUS_DEAD_LETTER_TOPIC`, and `CORPUS_DEAD_LETTER_SUBSCRIPTION` above are operator-shell placeholders, not app environment additions. Grant the Cloud Storage service agent Pub/Sub publisher on the source topic. Grant the Pub/Sub service agent publisher on the dead-letter topic and subscriber on the source subscription so dead-letter forwarding works. Grant the worker service account subscriber on its subscription and object viewer on the bucket; grant object creation/replacement rights restricted by an IAM condition to `_reports/`. Reports overwrite their existing key, so replacement requires both create and delete rights. Bind the Kubernetes service account to that Google service account through Workload Identity. Keep corpus uploads restricted to the author/operator.

Pub/Sub delivery retries cover enqueue failure. Once acknowledged, BullMQ retries cover processing failures; terminal jobs remain in Redis and produce FAILED logs/reports. Monitor both the Pub/Sub dead-letter subscription and failed BullMQ jobs. Do not purge recent completed jobs while their Pub/Sub deliveries can still be replayed.

## Authoring and recovery

One strict JSON object per `findings/<kebab-case-slug>.json`; filename must match `slug`. Required fields: `slug`, `status` (DRAFT/VERIFIED), existing research `category`, `title` (1–120 chars), exact nonempty `statement`, lowercase `tags` (at most 12). Optional fields are `appliesWhen`, `confidenceScore`, `effectSize`, `source`, `sourceExcerpt`, `sourceLocator`, `relations`. Unknown keys fail validation. VERIFIED requires source title and URL or DOI; this validates provenance structure, not the truth of the claim. The author remains responsible for reviewing evidence.

Relations contain target `slug`, `type` (SUPPORTS, CONFLICTS, REFINES, OFTEN_CITED_TOGETHER), and optional `note`. Unknown targets remain pending until their files arrive. Bibliographic metadata never enters embeddings. Text is kept exactly as supplied; chunks are overlapping slices, never summaries.

```sh
pnpm corpus:validate ./my-findings
pnpm corpus:ingest ./my-findings
pnpm corpus:ingest gs://$GCS_RESEARCH_CORPUS_BUCKET/findings/
pnpm corpus:reembed --all
pnpm corpus:reembed --slug fitts-law-cta-target-size
pnpm corpus:reconcile
pnpm corpus:reconcile --fix
gcloud storage rsync ./my-findings gs://$GCS_RESEARCH_CORPUS_BUCKET/findings/
```

Use absolute local paths because pnpm runs CLI scripts from the package directory. Keep source files in Git; rsync uploads them and Git retains their history. Local imports without a bucket write database logs and print results; they have no remote audit/report copy. Do not mix local imports with a live GCS object of the same name; upload edits to GCS instead. Reembedding reloads the exact stored GCS generation and requires a bucket.

Read `_reports/findings/<slug>.result.json` and `corpus_ingestion_logs` for outcomes. Invalid uploads preserve the last good version. Overwrite-delete events are ignored; real deletes retire findings and remove chunks while retaining citation text. Generations are compared numerically, and tombstones prevent late FINALIZE events from resurrecting deleted versions. Concurrent writes lock the affected slugs in stable order; embedding network calls finish before the transaction begins. Reconciliation reports unresolved targets even when no automatic fix is possible; upload the missing target or correct its declaration.

Reports are a latest-attempt convenience view; database logs retain individual outcomes. If report delivery fails after a database commit, the retry is safe and may report SKIPPED_UNCHANGED. Check the preceding SUCCESS log when diagnosing this case.

## Verification and evaluation

```sh
pnpm --filter @repo/rag test
pnpm --filter @repo/rag test:integration
pnpm --filter @useframe/research-service test
pnpm --filter @repo/rag check:migrations
pnpm eval:retrieval
pnpm eval:retrieval -- --no-hyde --no-rerank
pnpm eval:retrieval -- --dense-only
pnpm eval:retrieval -- --sparse-only
```

Integration tests use `packages/db/.env` and the migrated schema, mock external providers, and roll back every fixture write in one transaction. Normal unit tests skip the database suite unless DATABASE_URL is present. Run against a dedicated test database when available. Tests cover generation handling, invalid updates, metadata embedding reuse, pending edges, model/status filtering, rerank/query-embedding fallbacks, relation caps, tensions, and citation reuse counts.

Evaluation case files in `packages/evals/retrieval/cases` are starter labels for the finding slug in the build specification, not evidence that this corpus already contains that finding. Replace/expand them with reviewed labels from your uploaded corpus. The runner refuses to score missing or unverified expected findings. With real labeled data it prints recall@5, MRR, empty-area rate, and mean non-null rerank score. Run all four ablations on the same corpus/model snapshot; no-HyDE uses the raw idea. An empty area is an acceptable retrieval result; downstream consumers must not invent supporting evidence.

## Local verification status

The implementation and migration are installed in this checkout. Live corpus ingestion remains disabled because the GCS/PubSub and Voyage settings are not configured; research retains its existing mock setting. The worker cannot process jobs while the configured Upstash account rejects requests with its exhausted 500000-request quota. Restore quota or configure an available Redis instance before restarting the worker. This is independent of the corpus provider settings. Frontend/API/orchestrator/research health checks passed; API/orchestrator/research were left running without watch mode after local watcher restart loops.
