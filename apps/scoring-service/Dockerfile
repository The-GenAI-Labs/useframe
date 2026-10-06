# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f apps/scoring-service/Dockerfile .

ARG NODE_VERSION=24
ARG NODE_IMAGE_DIGEST=

# Stage 1 — builder
FROM node:${NODE_VERSION}-bookworm-slim${NODE_IMAGE_DIGEST:+@${NODE_IMAGE_DIGEST}} AS builder
ARG PNPM_VERSION=11.1.3
ARG APP_DIR=apps/scoring-service
ARG APP_PACKAGE=@useframe/scoring-service
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    pnpm_config_store_dir=/pnpm/store \
    pnpm_config_verify_deps_before_run=false \
    pnpm_config_minimum_release_age=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# The release-age policy is enforced when the lockfile is resolved; re-checking every entry
# here only repeats it (one registry request per package) for a --frozen-lockfile install.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Optional BuildKit secret "extra_ca": a CA for TLS-intercepting proxies on build machines.
# Download steps trust it; it is never written to a layer.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm fetch

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --offline --frozen-lockfile

# prisma.config.ts resolves DATABASE_URL eagerly; `prisma generate` never connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter "${APP_PACKAGE}..." build

# pnpm 11 deploys non-injected workspaces only with --legacy.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter "${APP_PACKAGE}" deploy --prod --legacy /out \
 && node docker/prune-dev-peers.mjs /out \
 && mkdir /runtime \
 && cp -a /out/package.json /out/dist /out/node_modules /runtime/

# Stage 2 — runner
FROM node:${NODE_VERSION}-bookworm-slim${NODE_IMAGE_DIGEST:+@${NODE_IMAGE_DIGEST}} AS runner
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
ARG VERSION=unknown
ARG SOURCE_URL=unknown
LABEL org.opencontainers.image.title="useframe-scoring-service" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production \
    TMPDIR=/tmp \
    PORT=4003

ARG DEBIAN_FRONTEND=noninteractive
# Package versions follow the pinned base image's Debian security updates.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 app \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder --chown=10001:10001 /runtime ./

USER 10001:10001
EXPOSE 4003
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
