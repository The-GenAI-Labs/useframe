# useframe

Build, improve, and analyze websites with AI.

useframe helps people turn a business idea or an existing website into a working site. It brings research, planning, generation, previews, SEO analysis, and deployment into one workspace.

## What you can do

- **Create a website:** describe your idea, audience, and goals, then generate a site.
- **Analyze existing sites:** scan your website or a competitor's site for content and design patterns.
- **Replicate and customize:** use a reference website as the starting point for a new build.
- **Refine the result:** review plans, iterate through chat, preview changes, and manage versions.
- **Check quality:** run website scoring and SEO audits.
- **Use research:** explore findings that inform design and content decisions.
- **Publish:** deploy generated sites and manage custom domains.
- **Manage usage:** track credits and handle payments through Razorpay.

## How it works

1. The **web app** provides the interface, authentication flow, chat, and live previews.
2. The **API server** handles users, projects, permissions, credits, and requests to other services.
3. The **orchestrator** handles AI planning, generation, replication, and iteration.
4. The **research and scoring services** supply research findings and website assessments.
5. The **worker** handles background jobs such as crawling, SEO audits, PDF creation, and deployment.
6. **PostgreSQL** stores application data. **Redis and BullMQ** coordinate jobs and caching.

The web app uses the public API for normal requests and connects to the orchestrator for selected streaming flows.

## Tech stack

| Area                          | Tools                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| Language and workspace        | TypeScript, pnpm, Turborepo                                           |
| Frontend                      | Next.js 16 App Router, React 19, Tailwind CSS 4                       |
| UI and animation              | shadcn/Radix UI, Framer Motion                                        |
| State and API calls           | Zustand, TanStack Query, Axios                                        |
| Forms and validation          | React Hook Form, Zod                                                  |
| Backend                       | Express 5, Node.js, tsx                                               |
| Database                      | PostgreSQL, pgvector, Prisma 7                                        |
| Jobs and caching              | BullMQ, Redis, ioredis                                                |
| Authentication                | JWT access/refresh tokens, Arctic OAuth, magic links, Turnstile       |
| AI                            | Vercel AI SDK; OpenAI, Anthropic, and additional compatible providers |
| Research retrieval            | Vector search, BM25, Cohere reranking                                 |
| Previews and site analysis    | WebContainers, Playwright, Cheerio, Lighthouse                        |
| Payments, storage, deployment | Razorpay, Cloudflare R2, Vercel                                       |
| Quality checks                | TypeScript, ESLint, Prettier, project evaluation runner               |

## Repository structure

### Applications

| Folder                      | Responsibility                          | Default port |
| --------------------------- | --------------------------------------- | ------------ |
| `apps/web`                  | Frontend, chat, workspace, and previews | 3000         |
| `apps/server`               | Public API and authentication           | 4000         |
| `apps/orchestrator-service` | AI generation and iteration             | 4001         |
| `apps/billing-service`      | Checkout, payment methods, and webhooks | 4002         |
| `apps/scoring-service`      | Website scoring                         | 4003         |
| `apps/research-service`     | Research retrieval and corpus endpoints | 4004         |
| `apps/worker`               | Background job processing               | No HTTP port |

Ports can be overridden by configuration. Frontend routes live in `apps/web/app`; components, hooks, stores, and API clients live in `apps/web/src`.

### Shared packages

| Folder                       | Responsibility                                                       |
| ---------------------------- | -------------------------------------------------------------------- |
| `packages/db`                | Prisma client, schema, migrations, seed data, and scan-cache helpers |
| `packages/schemas`           | Shared Zod schemas and data contracts                                |
| `packages/events`            | Queue names and job payloads                                         |
| `packages/site-builder`      | Generated-site construction helpers                                  |
| `packages/evals`             | Evaluation runner, datasets, and scorers                             |
| `packages/ui`                | Shared UI components                                                 |
| `packages/validators`        | Shared validation helpers                                            |
| `packages/types`             | Shared type package                                                  |
| `packages/typescript-config` | Shared TypeScript configuration                                      |
| `packages/eslint-config`     | Shared ESLint configuration                                          |

