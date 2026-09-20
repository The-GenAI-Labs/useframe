// Bump this whenever score.agent.ts's rubric/prompt changes in a way that
// would make previously-cached ScoreResult reports stale/incorrect for new
// requests — cached analyses are keyed on (normalizedUrl, analysisType,
// scorerVersion), so bumping this invalidates the cache going forward
// without needing to touch existing rows (they simply stop matching).
export const CURRENT_SCORER_VERSION = "v1"
