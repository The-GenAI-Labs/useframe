# Build from the repo root: docker build -f apps/deploy-service/Dockerfile .
# One image, two entrypoints: the server (default CMD) and the worker
# (`node --import tsx dist/worker.js`, set in the k8s Deployment).
# Optional BuildKit secret `extra_ca`: a CA for TLS-intercepting proxies/antivirus on
# build machines. Used only by download steps; never written to an image layer.
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && corepack prepare pnpm@11.1.3 --activate

FROM base AS build
# A filtered install is intentional; don't let `pnpm exec` re-install the workspace.
ENV pnpm_config_verify_deps_before_run=false
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/deploy-service/package.json apps/deploy-service/
COPY packages/db/package.json packages/db/
COPY packages/events/package.json packages/events/
COPY packages/schemas/package.json packages/schemas/
COPY packages/site-builder/package.json packages/site-builder/
COPY packages/types/package.json packages/types/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter @useframe/deploy-service...
COPY . .
# prisma.config.ts resolves DATABASE_URL eagerly; generate never connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @useframe/db exec prisma generate
RUN pnpm --filter @repo/schemas build \
 && pnpm --filter @repo/events build \
 && pnpm --filter @repo/site-builder build \
 && pnpm --filter @useframe/deploy-service build
# node_modules templates for the compiler's pinned dependency sets (offline fast path).
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    cd apps/deploy-service && node --import tsx dist/cli/bakeTemplates.js /opt/templates

FROM base AS runtime
ENV NODE_ENV=production \
    DEPLOY_NODE_MODULES_TEMPLATES=/opt/templates \
    DEPLOY_WORK_DIR=/work
# tini is PID 1 so killed build processes are reaped; setpriv ships in bookworm-slim.
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/* \
 && command -v setpriv \
 && groupadd -g 10001 deploy && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin deploy \
 && groupadd -g 10002 builder && useradd -u 10002 -g 10002 -M -s /usr/sbin/nologin builder \
 && mkdir -p /work && chmod 0755 /work
COPY --from=build /app /app
COPY --from=build /opt/templates /opt/templates
WORKDIR /app/apps/deploy-service
EXPOSE 4005
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "dist/server.js"]

# `pnpm --filter @useframe/deploy-service test:isolation`; never shipped.
FROM runtime AS isolation-test
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
USER root
CMD ["node", "--import", "tsx", "test/isolation/run.ts"]
