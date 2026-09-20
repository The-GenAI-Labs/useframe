-- Run only after the backfill script (scripts/backfill-normalized-url.ts,
-- deleted after a one-time run) has confirmed zero NULL normalizedUrl rows
-- in competitor_scans / score_results, and zero NULL analysisType rows in
-- score_results.
ALTER TABLE "competitor_scans" ALTER COLUMN "normalizedUrl" SET NOT NULL;

ALTER TABLE "score_results" ALTER COLUMN "normalizedUrl" SET NOT NULL;
ALTER TABLE "score_results" ALTER COLUMN "analysisType" SET NOT NULL;
