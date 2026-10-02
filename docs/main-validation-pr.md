# Main post-generation validation

## Inspection and adaptation

- `packages/validation/src/storage.ts`: the existing shared GCS singleton; `uploadToGcs(key, Buffer, expiresAt)`, `downloadScreenshot(key, expectedPrefix)`, `validationPrefix(pipeline, projectId, runId)`, `deleteGcsPrefix(prefix)`, and `deleteExpiredScreenshots(now?)`. Screenshot TTL is two hours. The RAG work also reuses this singleton; no new client is introduced.
- Package foundations: `compareSchema.ts` contains bounded discrepancy/capture schemas and correction formatting; `decideTier.ts` selects Replicate capture coverage; `runValidationLoop.ts` provides bounded assessment/correction/persistence/cleanup ports; `tier0Checks.ts` checks console/page errors, failed media requests/images, HTTP loads and overflow. `localPreview.ts` and `kubernetesPreview.ts` run generated code in isolated Docker/GKE containers. `Dockerfile` and `preview-entrypoint.sh` provide cached Vite/Next dependencies. `gke-preview.yaml` supplies isolation/RBAC, `gke-cleanup.yaml` supplies independent expiry cleanup, and `gcs-lifecycle.json` is a one-day safety net. Package exports, build config and README already exist.
- `apps/orchestrator-service/src/agents/orchestrator.ts`: the five-agent chain still produces SiteSpec, saves `ProjectVersion.snapshot`, marks the project READY and website AWAITING_APPROVAL, then emits `version_ready`/COMPLETE. Background validation follows those events.
- `PipelineState` still locks RESEARCH/WEBSITE/SEO/DEPLOY using per-step statuses. `PipelineStage` describes generation progress/logs. Validation uses its existing independent status stream and does not change either mechanism.
- `apps/server/src/modules/generate/generate.service.ts`: `GenerateService.authorize` reserves the free grant or checks/deducts paid generation credits. The resulting tier is persisted as `Project.generationTier`. Validation reuses that existing snapshot through `ensureValidationRun`; it must not call charging authorization again or invent a subscription check.
- `apps/worker/src/processors/scan.processor.ts`: existing BullMQ Worker registration, shared Redis, Playwright lifecycle, bounded concurrency and failed-job logging. `scraper/captureSegments.ts` captures a limited sample for scan analysis; MAIN needs complete section coverage across generated routes, so it uses the existing validation scroll-frame pattern.
- `packages/site-builder/src/index.ts` still emits Vite/React with `scripts.dev = "vite --host"`; Replicate uses its Next scaffold. MAIN now derives the dev command/framework from package.json and runs that script inside the existing sandbox. Preinstalled dependencies and isolation are preserved instead of executing arbitrary installs on the worker host.
- `packages/rag/src/tracing.ts` now provides shared Langfuse OTLP tracing from Phase 2. This change does not introduce another telemetry client or dependency; tracing here remains optional future integration.
- `routes/iterate.route.ts`, `agents/iterate.agent.ts`, and `validation/iterateVersion.ts`: ordinary iteration only edits existing section content. The old automatic path bypassed that with `includeDesign=true`. MAIN must use the ordinary content-only path; unsupported/no-op corrections end FAILED_MAX_ITERATIONS, never an architectural rewrite. Replicate keeps its file correction path.

## Design

MAIN is paid-only, fixed threshold 95, at most three assessments/two corrections. It has a separate processor and queue while sharing existing ValidationRun/ValidationIteration tables, cleanup machinery, transport/storage primitives, and renderer isolation. No schema change is needed: pipeline discriminators, unique version/run keys, tier snapshot, screenshot fields, discrepancy JSON, and child-version metadata already exist. Existing column names and mappings stay intact to avoid changing Replicate's schema.

All section screenshots go into a single paid-model vision assessment per iteration (one extra attempt only for malformed structured output). The model checks correctness and the approved text brief, never a source image. Tier 0 runs first and caps any failing result at 60. Corrected versions remain labeled Auto-corrected and never replace the active version. Free MAIN generations create no rows/jobs and show no status badge, including old free-run records.

Runtime prerequisites remain those in `packages/validation/README.md`: GCS/ADC, an isolated preview image/Docker or GKE, a working Redis target, and the paid model provider key. No new environment variables or credit charge are introduced.

## Verification

- Shared validation/events builds, worker/orchestrator builds, and explicit web/API type checks passed.
- 44 regression tests passed: 27 MAIN gate/loop/worker/vision tests, 14 existing Replicate validation tests, and three badge transition tests. The mocked MAIN flow covers all captures in one assessment, fresh previews, correct correction ancestry, fixed limits, Tier 0 score caps, and cleanup.
- Real Playwright smoke passed for a healthy page, missing image, uncaught JavaScript error, horizontal overflow, and event-handler cleanup.
- Frontend, API and orchestrator were restarted with updated code; HTTP checks returned 200 on ports 3000, 4000 and 4001. Both validation endpoints reject unauthenticated requests with 401.
- Worker restart connected to PostgreSQL, then hit Upstash's 500,000-request quota on queue connections. The initial Redis PING succeeded but did not establish queue availability. The worker was stopped to avoid its retry loop. Live validation also requires the existing GCS_BUCKET setting in worker/orchestrator; neither app currently has it configured. No live cloud/model assessment was claimed.
- Frontend lint is blocked by the existing eslint.config.js import of unavailable @repo/eslint-config. The validation-specific diff passes whitespace checks; repository-wide diff checks additionally report whitespace in previously generated Prisma files.

- Local preview image rebuild was attempted, but npm inside Docker cannot verify the registry certificate (UNABLE_TO_VERIFY_LEAF_SIGNATURE). A bounded container npm ping confirmed the certificate failure. The stalled build was stopped; the isolated Docker Vite/Next smoke remains unverified until the trusted CA is available in the image build. The documented internal preview network was created successfully.
