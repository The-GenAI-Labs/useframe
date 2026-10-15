# AI media: Site Blueprint and creative pipeline

Paid projects can get images and short videos made for their site. Generation plans them as part of
the site (the Site Blueprint), and a background job in `apps/media-service` makes them. Everything runs
on fake models and providers until someone deliberately switches it to live.

## Where the code lives

| Piece                                                                                    | Location                                                                                                       |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Shared logic: schemas, prompts, validation, cost, credits, checkpoints, providers, fakes | `packages/media-ai` (`@repo/media-ai`; test helpers at `@repo/media-ai/testing`)                               |
| Site Blueprint during generation, Call 2 context, waiting for media                      | `apps/orchestrator-service/src/lib/siteMedia.ts`, `agents/orchestrator.ts`                                     |
| Claude calls (blueprint, creative and vision routing keys)                               | `apps/orchestrator-service/src/llm/claude.ts`, `routes/mediaAi.route.ts`                                       |
| Job runner, checkpoints, sweep                                                           | `apps/media-service/src/generate/` (queues `mediaGenerate`, `mediaJobsSweep`)                                  |
| Public API                                                                               | `apps/server/src/modules/mediaJobs` (`/api/projects/:slug/media/...`, `/api/media/estimate`)                   |
| UI                                                                                       | `apps/web/src/components/media/MediaAiPanel.tsx`, `MediaCheckpointCard.tsx`, brief media fields                |
| Tables                                                                                   | `media_jobs`, `media_generations`, `project_versions.blueprint` (migration `20261012000000_media_ai_pipeline`) |

## The pipeline

1. **Site Blueprint.** `runSiteBlueprint` is one function with three modes:
   - `brief` (approved design brief): runs after the structure agent. It may only add `narrative`,
     `visualSystem` and `mediaScript`. Pages, sections, copy framework, colours and fonts come from the
     brief and are never read from the model's answer.
   - `full` (no approved brief): replaces the structure call. Its pages are validated by the structure
     agent's own parser, and if it fails twice generation falls back to the normal structure agent.
   - `media-only`: a re-run from the Media tab over an existing site.

   Every answer is validated in code: the schema, colours within ΔE 12 of the palette (neutrals always
   allowed), slots that exist and accept the kind, upload-only purposes, budgets and autoplay caps. Bad
   answers are retried once with the exact errors. After two failures media is skipped with a one-line
   notice in the Media tab, nothing is charged, and the site still builds. A blueprint carries a hash of
   the sections and copy framework; once that hash goes stale the blueprint is re-run, never reused.

2. **Call 2 (copy agent)** receives the narrative and the planned media for each section as read-only
   DATA. The copy framework still decides structure and tone.
3. **Media job:** EXPAND, then for each item CONCEPTS → SELECT → FRAMES → IMG_QA → VIDEO_PROMPT → VIDEO →
   VID_QA, then BIND.
   - Images: a batched prompt call, then generate, then vision QA. Up to 3 attempts; each failed attempt
     gets a revised prompt.
   - Videos:
     - Three concepts with distinct motion mechanisms, written one video at a time so videos on the same
       site don't repeat a mechanism.
     - A judge scores the concepts, and code picks the winner.
     - Opening and ending frames, then a first/last-frame video, then QA on the poster, a middle frame
       and the last frame.
     - A refusal gets one softened retry and a QA failure gets one revision. After that the item falls
       back to its opening still.
   - BIND writes the bindings into a new "Media added" version, at most once (`applyJobResult`).
4. **Modes:**
   - `AUTO` runs straight through.
   - `MANUAL` stops at PLAN_APPROVE, CONCEPT_PICK, IMAGES_APPROVE and VIDEO_APPROVE, skipping any with
     nothing to show.
   - An unanswered checkpoint expires after 72 h. The job is cancelled and the unspent credits refunded.
   - `OFF` means no blueprint call and no new fields.

Generation does not wait for a MANUAL job. It compiles with whatever is bound, and the job adds a
"Media added" version when it finishes.

## Credits

- One reservation per job (`refId media:<jobId>`) covers the plan, including the blueprint call when it ran.
- Each item is settled separately:
  - A failed, dropped or skipped item is refunded once (`media:<jobId>:<itemId>`). A partial unique
    index makes the refund idempotent.
  - A cancelled, expired or stalled job (no progress for 30 minutes) refunds everything unspent.
