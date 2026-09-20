/**
 * Pushes eval results to Langfuse — no-ops when LANGFUSE_* env vars are
 * unset, so runEvals.ts works fully without any Langfuse setup. Kept
 * intentionally minimal: a scores/events push, not a full trace — evals
 * runs as a standalone script outside any request pipeline the AI SDK's
 * experimental_telemetry could attach to.
 */
export async function pushToLangfuse(results: Record<string, { pass: boolean }>): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  const host = process.env.LANGFUSE_HOST

  if (!publicKey || !secretKey || !host) {
    console.log("[evals] Langfuse env vars not set — skipping report push")
    return
  }

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64")

  try {
    await fetch(`${host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        batch: Object.entries(results).map(([name, result]) => ({
          id: `eval-${name}-${Date.now()}`,
          type: "score-create",
          timestamp: new Date().toISOString(),
          body: {
            name: `eval.${name}`,
            value: result.pass ? 1 : 0,
            dataType: "BOOLEAN",
          },
        })),
      }),
    })
    console.log("[evals] Pushed results to Langfuse")
  } catch (err) {
    console.warn("[evals] Failed to push to Langfuse (non-fatal):", err)
  }
}
