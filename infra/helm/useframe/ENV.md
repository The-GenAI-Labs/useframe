# Environment per workload

Source of truth: each service's zod schema (`apps/<service>/src/config/env.ts`, plus the shared
`JevEnvSchema` in `packages/jev`, `RagEnvSchema` in `packages/rag` and `CacheEnvSchema` in
`apps/research-service`). This file drives `secrets.example.yaml`.

**Where a value is set**

- **values**: plain config, rendered into the `<release>-<key>-config` ConfigMap. Use `global.env`
  for every workload, `services.<key>.env` for one, or the environment overlay (`values-production.yaml`).
  The chart refuses a plain env name matching `secret|token|password|api_key|private|credential` that
  has a value.
- **chart**: set by the chart itself (`PORT`/`HEALTH_PORT` from `port`; in-cluster URLs from
  `useframe.serviceUrl`, so they follow the release name and namespace).
- **Secret `<name>`**: an existing Kubernetes Secret, loaded whole with `envFrom`. Keys you don't
  need can be left out.

**Rules that bite**

- Leave optional keys **out** of a Secret rather than setting them to an empty string where the
  schema validates the format. Set to `""`, `GCS_BUCKET` (orchestrator) and `REDIS_URL`
  (research-service) fail validation and the pod crash-loops.
- `INTERNAL_SERVICE_SECRET` must be the **same value** in every Secret that has it.
  `JWT_ACCESS_SECRET` must match between `server-secrets` and `orchestrator-service-secrets`.
- No service reads a GCP key file. GCS (orchestrator validation screenshots) uses Application
  Default Credentials, so give that ServiceAccount a Workload Identity annotation (README §1).
- A Secret change does not restart pods; run `kubectl rollout restart` (README §8).

Every workload also gets `NODE_ENV=production` from `global.env`.

## server (`services.server`, Secret `server-secrets`)

