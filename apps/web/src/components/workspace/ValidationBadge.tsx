import type { SSEEvent } from "@repo/schemas";
type Run = Extract<SSEEvent, { type: "validation_status" }>["run"];
export function ValidationBadge({
  run,
  pipeline = "REPLICATE",
}: {
  run: Run | undefined;
  pipeline?: "MAIN" | "REPLICATE";
}) {
  if (!run || run.status === "ERROR") return null;
  return (
    <span role="status" className="text-xs text-mut">
      {run.status === "PASSED"
        ? `✓ Quality verified (${run.finalScore}%)`
        : run.status === "FAILED_MAX_ITERATIONS"
          ? pipeline === "MAIN"
            ? "⚠ Minor issues found"
            : "⚠ Minor discrepancies possible"
          : "Quality check running..."}
    </span>
  );
}
