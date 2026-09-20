import { generateText } from "ai"
import type { ChatRequest } from "@repo/schemas"
import { getModel } from "@/llm/providers.js"
import { DEFAULT_CHAT_PROMPT } from "@/prompts/chat.prompt.js"

export type ChatResult = {
  reply: string
}

export async function runChat(request: ChatRequest): Promise<ChatResult> {
  const model = getModel(request.modelId)
  const prompt = DEFAULT_CHAT_PROMPT({
    instruction: request.instruction,
    history: request.history,
  })

  const result = await generateText({
    model,
    prompt,
    maxTokens: 800,
    experimental_telemetry: { isEnabled: true, functionId: "chat-agent" },
  })

  return { reply: result.text.trim() }
}