| Name                              | Required | Default                                          | Secret | Set in                                                   |
| --------------------------------- | -------- | ------------------------------------------------ | ------ | -------------------------------------------------------- |
| `NODE_ENV`                        | no       | `development`                                    | no     | values (`global.env`: `production`)                      |
| `PORT`                            | no       | `4000`                                           | no     | chart (`port`)                                           |
| `DATABASE_URL`                    | **yes**  | —                                                | yes    | Secret                                                   |
| `REDIS_URL`                       | no       | `redis://localhost:6379`                         | yes    | Secret (set it: the default is unreachable in-cluster)   |
| `JWT_ACCESS_SECRET`               | **yes**  | — (≥ 32 chars)                                   | yes    | Secret (same as orchestrator)                            |
| `JWT_REFRESH_SECRET`              | **yes**  | — (≥ 32 chars)                                   | yes    | Secret                                                   |
| `JWT_ACCESS_EXPIRY`               | no       | `15m`                                            | no     | values                                                   |
| `JWT_REFRESH_EXPIRY`              | no       | `7d`                                             | no     | values                                                   |
| `INTERNAL_SERVICE_SECRET`         | no\*     | — (≥ 16 chars)                                   | yes    | Secret (\*needed to call deploy/scoring/internal routes) |
| `CLIENT_URL`                      | no       | `http://localhost:3000`                          | no     | values (production: `https://useframe.in`)               |
| `FRONTEND_URL`                    | no       | `http://localhost:3000`                          | no     | values (production: `https://useframe.in`)               |
| `BCRYPT_ROUNDS`                   | no       | `12`                                             | no     | values                                                   |
| `ORCHESTRATOR_URL`                | no       | `http://localhost:4001`                          | no     | chart (in-cluster URL)                                   |
| `BILLING_SERVICE_URL`             | no       | `http://localhost:4002`                          | no     | chart (in-cluster URL; billing is disabled by default)   |
| `SCORING_SERVICE_URL`             | no       | `http://localhost:4003`                          | no     | chart (in-cluster URL; scoring is disabled by default)   |
| `RESEARCH_SERVICE_URL`            | no       | `http://localhost:4004`                          | no     | chart (in-cluster URL)                                   |
| `DEPLOY_SERVICE_URL`              | no       | `http://localhost:4005`                          | no     | chart (in-cluster URL)                                   |
| `DEPLOY_USER_RATE_LIMIT_PER_HOUR` | no       | `10`                                             | no     | values                                                   |
| `CUSTOM_DOMAIN_MAX_ADD_PER_HOUR`  | no       | `5`                                              | no     | values                                                   |
| `GOOGLE_CLIENT_ID`                | **yes**  | —                                                | no     | Secret (kept with its secret)                            |
| `GOOGLE_CLIENT_SECRET`            | **yes**  | —                                                | yes    | Secret                                                   |
| `GOOGLE_REDIRECT_URI`             | no       | `http://localhost:4000/api/auth/google/callback` | no     | values (production: `https://api.useframe.in/...`)       |
| `GITHUB_CLIENT_ID`                | **yes**  | —                                                | no     | Secret (kept with its secret)                            |
| `GITHUB_CLIENT_SECRET`            | **yes**  | —                                                | yes    | Secret                                                   |
| `GITHUB_REDIRECT_URI`             | no       | `http://localhost:4000/api/auth/github/callback` | no     | values (production: `https://api.useframe.in/...`)       |
| `RESEND_API_KEY`                  | **yes**  | —                                                | yes    | Secret                                                   |
| `EMAIL_FROM`                      | no       | `noreply@useframe.so`                            | no     | values                                                   |
| `TURNSTILE_SECRET_KEY`            | **yes**  | —                                                | yes    | Secret                                                   |
| `IPQS_API_KEY`                    | no       | `""` (risk check no-ops)                         | yes    | Secret                                                   |
| `WEBCONTAINER_SNAPSHOTS_DIR`      | no       | `""`                                             | no     | values (needs a mounted volume; unset on GKE)            |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID`  | no       | `""`                                             | yes    | not set (legacy Vercel deploy code, unreferenced)        |
| `MEDIA_R2_ACCESS_KEY_ID` / `MEDIA_R2_SECRET_ACCESS_KEY` | no | `""` (media routes answer 503)       | yes    | Secret (R2 Object Read & Write on `useframe-media`)      |
| `MEDIA_SIGNING_SECRET`            | no       | `""` (media routes answer 503; ≥ 32 chars)       | yes    | Secret                                                   |
| `MEDIA_R2_ENDPOINT` / `CLOUDFLARE_ACCOUNT_ID` | no | `""` (endpoint derived from the account id)   | no     | Secret or values                                         |
| `MEDIA_R2_BUCKET`                 | no       | `useframe-media`                                 | no     | values                                                   |
| `MEDIA_PUBLIC_BASE_URL`           | no       | `http://localhost:4000`                          | no     | values (production: `https://api.useframe.in`)           |
| `MEDIA_CORS_ORIGINS`              | no       | `""` (CLIENT_URL and FRONTEND_URL always allowed) | no    | values                                                   |
| `MEDIA_SIGNED_URL_TTL_SECONDS`, `MEDIA_FREE_*`, `MEDIA_PAID_*`, `MEDIA_MAX_AUTOPLAY_VIDEOS_PER_PAGE` | no | see `apps/server/.env.example` | no | values |

## orchestrator-service (`services.orchestrator-service`, Secret `orchestrator-service-secrets`)

