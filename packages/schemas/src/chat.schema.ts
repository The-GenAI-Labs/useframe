import { z } from "zod"
import { ModelIdSchema } from "./models.js"

export const ChatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
})

export const ChatRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  history: z.array(ChatHistoryMessageSchema).max(20).optional(),
  modelId: ModelIdSchema.optional(),
})

export const ChatResponseSchema = z.object({
  reply: z.string(),
})

export const SendChatMessageSchema = z.object({
  conversationId: z.string().cuid().optional(),
  content: z.string().min(1).max(2000),
})

export type ChatHistoryMessage = z.infer<typeof ChatHistoryMessageSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type ChatResponse = z.infer<typeof ChatResponseSchema>
export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>
