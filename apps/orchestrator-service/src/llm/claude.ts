import Anthropic from "@anthropic-ai/sdk"
import { FakeLlm, type Llm, type LlmRequest, type LlmResponse, type RoutingKey } from "@repo/media-ai"
import { env } from "@/config/env.js"

// USD per million tokens (input, output) for the routing-key models.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
}

export function modelForRoutingKey(key: RoutingKey): string {
  if (key === "blueprint") return env.BLUEPRINT_MODEL_ID
  return key === "media-vision" ? env.MEDIA_VISION_MODEL_ID : env.MEDIA_CREATIVE_MODEL_ID
}

// Blueprint calls on Opus at high effort take longer than the 90 s budget of the other media calls.
const timeoutFor = (key: RoutingKey) => (key === "blueprint" ? 240_000 : 90_000)

// The routing keys run on Claude 5.5 models, which take effort through
// output_config (the AI SDK adapter used elsewhere cannot send it) and reject
// sampling parameters, so no temperature is ever sent.
export function createClaudeLlm(client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 })): Llm {
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const model = modelForRoutingKey(req.routingKey)
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: req.maxTokens ?? 16_000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "high" },
          system: req.system,
          messages: [
            {
              role: "user",
              content: [
                ...(req.images ?? []).map((img) => ({
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: img.mime, data: img.base64 },
                })),
                { type: "text" as const, text: req.prompt },
              ],
            },
          ],
        },
        { signal: AbortSignal.timeout(timeoutFor(req.routingKey)) },
      )
      const message = await stream.finalMessage()
      const [inPrice, outPrice] = PRICES[model] ?? [0, 0]
      const costUsd = (message.usage.input_tokens * inPrice + message.usage.output_tokens * outPrice) / 1e6
      if (message.stop_reason === "refusal") return { text: "", refused: true, costUsd }
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
      return { text, costUsd }
    },
  }
}

export const mediaLlm: Llm = env.MEDIA_AI_PROVIDER_MODE === "live" ? createClaudeLlm() : new FakeLlm()