| Name                              | Required   | Default                          | Secret | Set in                                                                   |
| --------------------------------- | ---------- | -------------------------------- | ------ | ------------------------------------------------------------------------ |
| `PORT`                            | no         | `4001`                           | no     | chart                                                                    |
| `DATABASE_URL`                    | **yes**    | —                                | yes    | Secret                                                                   |
| `REDIS_URL`                       | no         | `redis://localhost:6379`         | yes    | Secret (set it)                                                          |
| `JWT_ACCESS_SECRET`               | **yes**    | — (≥ 32 chars)                   | yes    | Secret (same as server)                                                  |
| `INTERNAL_SERVICE_SECRET`         | no         | — (≥ 16 chars)                   | yes    | Secret                                                                   |
| `ANTHROPIC_API_KEY`               | one of 4\* | `""`                             | yes    | Secret                                                                   |
| `DEEPSEEK_API_KEY`                | one of 4\* | `""`                             | yes    | Secret                                                                   |
| `OPENAI_API_KEY`                  | one of 4\* | `""`                             | yes    | Secret                                                                   |
| `KIMI_API_KEY`                    | one of 4\* | `""`                             | yes    | Secret                                                                   |
| `BRAVE_API_KEY`                   | no         | `""` (competitor search no-ops)  | yes    | Secret                                                                   |
| `RESEARCH_SERVICE_URL`            | no         | `http://localhost:4004`          | no     | chart                                                                    |
| `CLIENT_URL`                      | no         | `http://localhost:3000`          | no     | values (CORS origin for direct browser calls)                            |
| `GCS_BUCKET`                      | no         | unset (validation disabled)      | no     | values; **omit, never `""`**. Needs Workload Identity with bucket access |
| `OFF_TOPIC_THRESHOLD`             | no         | `0.65`                           | no     | values                                                                   |
| `MAX_HISTORY_MESSAGES`            | no         | `10`                             | no     | values                                                                   |
| `CHAT_MODEL`                      | no         | `deepseek-v4-flash` (only value) | no     | values                                                                   |
| `LANGFUSE_PUBLIC_KEY`             | no         | `""`                             | yes    | Secret                                                                   |
| `LANGFUSE_SECRET_KEY`             | no         | `""`                             | yes    | Secret                                                                   |
| `LANGFUSE_HOST`                   | no         | `""`                             | no     | values                                                                   |
| `TYPESAFE_API_KEY`                | no         | `""`                             | yes    | Secret                                                                   |
| `JEV_MODE_CHAT_SCOPE`             | no         | `off` (`off`/`shadow`/`on`)      | no     | values                                                                   |
| `JEV_MODE_RETRIEVAL_CACHE_VERIFY` | no         | `off`                            | no     | values                                                                   |
| `JEV_MODEL`                       | no         | `jev-1.13.0`                     | no     | values                                                                   |
| `JEV_TIMEOUT_MS`                  | no         | `1000`                           | no     | values                                                                   |

\* At least one LLM provider key must be set or the service refuses to start.

## research-service (`services.research-service`, Secret `research-service-secrets`)

