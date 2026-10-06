# syntax=docker/dockerfile:1.7
# Migration image (useframe-migrate): runs `prisma migrate deploy`.
# Build from the repo root: docker build -f packages/db/Dockerfile .

ARG NODE_VERSION=24
ARG NODE_IMAGE_DIGEST=

############################
# Stage 1 — builder
############################
FROM node:${NODE_VERSION}-bookworm-slim${NODE_IMAGE_DIGEST:+@${NODE_IMAGE_DIGEST}} AS builder
ARG PNPM_VERSION=11.1.3
ARG APP_PACKAGE=@useframe/db
ARG DEBIAN_FRONTEND=noninteractive
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

# Prisma downloads the schema engine for the OpenSSL it detects at install time.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# Optional BuildKit secret "extra_ca": a CA for TLS-intercepting proxies on build machines.
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

# The prisma CLI is a devDependency of the db package, so this deploy keeps dev dependencies.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter "${APP_PACKAGE}" deploy --legacy /out \
 && mkdir -p /runtime/prisma \
 && cp -a /out/package.json /out/node_modules /runtime/ \
 && cp -a packages/db/prisma.config.ts /runtime/ \
 && cp -a packages/db/prisma/schema.prisma packages/db/prisma/migrations /runtime/prisma/

############################
# Stage 2 — runner
############################
FROM node:${NODE_VERSION}-bookworm-slim${NODE_IMAGE_DIGEST:+@${NODE_IMAGE_DIGEST}} AS runner
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
ARG VERSION=unknown
ARG SOURCE_URL=unknown
ARG DEBIAN_FRONTEND=noninteractive
LABEL org.opencontainers.image.title="useframe-migrate" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production \
    TMPDIR=/tmp \
    HOME=/tmp \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# Package versions follow the pinned base image's Debian security updates.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini openssl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 app \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder --chown=10001:10001 /runtime ./

USER 10001:10001
ENTRYPOINT ["/usr/bin/tini", "--"]
# DATABASE_URL comes from the environment at run time only.
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
