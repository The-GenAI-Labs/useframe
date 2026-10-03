# Project-scoped chat

The workspace's **Ask about this project** button opens persisted Q&A with SSE answers and the existing citation tooltip. The edit modal continues to use its existing iteration flow; chat does not debit credits or create versions.

## Repository adaptations

The checkout had a generic JSON `/chat` endpoint, but no implemented `chat_routing` branch. `/chat` now accepts `{ projectId, message }` and streams through the same `initSSE`/`sseWrite` and authenticated `useSSE` transport as generation. Legacy requests without project context receive a fixed instruction to open a project without invoking a model. The public API serves owner-scoped, cursor-paginated history at `/api/chat/projects/:projectId/messages`. Both paths validate input; the orchestrator checks ownership and soft deletion before reading history or writing messages.

`getProjectResearch` from `@repo/rag` supplies the existing cited findings; no retrieval or embeddings run. Context uses current ProjectVersion SEO and snapshot page metadata (the Stage 2 editor writes there), stored Page SEO, intake/project details, the current design brief, report summaries, and up to three completed owner/project-scoped competitor scans. Context sizes and history are bounded. Only IDs in the assembled findings survive validation. History and source text are data, never instructions.

The Research tab used plain citation text rather than the claimed hover UI. It and project chat now share a small adapter around the existing `CitationTooltip`.

The model helper's explicit `deepseek-v4-flash` ID maps to provider `deepseek-chat`. Chat checks for a DeepSeek key before invoking this helper, preventing its normal missing-key fallback to another provider. Project chat ignores generation tier and the UI model selector.

## Jev rollout

`chat_scope` uses the shared `decide()` and official TypeSafe [choice response contract](https://docs.typesafe.ai/api). Default is `off`. Start in `shadow`, which returns a full-context answer and logs classification in the background. `on` refuses confident off-topic requests without a DeepSeek call; Jev classification itself is still a provider request. Missing/invalid/timed-out Jev results answer with full context. DeepSeek's independent system instructions enforce project scope in all modes.

Promotion requires one shadow observation and at least 90% accuracy on the 50-case labeled set for the same model, prompt, and threshold. It does not require 200 shadow decisions: the baseline is no check. The shared wrapper checks evaluation evidence in existing JevDecisionLog rows. Nothing automatically changes mode to on.

Run from `packages/evals` with the intended database and TypeSafe environment:

```sh
pnpm eval:chat-scope
pnpm eval:chat-scope -- --record
```

The first command is read-only. `--record` records a passing evaluation transactionally, replacing previous evaluation evidence for that policy. Failed evaluations do not record promotion evidence. Review the 50 labels before rollout; changing policy invalidates prior evidence.

## Configuration

Set these in `apps/orchestrator-service/.env` and restart the orchestrator:

| Variable             | Required                                             | Default / purpose                                         |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| DEEPSEEK_API_KEY     | Required for answers (existing variable)             | No provider fallback                                      |
| CHAT_MODEL           | Optional                                             | `deepseek-v4-flash`, pinned helper ID for `deepseek-chat` |
| OFF_TOPIC_THRESHOLD  | Optional                                             | `0.65`, confident refusal threshold                       |
| MAX_HISTORY_MESSAGES | Optional                                             | `10`, prior messages, max 30                              |
| JEV_MODE_CHAT_SCOPE  | Optional                                             | `off`; start rollout with `shadow`                        |
| TYPESAFE_API_KEY     | Required for live classification, otherwise optional | Missing key fails open                                    |
| JEV_MODEL            | Optional                                             | `jev-1.13.0`; changes invalidate promotion evidence       |
| JEV_TIMEOUT_MS       | Optional                                             | `1000`; 50–10000ms                                        |

The evaluation runner uses the same Jev settings and OFF_TOPIC_THRESHOLD, plus DATABASE_URL when recording evidence. Keep these aligned with the orchestrator. Existing Langfuse settings enable scope/context/model/citation traces. No new frontend environment variables are needed.

Apply `20261002000000_project_chat`, generate Prisma from `packages/db`, rebuild schemas and Jev, then restart API/orchestrator/frontend. Do not use db push: it removes custom search indexes in this repository.

## Verification commands

- `pnpm --filter @repo/jev test`
- `pnpm --filter @useframe/orchestrator-service test:chat`
- With `RUN_CHAT_LIVE=1`, the optional live injection test deliberately forces an on-topic classification and verifies that DeepSeek still declines the unrelated request. Mocked prompt assertions alone do not establish model behavior.

A disconnected or timed-out answer leaves its received USER row but no fabricated ASSISTANT row. History is paginated at 50 messages; model continuity uses the configured recent-message limit. The model request is cancelled on disconnect and capped at 90 seconds. Jev background decisions remain bounded by the shared deadline.

## Verified in this checkout (October 2, 2026)

- 47 tests passed: shared Jev 13, project chat/context/routes 16, live DeepSeek injection probe 1, and existing retrieval cache/adapter 17.
- Shared schemas/Jev and orchestrator builds passed. API, frontend, and eval type checks passed. Next.js production build passed.
- Migration applied successfully; Prisma regenerated. Existing corpus migration protection passed.
- A disposable project successfully streamed a real DeepSeek answer and persisted USER/ASSISTANT rows. The smoke test verified 51-message pagination without duplicates, denied another owner's requests, denied soft-deleted projects, and returned 422 for malformed IDs. The fixture and its messages were removed afterward.
- Frontend, public API, orchestrator, and research were restarted and returned HTTP 200 on their expected routes. Updated services remain running.
- Frontend ESLint remains blocked by the existing unresolved `@repo/eslint-config` package. No successful lint run is claimed.
- The TypeSafe key is absent. The 50-case live scope evaluation was not run, no promotion evidence was written, and chat_scope remains off. Its failure paths and rollout gate were tested with mocks.

This Windows environment requires Node's system certificate store for outbound provider calls. Local services were launched with `NODE_OPTIONS=--use-system-ca`; this retains TLS verification and trusts the configured Windows certificate store. Set that in the launcher environment before Node starts if the same TLS-chain error occurs again. It is not an app `.env` setting because dotenv runs after Node startup. No credentials or private `.env` values were changed.
