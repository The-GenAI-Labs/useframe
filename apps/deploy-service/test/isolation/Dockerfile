# syntax=docker/dockerfile:1.7
# Test-only image layered on the real deploy-service image; never published.
# Built by `pnpm --filter @useframe/deploy-service test:isolation`.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG DEBIAN_FRONTEND=noninteractive
# The isolation checks run as root, exactly like the deploy-service worker pod.
# hadolint ignore=DL3002
USER 0
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends procps \
 && rm -rf /var/lib/apt/lists/*
COPY apps/deploy-service/test/isolation/run.mjs /isolation/run.mjs
CMD ["node", "/isolation/run.mjs"]
