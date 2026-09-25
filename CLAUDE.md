# useframe Agent Guide

## Required Rules

- Before implementing anything, inspect the existing codebase and follow the patterns already used unless there is a strong reason to change them.
- Do not introduce new libraries, abstractions, folders, or architectural patterns when the existing implementation can solve the problem.
- Do not add unnecessary comments. Add a comment only when clarification is required: explain a non-obvious constraint, tradeoff, invariant, or workaround, rather than restating the code.
- After every significant implementation change, restart the affected project services with the new changes and verify that the frontend and API server are running. Rebuild shared packages first when consumers use their compiled output. Do not rely only on hot reload.
- At the end of every final response, list any new or changed environment variables and required `.env` changes, including the target file, purpose, and whether each variable is required. Never print secret values. If none changed, say: "Environment changes: none."
- Keep `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` synchronized when updating project guidance. These rules apply throughout the repository; also inspect any more specific instructions in the area being edited.

## Project

useframe is an AI-assisted website creation and analysis app for people building or improving a business website. Users can describe an idea, analyze an existing or competitor site, generate and iterate on a website, preview versions, run website/SEO assessments, and deploy. The app also includes research-backed design decisions, website replication, credit-based billing, and custom-domain management.

Read the implementation and package manifests as the source of truth. See `README.md` for the human-readable project overview and local setup guide.

## Tech Stack

- Workspace: pnpm (root pin: `pnpm@11.1.3`), Turborepo, TypeScript, ESM, ESLint, Prettier. Use a Node version compatible with the installed pnpm and Next.js versions; the root `>=18` engine declaration alone does not establish compatibility.
- Frontend: Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/Radix UI, Framer Motion, Zustand, TanStack Query, Axios, React Hook Form, and Zod.
- Backend: Express 5 services, Zod validation, tsx watch mode, shared workspace packages.
- Database: PostgreSQL with pgvector, Prisma 7 and the PostgreSQL adapter. Drizzle dependencies/scripts remain in the manifest, but the application uses Prisma.
- Authentication: custom JWT access/refresh flow, HTTP-only refresh cookies, Google/GitHub OAuth via Arctic, magic links, and Turnstile/signup-risk checks.
- Cache and jobs: Redis through ioredis, BullMQ queues, and database-backed scan/cache records.
- AI/research: Vercel AI SDK with OpenAI and Anthropic providers, an OpenAI SDK dependency in the API, PostgreSQL vector retrieval, BM25, and Cohere reranking.
- Site tooling: WebContainers for browser previews; Playwright, Cheerio, Lighthouse, Vite/React build tooling, and robots-parser in the worker.
- Integrations: Razorpay billing, Cloudflare R2 through the S3 SDK, and Vercel deployment/domain APIs.
- Quality tooling: TypeScript checks, ESLint, and `@repo/evals`. Vitest and Testing Library dependencies exist, but no root test script is currently defined; inspect available tests before choosing a command.

## Repository Structure

| Path                                                   | Responsibility                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `apps/web/app`                                         | Active Next.js App Router routes, layouts, and global styles                                                  |
| `apps/web/src`                                         | Feature components, API clients, hooks, auth context, Zustand stores, and previews                            |
| `apps/server`                                          | Public API, authentication, ownership checks, projects, generation entry points, credits, and service clients |
| `apps/orchestrator-service`                            | AI planning, generation, iteration, replication, prompts, and model routing                                   |
| `apps/research-service`                                | Research corpus endpoints, retrieval, fusion, and reranking                                                   |
| `apps/scoring-service`                                 | Website scoring agents and criteria                                                                           |
| `apps/billing-service`                                 | Razorpay checkout, payment methods, webhooks, and auto-reload endpoints                                       |
| `apps/worker`                                          | BullMQ processors for scans, SEO, scoring, deploys, domains, PDFs, billing jobs, and cache expiry             |
| `packages/db`                                          | Shared Prisma client, schema, migrations, seed data, and scan cache helpers                                   |
| `packages/schemas`                                     | Shared Zod contracts for projects, site specs, AI outputs, research, and credits                              |
| `packages/events`                                      | Shared queue names and job payload contracts                                                                  |
| `packages/site-builder`                                | Shared generated-site construction logic                                                                      |
| `packages/evals`                                       | Evaluation runner, scorers, and datasets                                                                      |
| `packages/ui`                                          | Shared UI primitives; also check the richer app-local UI components before adding components                  |
| `packages/validators`, `packages/types`                | Shared validation and type package entry points; verify actual exports before using                           |
| `packages/typescript-config`, `packages/eslint-config` | Shared compiler and lint configuration                                                                        |

The frontend currently has both `src/store` and `src/stores`. Follow the relevant feature's existing location. The active routing tree is `apps/web/app`; do not create a competing routing tree under `src/app`.