- In MANUAL mode, regenerating an image, an extra video take or more candidates is charged as its own
  reservation. Regenerating concepts is free (at most twice).
- A user counts as paid when their credit balance is above 0. A job that reserved their last credits
  still runs, and they can still view, answer and cancel it.

## Defaults and limits

| Setting                 | Default                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| Feature                 | `MEDIA_ENABLED=false`                                                  |
| Provider mode           | `MEDIA_AI_PROVIDER_MODE=fake` (orchestrator and media-service)         |
| Budgets (images:videos) | IMAGES_ONLY 8:0, LIGHT 4:1, STANDARD 8:3, RICH 14:6                    |
| Hard caps               | 24 images, 10 videos, 60 generated assets per project                  |
| Video length            | 5 to 10 s                                                              |
| Jobs                    | 5 starts per project per 24 h, 2 active per user, 1 active per project |
| API rate limits         | 10 job starts and 60 checkpoint actions per user per hour              |
| Concurrency             | 3 image and 2 video provider calls across all replicas                 |
| Credit prices           | `MEDIA_CREDIT_*`, required in production once enabled                  |

Every variable is listed in `infra/helm/useframe/ENV.md` and the services' `.env.example`.

## Switching to live

Live mode spends real money. Do it only on purpose, in an environment that has a cost cap.

1. Set the credit prices and `MEDIA_DAILY_COST_CAP_USD` on server, orchestrator-service and media-service.
2. orchestrator-service: `MEDIA_AI_PROVIDER_MODE=live` and `ANTHROPIC_API_KEY`.
3. media-service: `MEDIA_AI_PROVIDER_MODE=live`, `OPENAI_API_KEY`, `RUNWARE_API_KEY`, `INTERNAL_SERVICE_SECRET`.
4. Apply the migration with `prisma migrate deploy`, after checking the target database.
5. Set `MEDIA_ENABLED=true` on all three and restart them.

In live mode, Runware uploads finished videos straight into the media bucket through a presigned PUT, but
only when a single take is requested. Other results are downloaded through the SSRF guard: https only,
hosts in `MEDIA_PROVIDER_HOST_ALLOWLIST`, every hop resolved to a public address, and a size cap.

## Reading a job trace

- `media_jobs`: `status`, `stage` (the substep shown in the UI), `checkpoint`, `state.items[*]` (status,
  done stages, concepts, frames, video, failure reason), `state.charges`/`settled` (credit ledger),
  `bindings`, `resultVersionId`, `costUsd`.
- `media_generations`: one row per provider or LLM call, with `stage`, `itemId`, `attempt`, `requestKey`,
  `providerTaskId` (stored before submit), `status`, `costUsd` and `latencyMs`. The prompt text is kept for
  debugging and is never shown to users.
- `credit_transactions` where `refType = 'MEDIA'`: the reservation, extras and refunds.
- Logs carry ids, stages, durations and cost only. They never contain prompts' user text, images or secrets.

A job crashed during a video? Its `media_generations` row has `providerTaskId`. On resume the runner
polls that task instead of submitting again, and resubmits with the same id only if the provider lost it.

## Manual test plan (fake mode)

1. Start the API, orchestrator, media-service and web with `MEDIA_ENABLED=true` and fake mode.
2. With a paid account (credit balance above 0), open the brief, then go to Brand → AI images and videos.
   You should see the mode, budget, notes and an estimate. A free account sees an upsell and no fields.
3. Generate with AUTO. The progress panel shows "Writing your site's full script", then the media substeps. The site completes,
   the Media tab lists AI-generated items, and "How this was made" shows the idea, motion and research,
   with no provider names.
4. Media tab → Generate with AI → Approve each step. Walk through all four cards: remove an item at plan
   approval and confirm the refund, pick a non-recommended concept, use "Try again" on an image, then
   choose a take.
5. Leave a checkpoint open and run the sweep with a clock far in the future (as in `runner.test.ts`). The
   job is cancelled and refunded.
6. Make the fake blueprint fail (`FakeLlm` override) and generate. The site completes and the Media tab
   shows the notice.
