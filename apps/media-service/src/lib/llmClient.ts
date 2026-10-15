import type { Llm, LlmRequest, LlmResponse } from "@repo/media-ai"

// Model routing and provider keys live in the orchestrator; this service only sends the request.
export function createOrchestratorLlm(config: { url: string; secret: string; fetchImpl?: typeof fetch }): Llm {
  const doFetch = config.fetchImpl ?? fetch
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const res = await doFetch(`${config.url.replace(/\/$/, "")}/internal/media-ai/llm`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": config.secret },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(req.routingKey === "blueprint" ? 270_000 : 120_000),
      })
      const body = (await res.json().catch(() => null)) as { success?: boolean; data?: LlmResponse; message?: string } | null
      if (!res.ok || !body?.success || !body.data) throw new Error(`Model call failed (${res.status}): ${body?.message ?? "no response"}`)
      return body.data
    },
  }
}