## Architecture

- Keep browser UI, public API, specialized services, and background processors in their existing layers.
- Use `apps/web/src/lib/api` for normal frontend API calls. Preserve the dedicated stream hooks and existing authenticated service connections for generation/progress.
- In the public API, follow `modules/<feature>/<feature>.routes.ts`, `.controller.ts`, `.schema.ts`, and `.service.ts`: routes wire middleware, controllers translate HTTP, services implement business logic.
- Keep expensive crawling, rendering, PDF creation, and deployment in workers; keep AI orchestration in its service. Do not move this work into React components or ordinary request handlers.
- Share runtime contracts through `@repo/schemas` and job contracts through `@repo/events`. Update producers and consumers together when a contract changes.
- Access the database from trusted server/service/worker code through `@useframe/db`. Do not import database clients or server secrets into browser bundles.
- Use package exports rather than reaching across apps into implementation files. Respect the existing mixed `@repo/*` and `@useframe/*` package names.
- Preserve pipeline state, version snapshots, generation tiers, credit accounting, and progress events when changing generation behavior.

## Coding Standards

- Keep TypeScript strictness. Prefer explicit boundary types and schema inference; use `unknown` plus narrowing instead of introducing `any` or unchecked casts.
- Use PascalCase for React components/types and camelCase for functions/variables. Follow adjacent feature filenames and export style; retain framework-required default exports.
- Use type-only imports where appropriate. Preserve ESM `.js` import suffixes and each package's configured aliases.
- Prefer `async/await`, propagate errors deliberately, and await side effects. Parallelize only independent operations; bound concurrency for external services.
- Keep files focused and reuse existing helpers. Avoid speculative abstractions, unrelated cleanup, dependency upgrades, or repository-wide formatting.
- Match local formatting and use the configured formatter on changed files only. Remove stale comments when behavior changes.

## Frontend Standards

- Prefer Server Components for non-interactive rendering; add `"use client"` at the smallest practical boundary for hooks, events, browser APIs, or WebContainers.
- Use TanStack Query for server data and invalidation, Zustand for shared client interaction state, and local state for local UI. Avoid duplicate sources of truth.
- Reuse existing UI primitives, layouts, form patterns, loading states, and error handling.
- Preserve the shared Axios credential/token-refresh flow rather than building parallel API/auth clients.
- Clean up SSE connections, subscriptions, timers, and preview processes. Prevent obsolete streams from updating another project or version.
- Load expensive browser-only tooling when needed. Avoid unnecessary client boundaries, repeated fetches, and excessive rerenders.
- Preserve WebContainer cross-origin isolation headers in `next.config.js` and keep browser-only imports out of server execution.
- Maintain responsive layouts, semantic controls, labels, keyboard access, and visible focus for UI changes.

## Backend / API Standards

- Validate request bodies, parameters, and query inputs at the boundary using existing Zod schemas and middleware; do not trust TypeScript types as runtime validation.
- Preserve existing HTTP methods, status codes, and response contracts. Public API responses generally use `{ success: true, data }` or `{ success: false, message }`; retain endpoint-specific fields and stream protocols.
- Use existing `AppError` and error middleware in the API; forward controller errors with `next(err)`. Follow local error handling in other services.
- Keep external provider calls in existing clients/helpers with appropriate timeouts, cancellation, and bounded retry behavior.
- Preserve queue names, payloads, progress/status transitions, and retry semantics. Make retried jobs and webhook processing idempotent, especially for charges and deployment side effects.
- Invalidate or update affected cache entries after mutations. Do not introduce a separate cache or queue framework.

## Security & Authentication

- Derive user identity from verified authentication, never from an untrusted body/query field.
- Scope access to the authenticated owner and parent resource. Check nested versions, scans, replication records, research documents, jobs, and streams; knowing an ID or slug is not authorization.
- Preserve access/refresh token separation, expiry, refresh-session invalidation, OAuth state checks, single-use tickets/magic links, and secure cookie settings. Do not store refresh tokens in browser storage.
- Preserve internal-service authentication, CORS restrictions, rate limits, Turnstile checks, and billing webhook signature verification. UI route guards do not replace backend authorization.
- Never commit or log secrets, full tokens, sensitive payment data, or private `.env` contents. Only genuinely public configuration belongs in `NEXT_PUBLIC_*`.
- Treat submitted URLs, scraped content, AI outputs, and generated code as untrusted. Validate URL destinations/redirects against SSRF, preserve preview isolation, and prevent generated file paths from escaping their intended root.
- Validate AI output against shared schemas before persisting or rendering it. Keep retrieved sources/citation IDs intact; do not present mock research as real evidence.

## Database Standards

