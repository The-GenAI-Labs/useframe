-- Which of the two planner candidates was chosen: "A", "B", or "auto"
-- (user deferred to the planner's own recommendation). Nullable — existing
-- rows predate the two-candidate picker.
ALTER TABLE "generation_outcomes" ADD COLUMN "selectionMethod" TEXT;
