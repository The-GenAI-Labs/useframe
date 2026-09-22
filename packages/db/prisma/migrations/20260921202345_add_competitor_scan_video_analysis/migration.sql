-- Structured design-pattern analysis from a scroll-through screen recording
-- of the top-ranked competitor. Nullable: only one scan per project gets it,
-- and only when the video pipeline (ffmpeg) is available.
ALTER TABLE "competitor_scans" ADD COLUMN "videoAnalysis" JSONB;