- Use the shared Prisma client; do not create a new client for each request.
- Change `packages/db/prisma/schema.prisma` with a corresponding reviewed migration under `packages/db/prisma/migrations`. Regenerate the client after schema changes; never hand-edit generated client files.
- Use Prisma commands from `packages/db` so `prisma.config.ts` resolves correctly. The existing `db:push`, `db:studio`, and `db:generate` scripts point to Drizzle and must not be treated as Prisma commands.
- Use transactions for related writes requiring atomicity, especially credits, billing state, and version changes. Keep slow network/AI calls outside database transactions.
- Select only required fields, paginate growing lists, avoid N+1 queries, and add indexes/constraints justified by access patterns and invariants.
- Use parameterized queries for specialized vector/raw SQL operations; never concatenate untrusted input into SQL.
- Preserve ownership filters, soft-delete behavior, uniqueness constraints, and existing cache expiry semantics.
- Do not reset, reseed, or destructively migrate a shared database as part of routine verification. Inspect the target environment before applying migrations.

## Agent Workflow

1. Inspect `git status`, relevant instructions, manifests, and the existing implementation before editing. Preserve unrelated user changes.
2. Trace the affected flow across UI, API, service, worker, shared contracts, and database as needed. Make the smallest complete change.
3. Update relevant contracts, migrations, and configuration together. Add meaningful regression coverage for changed behavior where an existing test setup supports it.
4. Run applicable lint, type checks, and tests before finishing code changes. Build affected apps/shared packages when compilation, package exports, or runtime behavior changes. For documentation-only edits, check formatting and the diff; runtime tests and restarts are unnecessary.
5. After significant code/configuration/dependency/schema changes, rebuild changed shared packages, restart the affected services, ensure the frontend and API are running with the new code, and smoke-test the changed flow.
6. Review the final diff for unrelated edits, secrets, debug output, unnecessary comments, and missing configuration documentation.
7. Report what changed, checks run and results, and restart/health status when applicable. State blockers or unavailable checks accurately; never claim a successful run without evidence. End with the environment-variable report required above.

### Commands and Existing Caveats

Run these from the repository root unless otherwise noted:

| Command                                          | Purpose                                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm install`                                   | Install workspace dependencies when needed                      |
| `pnpm dev`                                       | Start workspace development tasks through Turbo                 |
| `pnpm --filter @useframe/web dev`                | Start the frontend (normally port 3000)                         |
| `pnpm --filter @useframe/server dev`             | Start the public API (default port 4000)                        |
| `pnpm --filter @useframe/<service> dev`          | Start a specific service using its actual package name          |
| `pnpm build`                                     | Build packages/apps that define a build task                    |
| `pnpm lint`                                      | Run defined lint tasks; report script/configuration failures    |
| `pnpm check-types`                               | Run defined `check-types` tasks through Turbo                   |
| `pnpm --filter @useframe/web typecheck`          | Check frontend types separately                                 |
| `pnpm --filter @useframe/server typecheck`       | Check public API types separately                               |
| `pnpm --filter @repo/evals runEvals -- --tier=1` | Run structural evaluations; inspect runner arguments before use |
| `pnpm --dir packages/db exec prisma generate`    | Regenerate the Prisma client                                    |

- Root `check-types` does not include web/server's differently named `typecheck` scripts. Run these explicitly when affected.
- The web lint script is still `next lint` despite the Next.js 16 dependency. Inspect the local ESLint setup and use `pnpm --filter @useframe/web exec eslint .` when appropriate; report configuration failures rather than treating them as passes.
- There is no root `test` script. Run relevant existing tests/evaluations where available and report coverage gaps instead of inventing a passing test command.
- Shared packages such as schemas, events, and site-builder export `dist`; rebuild them after changes before restarting consumers. A running watch process does not prove shared output is current.
- Service default ports: API 4000, orchestrator 4001, billing 4002, scoring 4003, research 4004. Confirm actual configured ports and probe their `/health` routes. Check the frontend HTTP response and worker startup/Redis connectivity separately; the worker has no HTTP health endpoint.
- Identify project-owned processes before restarting them. Do not kill every Node process. Leave the updated development services running after verification; on Windows, launch background helpers without visible windows.
- Check required PostgreSQL, Redis, and external-service configuration before starting dependent flows. If configuration or infrastructure prevents startup, report the exact blocker and what could be verified.

### Environment Changes

- Backend services validate configuration in `apps/<service>/src/config/env.ts`; update the relevant schema and consumers when adding or renaming configuration.
- Environment files are app-local (`apps/<app>/.env`) plus `packages/db/.env` for database tooling. Do not assume a root environment file automatically configures every process.
- Document names and safe placeholders in relevant configuration documentation or example files. Never copy live secrets into tracked examples.
- The final response must end with each added/changed variable's name, target environment file(s), purpose, required/optional status, and any safe default or restart requirement. If no changes are needed, end with "Environment changes: none."