## Local setup

Run the commands below from the repository root.

### 1. Prepare the requirements

- Use a Node.js version compatible with pnpm 11, Next.js 16, and Prisma 7. The current development environment uses Node.js 24.16.0; the root `>=18` declaration does not capture every dependency's requirement.
- Install **pnpm 11.1.3**, the version pinned in `package.json`.
- Have a **PostgreSQL database with pgvector available**.
- Have **Redis** running; the default URL is `redis://localhost:6379`.
- Prepare credentials for the services you intend to start. The full workspace needs auth, AI, billing, and deployment configuration.

### 2. Install dependencies

```sh
pnpm install
```

### 3. Configure environment files

Create or update each app's own `.env` file. Database tooling also uses `packages/db/.env`. A root `.env` does not automatically configure every service.

This table summarizes startup requirements. For complete backend options and defaults, read `src/config/env.ts` inside each service.

| Environment file                 | Main configuration                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/.env`                  | `NEXT_PUBLIC_API_SERVICE_URL`, `NEXT_PUBLIC_ORCHESTRATOR_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for signup                                      |
| `apps/server/.env`               | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, Google/GitHub OAuth credentials, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`            |
| `apps/orchestrator-service/.env` | `DATABASE_URL`, `JWT_ACCESS_SECRET`, and at least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, or `KIMI_API_KEY`               |
| `apps/billing-service/.env`      | `DATABASE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`                                                             |
| `apps/scoring-service/.env`      | `DATABASE_URL`, `INTERNAL_SERVICE_SECRET`, and at least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`                                              |
| `apps/research-service/.env`     | `DATABASE_URL`; `RESEARCH_MOCK` defaults to `true`. Real retrieval uses OpenAI embeddings and can use Cohere reranking.                             |
| `apps/worker/.env`               | `DATABASE_URL`, `INTERNAL_SERVICE_SECRET`, `VERCEL_TOKEN`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`; AI and R2 settings depend on the jobs used |
| `packages/db/.env`               | `DATABASE_URL`; `OPENAI_API_KEY` is used when generating seed embeddings                                                                            |

Configuration points:

- Use the same application database across services. Set `REDIS_URL` for the API, orchestrator, billing, scoring, and worker if Redis is not at the default address.
- Match `JWT_ACCESS_SECRET` between the API and orchestrator. Access and refresh secrets must each be at least 32 characters; use separate values for them.
- Match `INTERNAL_SERVICE_SECRET` between callers and receivers of protected internal requests. Scoring and worker schemas require at least 16 characters.
- The API requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`.
- Register OAuth callbacks matching the configured redirect URIs. Defaults are `http://localhost:4000/api/auth/google/callback` and `http://localhost:4000/api/auth/github/callback`.
- Keep frontend URLs, service URLs, and CORS origins consistent when changing ports.
- Some credentials are required at startup even when you are not using that feature. The worker, for example, requires Vercel and Razorpay credentials.
- Never commit real secrets. Only public browser configuration belongs in `NEXT_PUBLIC_*` variables.

Example frontend configuration:

```dotenv
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:4000
NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:4001
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<your-public-turnstile-site-key>
```

### 4. Prepare the database and shared packages

Point `packages/db/.env` at your intended local development database before applying migrations.

```sh
pnpm --dir packages/db exec prisma generate
pnpm --dir packages/db exec prisma migrate deploy
pnpm --filter @repo/schemas build
pnpm --filter @repo/events build
pnpm --filter @repo/site-builder build
```

Migrations include the vector extension; the database must support it and allow its creation. These commands apply existing migrations.

For research corpus data, inspect `packages/db/prisma/seed.ts` and then seed your development database if needed:

```sh
pnpm --dir packages/db seed
```

Seeding writes research data and may call OpenAI to generate embeddings. It is not required merely to preview the frontend.

