# Docker images

Production images for UseFrame's backend services, published to **Docker Hub only**. Part 2 (the
Helm chart) deploys them to GKE using the immutable `sha-<gitsha>` tag.

```
git push → CI builds each image (2 stages) → hadolint → Trivy → push sha-<7> (main / vX.Y.Z only)
```

| Image (`per-service` naming)    | Dockerfile                             | Port | Command                                                  |
| ------------------------------- | -------------------------------------- | ---- | -------------------------------------------------------- |
| `useframe-server`               | `apps/server/Dockerfile`               | 4000 | `node dist/index.js`                                     |
| `useframe-orchestrator-service` | `apps/orchestrator-service/Dockerfile` | 4001 | `node dist/index.js`                                     |
| `useframe-billing-service`      | `apps/billing-service/Dockerfile`      | 4002 | `node dist/index.js`                                     |
| `useframe-scoring-service`      | `apps/scoring-service/Dockerfile`      | 4003 | `node dist/index.js`                                     |
| `useframe-research-service`     | `apps/research-service/Dockerfile`     | 4004 | `node dist/index.js`                                     |
| `useframe-deploy-service`       | `apps/deploy-service/Dockerfile`       | 4005 | `node dist/server.js`; worker pod: `node dist/worker.js` |
| `useframe-worker`               | `apps/worker/Dockerfile`               | —    | `node dist/index.js` (BullMQ only, includes Chromium)    |
| `useframe-migrate`              | `packages/db/Dockerfile`               | —    | `prisma migrate deploy`                                  |

The single source of truth for this list is `docker/services.json`; CI's matrix is generated from it,
so adding a service is one line there plus its Dockerfile. No images exist for `apps/web` (Vercel) or
`apps/site-edge` (a Cloudflare Worker).

Every Dockerfile has exactly two stages, `builder` and `runner`, on `node:24-bookworm-slim`:

- builder: `pnpm fetch` (lockfile only, cached) → `COPY . .` → `pnpm install --offline` → build the
  service and its workspace dependencies → `pnpm deploy --prod --legacy /out`;
- runner: only `package.json`, `dist/` and production `node_modules`, plus `ca-certificates` and
  `tini` (PID 1); runs as uid/gid **10001**; no pnpm, no sources, no `.env`.

The `--legacy` flag is required by pnpm **11.1.3**: without `injectWorkspacePackages: true`,
`pnpm deploy` refuses with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`. Turning injection on would change
how every workspace package is linked in local development, so only the deploy step uses `--legacy`.

## Local use

`DOCKERHUB_NAMESPACE` is required by every command (it names the images). Nothing here pushes unless
you run `docker:push`.

PowerShell:

```powershell
$env:DOCKERHUB_NAMESPACE = "<your-dockerhub-user>"
pnpm docker:list
pnpm docker:build -- research-service      # or: all
pnpm docker:smoke -- research-service      # or: all
pnpm docker:context-check
pnpm docker:test                           # naming/tag unit tests
```

Linux / macOS:

```bash
export DOCKERHUB_NAMESPACE=<your-dockerhub-user>
pnpm docker:build -- all && pnpm docker:smoke -- all
```

Run an image with its environment supplied at `docker run` time (never baked in):

```powershell
docker run --rm -p 4004:4004 --read-only --tmpfs /tmp --env-file apps/research-service/.env `
  docker.io/<ns>/useframe-research-service:sha-<7>
```

Behind a TLS-intercepting proxy or antivirus, set `NODE_EXTRA_CA_CERTS` to its CA file; the scripts
pass it to BuildKit as the `extra_ca` **build secret**, used only by download steps and never stored
in a layer.

`docker:smoke` checks, for each image: it starts as uid 10001 with a read-only root filesystem and a
tmpfs `/tmp`, reaching the service's own env validation with no `ERR_MODULE_NOT_FOUND` /
`Cannot find module` / `ERR_REQUIRE_ESM` / Prisma engine errors; every `@repo/*`/`@useframe/*`
dependency resolves to its `dist/` and the Prisma client constructs; there is no `/repo`, no `.ts`
source, no `.env*` and no pnpm; the image size is under `DOCKER_MAX_IMAGE_MB` (default 600; the
worker has its own limit in `services.json` because it ships Chromium). For `deploy-service` it also
starts the worker entry **as root** and checks `setpriv`.

Writable paths at runtime (for `readOnlyRootFilesystem` in Part 2): `/tmp` for every service;
`deploy-service` also `/work` (an `emptyDir`); `worker` uses `/tmp` as `HOME` for Chromium and needs a
memory-backed `/dev/shm`.

## Docker Hub setup (you do this)

