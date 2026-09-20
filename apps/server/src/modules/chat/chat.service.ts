import { prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callChat } from "@/lib/orchestrator.js"
import type { SendChatMessageInput } from "./chat.schema.js"

export const ChatService = {
  async sendMessage(
    user: { id: string; email: string; plan: string },
    input: SendChatMessageInput
  ) {
    let conversation
    if (input.conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: input.conversationId, userId: user.id, projectId: null },
      })
      if (!conversation) throw new AppError("Conversation not found", 404)
    } else {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, projectId: null },
      })
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: input.content,
      },
    })

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, content: true },
    })

    const internalToken = signAccessToken({
      id: user.id,
      email: user.email,
      plan: user.plan,
    })

    let reply: string
    try {
      const result = await callChat(
        {
          instruction: input.content,
          history: history
            .slice(1)
            .reverse()
            .map((m: { role: string; content: string }) => ({
              role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
              content: m.content,
            })),
        },
        internalToken
      )
      reply = result.reply
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Failed to get a response"
      const errorMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: `Sorry, something went wrong: ${message}`,
        },
      })
      return {
        message: errorMessage,
        conversationId: conversation.id,
        error: true,
      }
    }

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: reply,
      },
    })

    return {
      message: assistantMessage,
      conversationId: conversation.id,
      error: false,
    }
  },
}
