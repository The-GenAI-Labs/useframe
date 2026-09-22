# Playwright's own image so Chromium and its system libraries are already
# present and version-matched to the playwright package — installing browsers
# onto a plain node image means tracking that dependency set by hand.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

# Copy only what pnpm needs to resolve the workspace graph first, so a source
# change doesn't invalidate the dependency layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/events/package.json ./packages/events/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --filter worker...

COPY . .

# The Prisma client is generated code, not checked-in build output — it has to
# exist before the worker's TypeScript will compile.
RUN pnpm --filter @useframe/db exec prisma generate
RUN pnpm --filter @repo/schemas build
RUN pnpm --filter worker build

CMD ["pnpm", "--filter", "worker", "start"]