1. **Access token for CI:** Docker Hub → _Account settings → Personal access tokens_ → _Generate_,
   permissions **Read & Write**. Store as GitHub **secrets** `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
   (the token, never the password).
2. **Repository variables** (GitHub → _Settings → Secrets and variables → Actions → Variables_):
   `DOCKERHUB_NAMESPACE` (required to publish), optional `DOCKER_IMAGE_NAMING`
   (`per-service` | `single-repo`) and `DOCKER_PLATFORMS` (e.g. `linux/amd64,linux/arm64`).
3. **Make every repository private before the first push.** Set the account's _Default privacy_ to
   **Private**, then create each repository (`useframe-server`, …, or the single `useframe` repository)
   as private. Pushing to a repository that doesn't exist can auto-create a **public** one, and these
   images contain compiled application code.
4. **Plan limits** (from Docker's docs and pricing page, checked **2026-10-06**; re-verify):
   - the free Personal plan includes **1 private repository**; Pro, Team and Business include unlimited
     private repositories (fair use);
   - pulls: unauthenticated **100 per IPv4 address (or IPv6 /64) per 6 hours**; authenticated Personal
     **200 per 6 hours**; paid plans **unlimited**.

   Eight private repositories need a paid plan, **or** set `DOCKER_IMAGE_NAMING=single-repo`
   (everything in one private `useframe` repository as `useframe:<service>-<tag>`). GKE nodes behind
   Cloud NAT share one IP, so the cluster must pull **with credentials** (`imagePullSecrets`, Part 2).

## Tags

Computed once in `scripts/docker-lib.mjs`, used by both the scripts and CI:

- always `sha-<first 7 of the commit>`: immutable, and **the only tag Kubernetes uses**;
- on a tag `vX.Y.Z`: also `X.Y.Z`;
- on `main`: also `main` (a moving tag for humans; never referenced by Kubernetes);
- never `latest` (refused everywhere);
- a local build from a dirty tree is tagged `sha-<7>-dirty` and **cannot be pushed**.

| Naming        | Reference                                       |
| ------------- | ----------------------------------------------- |
| `per-service` | `docker.io/<ns>/useframe-<service>:sha-abc1234` |
| `single-repo` | `docker.io/<ns>/useframe:<service>-sha-abc1234` |

The tag to deploy is printed in each CI job summary (with the pushed digest) and by
`pnpm docker:list` for the current commit.

CI (`.github/workflows/docker-publish.yml`): pull requests build, lint and scan only (no login, no
push); pushes to `main` and `v*.*.*` tags also push. The workflow runs for changes under `apps/`,
`packages/`, the lockfile/workspace files, `docker/`, `scripts/docker*.mjs` and itself, and then always
builds **all** services, so every image exists for the same `sha-<7>`. Trivy fails a job on fixable
CRITICAL vulnerabilities and reports fixable HIGH ones in the job summary.

## Versions

- **Node:** `ARG NODE_VERSION=24` in every Dockerfile (matches CI and the existing images). To bump,
  change it in all Dockerfiles together and rebuild.
- **pnpm:** pinned from root `package.json` `packageManager` (`pnpm@11.1.3`); the scripts and CI pass
  it as `PNPM_VERSION`.
- **Base image digest:** optional `NODE_IMAGE_DIGEST`. To pin, look up the current digest and pass it:

  ```bash
  docker buildx imagetools inspect node:24-bookworm-slim --format '{{json .Manifest.Digest}}'
  NODE_IMAGE_DIGEST=sha256:<digest> pnpm docker:build -- all
  ```

  Refresh it monthly (or when Trivy flags base-image CVEs) by re-running the inspect command.

## Troubleshooting

- **`ERR_MODULE_NOT_FOUND` / `Cannot find package '@/…'`:** a workspace package is missing its `dist/`
  (check its `files` field includes `dist`), or a service build skipped `tsc-alias` (services compile
  with `tsc && tsc-alias` so `@/…` imports become relative paths).
- **Prisma:** Prisma 7 with the pg driver adapter has no native query engine; the client is compiled
  into `@useframe/db`'s `dist/`. `prisma generate` runs during the build with a placeholder
  `DATABASE_URL` (it never connects). The migrate image needs `openssl` for the schema engine.
- **Read-only filesystem errors (`EROFS`):** the service writes somewhere other than `/tmp`; mount that
  path as an `emptyDir` in Part 2.
- **`ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`:** `pnpm deploy` needs `--legacy` on pnpm 10+ (see above).
- **`no active session … context deadline exceeded`:** a BuildKit client-session timeout on a slow
  first build; re-run (the dependency layers are cached by then).
