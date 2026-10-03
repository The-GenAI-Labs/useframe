# Shared Jev decisions

`jevEvaluate` sends bounded Noul and Choice evaluations to the official TypeSafe System One API. `noulP` validates yes-probabilities. `decide` provides mandatory baseline fallback and off/shadow/on modes, persists feature-specific JevDecisionLog audit rows (chat scope includes the submitted message), and gates on-mode on shadow evidence. `flushJev` drains pending background decision logs during graceful shutdown.

No other feature is enabled merely by adding its name to JevFeature. Use getJevMode(feature), a stable policyKey containing prompt/model/threshold settings, and a task-specific same() comparator. `viaJev` must accept and respect AbortSignal, return null on rejection, and have no side effects: it may run in shadow or finish after the timeout. Baseline exceptions remain application errors rather than being mistaken for verifier failures.

See [retrieval cache operations](../../docs/retrieval-cache.md) for current integration, rollout, tests and environment settings. API contract: https://docs.typesafe.ai/api.

## Project chat scope

`chat_scope` supports TypeSafe choice answers and defaults to `JEV_MODE_CHAT_SCOPE=off`. Its baseline is an answer using full project context. Roll out in shadow first. Unlike retrieval-cache promotion, on mode requires one shadow observation plus 50 hand-labeled evaluation rows with at least 90% accuracy for the current policy. `packages/evals/src/chatScope.ts --record` records a passing run in the existing decision log; it never changes mode automatically. See `docs/project-chat.md` for configuration and rollout.