### 5. Install the worker's browser

For crawling, screenshots, and browser-based jobs:

```sh
pnpm --filter @useframe/worker exec playwright install chromium
```

The host must also have the system libraries needed to run Chromium.

### 6. Start the project

With PostgreSQL, Redis, and environment configuration ready:

```sh
pnpm dev
```

This starts the workspace development tasks through Turborepo. Open **http://localhost:3000**.

For focused work, start individual services in separate terminals:

```sh
pnpm --filter @useframe/web dev
pnpm --filter @useframe/server dev
pnpm --filter @useframe/orchestrator-service dev
pnpm --filter @useframe/worker dev
```

Also start billing, scoring, or research when your feature needs them. Starting only the frontend does not provide a functioning backend.

### 7. Verify startup

- Open the frontend at `http://localhost:3000`.
- Check the API at `http://localhost:4000/health`.
- Check `/health` on ports 4001–4004 for the other HTTP services you started.
- Check worker logs for database connectivity and processor startup.
- Exercise the feature you changed. A health response alone does not verify auth, AI calls, payments, or jobs.

## Everyday development commands

| Command                                          | Purpose                                     |
| ------------------------------------------------ | ------------------------------------------- |
| `pnpm dev`                                       | Run workspace development tasks             |
| `pnpm build`                                     | Build apps and packages with a build script |
| `pnpm lint`                                      | Run defined lint tasks                      |
| `pnpm check-types`                               | Run defined `check-types` tasks             |
| `pnpm --filter @useframe/web typecheck`          | Check frontend types                        |
| `pnpm --filter @useframe/server typecheck`       | Check API types                             |
| `pnpm --filter @repo/evals runEvals -- --tier=1` | Run structural evaluations                  |
| `pnpm exec prettier --check <file>`              | Check a file's formatting                   |
| `pnpm exec prettier --write <file>`              | Format a file                               |
| `pnpm --dir packages/db exec prisma studio`      | Inspect database records                    |

For a deliberate schema change in your development database:

1. Update `packages/db/prisma/schema.prisma`.
2. Create and review a migration with `pnpm --dir packages/db exec prisma migrate dev --name <change-name>`.
3. Regenerate the Prisma client.
4. Commit the schema and migration together.

## Current tooling caveats

- **Type checks:** root `pnpm check-types` does not run web/server's differently named `typecheck` scripts. Run those separately when affected.
- **Frontend lint:** its script still uses `next lint` despite the Next.js 16 dependency. The direct command is `pnpm --filter @useframe/web exec eslint .`; the existing configuration may still need attention.
- **Database scripts:** `db:push`, `db:studio`, and `db:generate` currently point to Drizzle. Application persistence uses Prisma, so use the explicit Prisma commands above.
- **Tests:** there is no root `test` script. Vitest and Testing Library dependencies are present, and `packages/evals` provides evaluation checks; these do not imply complete automated coverage.
- **Shared output:** schemas, events, and site-builder export compiled `dist` files. Rebuild them after changes when starting services individually.
- **Research mode:** the research service defaults to mock mode. Configure real retrieval and corpus data before relying on results as real evidence.
- **Preview isolation:** browser previews depend on the cross-origin isolation headers in `apps/web/next.config.js`. Preserve these when changing server or proxy configuration.

## Working on the code

1. Read the existing implementation and follow its patterns.
2. Keep changes focused; reuse existing libraries and components.
3. Add comments only when clarification is needed.
4. Keep UI, API, service, worker, and shared-schema changes consistent.
5. Run relevant formatting, lint, type checks, and evaluations. Report unavailable or failing checks honestly.
6. After significant implementation changes, rebuild affected shared packages, restart affected services, and verify the frontend and API are running with the new code.
7. List required environment-variable changes at the end of your change summary.

Project-specific assistant instructions are maintained in [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), and [GEMINI.md](GEMINI.md). Keep all three synchronized.
