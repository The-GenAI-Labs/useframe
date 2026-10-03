# Post-generation validation

Generation returns its preview before validation enqueueing finishes. Paid MAIN compares rendered sections across generated routes with the approved DesignBrief, falling back to the existing ResearchReport GenerationSpec or report fields. It detects the generated package.json dev script. Replicate compares actual Next.js renders against the screenshots saved by its original deep capture. No source-page refetch and no credit deductions occur. MAIN uses the existing paid model router and a separate validateMain queue: threshold 95, at most three assessments and two content-only corrections. Free MAIN creates no validation rows or jobs and displays no badge. Replicate keeps Claude comparisons and its existing free 90/2 and paid 95/3 limits. A correction uses `/iterate`, creates an immutable child version, and does not update the project's current version.

Existing validation tables and migrations are reused; this MAIN update requires no new migration. Existing replicas have no saved validation ground truth and cannot be retrospectively verified. New runs require configuration below. Without GCS_BUCKET, normal generation remains available and validation is disabled. A missing Claude key, inaccessible bucket, missing brief, expired capture, or unavailable isolated renderer produces ERROR; the badge is hidden and server logs record the reason.

## Configuration

- `apps/worker/.env` and `apps/orchestrator-service/.env`: `GCS_BUCKET` (required to enable validation; no default). Use the same private bucket.
- `apps/worker/.env` and `apps/orchestrator-service/.env`: `INTERNAL_SERVICE_SECRET` (same existing worker secret; required for validation HTTP calls; never expose it to the web app).
- `apps/orchestrator-service/.env`: `ANTHROPIC_API_KEY` (existing variable; required for the paid model router and Replicate validation).
- `apps/worker/.env`: `ORCHESTRATOR_URL` (optional, defaults to http://localhost:4001; use the internal service URL on GKE).
- `apps/worker/.env`: `VALIDATION_PREVIEW_IMAGE` (defaults locally to useframe-validation:local; required registry image on GKE), `VALIDATION_PREVIEW_NAMESPACE` (optional, useframe-validation), `VALIDATION_RUNTIME_CLASS` (optional, gvisor).
- GCS uses Application Default Credentials. Locally run `gcloud auth application-default login`; on GKE use Workload Identity for the worker and orchestrator service accounts. Grant object create/read/list/delete on this bucket, preferably restricted to validation/. Do not mount cloud credentials into preview pods. Restart worker/orchestrator after configuring.
- R2 screenshot uploads and their four worker R2 environment variables have been removed. Remove obsolete R2 values from apps/worker/.env; they are no longer used. WebContainer snapshot serving remains unchanged.

## Isolated rendering

The worker must not execute generated server code in its own process or with its secrets. Both renderers use the same shared scaffold as the browser preview. No production build or deployment is required.

Local prerequisites:

```
docker build -f packages/validation/Dockerfile -t useframe-validation:local .
docker network create --internal useframe-validation
```

Rebuild the preview image when updating preview-entrypoint.sh; MAIN now executes the generated dev script using the cached dependencies. Docker must be running. The internal network blocks preview-server egress and cloud metadata access. Playwright in the worker loads public browser assets. Server-side external fetching is deliberately unavailable in the sandbox.

For GKE, build/push the same image and set VALIDATION_PREVIEW_IMAGE. Apply gke-preview.yaml after reviewing the worker namespace, service-account name and app label. Use a GKE Sandbox enabled node pool with the gvisor RuntimeClass and enforced NetworkPolicy. The worker creates secret-free preview pods and temporary ConfigMaps, connects directly to their private pod IP, then deletes both. Each pod has a 30-minute process deadline. ConfigMap source payloads are limited to 900KB; larger builds result in ERROR rather than running without isolation. No Docker socket or privileged worker is required on GKE.

## Screenshot and crash cleanup

Objects use validation/{main|replicate}/{projectId}/{runId}/original/ or rendered/{iteration}/. Explicit completion/error cleanup removes the entire run prefix. A BullMQ cleanup task scans object expiry metadata every ten minutes. Deploy gke-cleanup.yaml as an independent backup, replacing the worker image and adjusting its working directory/command for your container image; it only needs the GCS bucket, ADC and the preview namespace RBAC. It removes screenshots and orphaned preview resources older than two hours even when the main worker is unavailable.

GCS lifecycle ages are whole days, so a lifecycle rule cannot enforce a two-hour TTL. Merge gcs-lifecycle.json into the bucket's existing lifecycle policy as an additional one-day safety net; do not overwrite unrelated lifecycle rules. The independent ten-minute CronJob enforces approximately 2h–2h10m expiry. GCS soft delete or retention can retain deleted bytes beyond that time: use an appropriate bucket policy if physical deletion within that window is required. Never disable retention on an existing shared bucket without reviewing its other contents.

## Verification

Run shared package builds, Prisma generate, affected service type checks and frontend tests. Run pnpm --filter @repo/validation test for paid gating, the mocked MAIN worker flow, content-only iteration, a single vision call with one malformed-output retry, Tier 0 checks, fixed budgets, and cleanup. The existing web validation tests cover unchanged Replicate tier selection and budgets. Run the worker scripts/validationSmoke.ts for real-browser error, missing-image, overflow, and listener-cleanup checks. Live GCS, Claude and GKE checks require deployment credentials and infrastructure; a healthy generation API alone does not prove validation is running.
