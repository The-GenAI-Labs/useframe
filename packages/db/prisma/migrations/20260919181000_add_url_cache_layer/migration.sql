-- Caching layer: normalized-URL columns on CompetitorScan / ScoreResult, plus
-- a small Brave-search-query cache table. Excludes known pre-existing schema
-- drift (users_phone_key, users_status_idx) — not part of this feature.

-- CompetitorScan: add normalizedUrl (nullable first, backfilled, then set
-- NOT NULL by a follow-up migration after the backfill script runs) and
-- expiresAt (nullable = never expires, stays nullable permanently).
ALTER TABLE "competitor_scans" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "normalizedUrl" TEXT;

-- ScoreResult: same normalizedUrl/expiresAt pattern, plus analysisType
-- (nullable first, backfilled to "web_score" for existing rows, then set
-- NOT NULL) and scorerVersion (has a default so it's safe as NOT NULL
-- immediately).
ALTER TABLE "score_results" ADD COLUMN     "analysisType" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "normalizedUrl" TEXT,
ADD COLUMN     "scorerVersion" TEXT NOT NULL DEFAULT 'v1';

-- CreateTable
CREATE TABLE "search_query_cache" (
    "id" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_query_cache_queryHash_key" ON "search_query_cache"("queryHash");

-- CreateIndex
CREATE INDEX "competitor_scans_normalizedUrl_status_idx" ON "competitor_scans"("normalizedUrl", "status");

-- CreateIndex
CREATE INDEX "score_results_normalizedUrl_analysisType_scorerVersion_idx" ON "score_results"("normalizedUrl", "analysisType", "scorerVersion");
