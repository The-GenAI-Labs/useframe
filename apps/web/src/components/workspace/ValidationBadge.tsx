import type { SSEEvent } from "@repo/schemas";
type Run = Extract<SSEEvent, { type: "validation_status" }>["run"];
export function ValidationBadge({ run }: { run: Run | undefined }) {
  if (!run || run.status === "ERROR") return null;
  return (
    <span role="status" className="text-xs text-mut">
      {run.status === "PASSED"
        ? `✓ Quality verified (${run.finalScore}%)`
        : run.status === "FAILED_MAX_ITERATIONS"
          ? "⚠ Minor discrepancies possible"
          : "Quality check running..."}
    </span>
  );
}