| Name                                                     | Required | Default                     | Secret | Set in                                        |
| -------------------------------------------------------- | -------- | --------------------------- | ------ | --------------------------------------------- |
| `PORT`                                                   | no       | `4004`                      | no     | chart                                         |
| `DATABASE_URL`                                           | **yes**  | —                           | yes    | Secret                                        |
| `REDIS_URL`                                              | no       | unset (cache disabled)      | yes    | Secret; **omit, never `""`** (must be a URL)  |
| `INTERNAL_SERVICE_SECRET`                                | no       | — (≥ 16 chars)              | yes    | Secret                                        |
| `ORCHESTRATOR_URL`                                       | no       | `http://localhost:4001`     | no     | chart (HyDE calls back into the orchestrator) |
| `RESEARCH_MOCK`                                          | no       | `true`                      | no     | values (`"true"`; see README "Research mock") |
| `CLIENT_URL`                                             | no       | `http://localhost:3000`     | no     | values                                        |
| `VOYAGE_API_KEY`                                         | no\*     | `""`                        | yes    | Secret (\*needed when `RESEARCH_MOCK=false`)  |
| `COHERE_API_KEY`                                         | no       | `""`                        | yes    | Secret                                        |
| `OPENAI_API_KEY`                                         | no       | `""`                        | yes    | Secret                                        |
| `EMBEDDING_PROVIDER`                                     | no       | `voyage` (only value)       | no     | values                                        |
| `EMBEDDING_MODEL`                                        | no       | `voyage-4`                  | no     | values                                        |
| `EMBEDDING_DIMS`                                         | no       | `1024` (checked at startup) | no     | values                                        |
| `COHERE_RERANK_MODEL`                                    | no       | `rerank-v4.0-fast`          | no     | values                                        |
| `RERANK_MIN_SCORE`                                       | no       | `0.15`                      | no     | values                                        |
| `PER_AREA_TOP_K`                                         | no       | `5`                         | no     | values                                        |
| `RRF_K`                                                  | no       | `60`                        | no     | values                                        |
| `DENSE_CANDIDATES`, `SPARSE_CANDIDATES`                  | no       | `40`                        | no     | values                                        |
| `FUSED_CANDIDATES`                                       | no       | `30`                        | no     | values                                        |
| `CACHE_SIM_HIGH` / `CACHE_SIM_LOW` / `CACHE_DEDUP_SIM`   | no       | `0.97` / `0.88` / `0.99`    | no     | values (must satisfy LOW ≤ HIGH ≤ DEDUP)      |
| `CACHE_SEMANTIC_CANDIDATES`                              | no       | `3`                         | no     | values                                        |
| `CACHE_EXACT_TTL_SECONDS`                                | no       | `2592000`                   | no     | values                                        |
| `JEV_CACHE_ACCEPT_THRESHOLD`                             | no       | `0.75`                      | no     | values                                        |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`             | no       | `""`                        | yes    | Secret                                        |
| `LANGFUSE_HOST`                                          | no       | `""` (must be a URL if set) | no     | values                                        |
| `TYPESAFE_API_KEY`                                       | no       | `""`                        | yes    | Secret                                        |
| `JEV_MODE_CHAT_SCOPE`, `JEV_MODE_RETRIEVAL_CACHE_VERIFY` | no       | `off`                       | no     | values                                        |
| `JEV_MODEL`, `JEV_TIMEOUT_MS`                            | no       | `jev-1.13.0`, `1000`        | no     | values                                        |

## deploy-service-server and deploy-service-worker (Secret `deploy-service-secrets`, shared)

Both workloads run the same image with the same schema (`apps/deploy-service/src/config/schema.ts`)
and the same plain env (a YAML anchor in `values.yaml`). The worker's build child gets an allowlisted
environment only (`PATH`, `HOME`, `CI`, `NODE_OPTIONS`, `NEXT_TELEMETRY_DISABLED`,
`npm_config_cache`); none of these Secrets reach user builds.

| Name                                    | Required | Default                                       | Secret | Set in                                            |
| --------------------------------------- | -------- | --------------------------------------------- | ------ | ------------------------------------------------- |
| `PORT`                                  | no       | `4005`                                        | no     | chart (server only)                               |
| `HEALTH_PORT`                           | no       | unset (no health listener)                    | no     | chart (worker only: `8080`)                       |
| `DATABASE_URL`                          | **yes**  | —                                             | yes    | Secret                                            |
| `REDIS_URL`                             | **yes**  | — (redis:// or rediss://)                     | yes    | Secret                                            |
| `INTERNAL_SERVICE_SECRET`               | **yes**  | — (≥ 16 chars)                                | yes    | Secret                                            |
| `CLOUDFLARE_ACCOUNT_ID`                 | **yes**  | —                                             | no     | Secret (kept with the token)                      |
| `CLOUDFLARE_API_TOKEN`                  | **yes**  | —                                             | yes    | Secret                                            |
| `CLOUDFLARE_ZONE_ID`                    | no       | unset                                         | no     | Secret (needed from custom domains, Stage 2)      |
| `SITES_KV_NAMESPACE_ID`                 | **yes**  | —                                             | no     | Secret (Terraform output)                         |
| `SITES_R2_ACCESS_KEY_ID`                | **yes**  | —                                             | yes    | Secret                                            |
| `SITES_R2_SECRET_ACCESS_KEY`            | **yes**  | —                                             | yes    | Secret                                            |
| `SITES_R2_ENDPOINT`                     | no       | `https://<account>.r2.cloudflarestorage.com`  | no     | values                                            |
| `SITES_BASE_DOMAIN`                     | **yes**  | —                                             | no     | values (`useframe.in`)                            |
| `SITES_RESERVED_HOSTS`                  | no       | `useframe.in,www.useframe.in,api.useframe.in` | no     | values                                            |
| `SITES_R2_BUCKET`                       | no       | `useframe-sites`                              | no     | values                                            |
| `SITES_EDGE_CNAME_TARGET`               | no       | `cname.<SITES_BASE_DOMAIN>`                   | no     | values                                            |
| `DEPLOY_RETAIN_COUNT`                   | no       | `10`                                          | no     | values                                            |
| `DEPLOY_MAX_FILES`                      | no       | `5000`                                        | no     | values                                            |
| `DEPLOY_MAX_TOTAL_MB`                   | no       | `100`                                         | no     | values                                            |
| `DEPLOY_INSTALL_TIMEOUT_MS`             | no       | `300000`                                      | no     | values                                            |
| `DEPLOY_BUILD_TIMEOUT_MS`               | no       | `480000`                                      | no     | values                                            |
| `DEPLOY_BUILD_CONCURRENCY`              | no       | `2`                                           | no     | values (memory: ~2.5 GiB per build)               |
| `DEPLOY_ACTIVATION_PROBE_MS`            | no       | `150000`                                      | no     | values                                            |
| `DEPLOY_REAPER_STUCK_MINUTES`           | no       | `30`                                          | no     | values                                            |
| `DEPLOY_WORK_DIR`                       | no       | `/work` in production                         | no     | values (`/work`, an emptyDir)                     |
| `DEPLOY_BUILD_UID` / `DEPLOY_BUILD_GID` | no       | `10002`                                       | no     | values                                            |
| `DEPLOY_BUILD_ISOLATION`                | no       | `setpriv` (`none` refused in production)      | no     | values                                            |
| `DEPLOY_NODE_MODULES_TEMPLATES`         | no       | `/opt/templates`                              | no     | values                                            |
| `DEPLOY_ENQUEUE_VALIDATION`             | no       | `false`                                       | no     | values                                            |
| `CUSTOM_DOMAINS_ENABLED`                | no       | `false`                                       | no     | values (stays off until both RUNBOOK spikes pass) |
| `CUSTOM_DOMAIN_CAPACITY_LIMIT`          | no       | `100`                                         | no     | values                                            |
| `CUSTOM_DOMAIN_BLOCKLIST`               | no       | `""`                                          | no     | values                                            |
| `CUSTOM_DOMAIN_OWNERSHIP_WINDOW_HOURS`  | no       | `72`                                          | no     | values                                            |
| `CUSTOM_DOMAIN_ROUTING_WINDOW_DAYS`     | no       | `7`                                           | no     | values                                            |
| `DNS_RESOLVERS`                         | no       | `1.1.1.1,8.8.8.8`                             | no     | values                                            |
| `MEDIA_R2_READ_ACCESS_KEY_ID` / `MEDIA_R2_READ_SECRET_ACCESS_KEY` | no | unset (deploys of sites with media fail clearly) | yes | Secret (R2 Object Read only on `useframe-media`) |
| `MEDIA_R2_BUCKET` / `MEDIA_R2_ENDPOINT` | no       | `useframe-media` / derived from the account id | no    | values                                            |

