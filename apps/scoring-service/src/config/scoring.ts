// Bump this whenever score.agent.ts's rubric/prompt changes in a way that
// would make previously-cached ScoreResult reports stale/incorrect for new
// requests — cached analyses are keyed on (normalizedUrl, analysisType,
// scorerVersion), so bumping this invalidates the cache going forward
// without needing to touch existing rows (they simply stop matching).
// v2 — added the measured Performance & Speed criterion, so overallScore is
// now an average of 6 criteria rather than 5. Cached v1 reports would render
// with a missing criterion and an incomparable overall, hence the bump.
export const CURRENT_SCORER_VERSION = "v2"