## media-service (disabled by default, Secret `media-service-secrets`)

| Name                                                        | Required        | Default                    | Secret | Set in                              |
| ----------------------------------------------------------- | --------------- | -------------------------- | ------ | ----------------------------------- |
| `HEALTH_PORT`                                               | no              | unset (no health listener) | no     | chart (`8080`)                      |
| `DATABASE_URL`                                              | **yes**         | —                          | yes    | Secret                              |
| `REDIS_URL`                                                 | **yes**         | —                          | yes    | Secret                              |
| `MEDIA_R2_ACCESS_KEY_ID` / `MEDIA_R2_SECRET_ACCESS_KEY`     | **yes**         | —                          | yes    | Secret                              |
| `MEDIA_R2_ENDPOINT` or `CLOUDFLARE_ACCOUNT_ID`              | **yes**         | —                          | no     | Secret                              |
| `INTERNAL_SERVICE_SECRET`                                   | when describing | —                          | yes    | Secret (same as orchestrator)       |
| `ORCHESTRATOR_URL`                                          | no              | `http://localhost:4001`    | no     | chart (`useframe.serviceUrl`)       |
| `MEDIA_R2_BUCKET`                                           | no              | `useframe-media`           | no     | values                              |
| `MEDIA_WORK_DIR`                                            | no              | `/work` in production      | no     | values (`/work`, an emptyDir)       |
| `MEDIA_PROCESS_CONCURRENCY`                                 | no              | `2`                        | no     | values                              |
| `MEDIA_FFMPEG_TIMEOUT_MS` / `MEDIA_FFMPEG_THREADS`          | no              | `180000` / `2`             | no     | values                              |
| `MEDIA_MAX_INPUT_PIXELS` / `MEDIA_MAX_VIDEO_SECONDS`        | no              | `60000000` / `60`          | no     | values                              |
| `MEDIA_PAID_MAX_IMAGE_BYTES` / `MEDIA_PAID_MAX_VIDEO_BYTES` | no              | `20971520` / `157286400`   | no     | values (hard ceilings for any file) |
| `MEDIA_DESCRIBE_ENABLED` / `MEDIA_DESCRIBE_TIMEOUT_MS`      | no              | `true` / `30000`           | no     | values                              |

## migration Job (`migration`, Secret `migrate-secrets`)

| Name           | Required | Default | Secret | Set in                                                      |
| -------------- | -------- | ------- | ------ | ----------------------------------------------------------- |
| `DATABASE_URL` | **yes**  | —       | yes    | Secret (a role allowed to run DDL; `prisma migrate deploy`) |

## billing-service (disabled by default, Secret `billing-service-secrets`)

| Name                      | Required | Default                  | Secret | Set in |
| ------------------------- | -------- | ------------------------ | ------ | ------ |
| `PORT`                    | no       | `4002`                   | no     | chart  |
| `DATABASE_URL`            | **yes**  | —                        | yes    | Secret |
| `REDIS_URL`               | no       | `redis://localhost:6379` | yes    | Secret |
| `RAZORPAY_KEY_ID`         | **yes**  | —                        | no     | Secret |
| `RAZORPAY_KEY_SECRET`     | **yes**  | —                        | yes    | Secret |
| `RAZORPAY_WEBHOOK_SECRET` | **yes**  | —                        | yes    | Secret |
| `CLIENT_URL`              | no       | `http://localhost:3000`  | no     | values |

## scoring-service (disabled by default, Secret `scoring-service-secrets`)

| Name                      | Required   | Default                  | Secret | Set in |
| ------------------------- | ---------- | ------------------------ | ------ | ------ |
| `PORT`                    | no         | `4003`                   | no     | chart  |
| `DATABASE_URL`            | **yes**    | —                        | yes    | Secret |
| `REDIS_URL`               | no         | `redis://localhost:6379` | yes    | Secret |
| `INTERNAL_SERVICE_SECRET` | **yes**    | — (≥ 16 chars)           | yes    | Secret |
| `ANTHROPIC_API_KEY`       | one of 2\* | `""`                     | yes    | Secret |
| `OPENAI_API_KEY`          | one of 2\* | `""`                     | yes    | Secret |
| `CLIENT_URL`              | no         | `http://localhost:3000`  | no     | values |

\* At least one of the two keys must be set.
