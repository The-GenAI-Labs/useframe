import { prisma } from "@useframe/db";
import { AppError } from "@/middleware/errorHandler.js";
import { signAccessToken } from "@/lib/jwt.js";
import { callChat } from "@/lib/orchestrator.js";
import type { SendChatMessageInput } from "./chat.schema.js";

export const ChatService = {
  async history(userId: string, projectId: string, before?: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppError("Project not found", 404);
    const cursor = before
      ? await prisma.projectChatMessage.findFirst({
          where: { id: before, projectId },
          select: { id: true, createdAt: true },
        })
      : null;
    if (before && !cursor) throw new AppError("Chat cursor not found", 404);
    const rows = await prisma.projectChatMessage.findMany({
      where: {
        projectId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    });
    const page = rows.slice(0, 50);
    return {
      messages: page
        .reverse()
        .map((row) => ({
          ...row,
          citedFindingIds: Array.isArray(row.citedFindingIds)
            ? row.citedFindingIds.filter(
                (id): id is string => typeof id === "string",
              )
            : [],
          createdAt: row.createdAt.toISOString(),
        })),
      nextCursor: rows.length > 50 ? page[0]?.id : null,
    };
  },
  async sendMessage(
    user: { id: string; email: string; plan: string },
    input: SendChatMessageInput,
  ) {
    let conversation;
    if (input.conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: input.conversationId, userId: user.id, projectId: null },
      });
      if (!conversation) throw new AppError("Conversation not found", 404);
    } else {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, projectId: null },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: input.content,
      },
    });

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, content: true },
    });

    const internalToken = signAccessToken({
      id: user.id,
      email: user.email,
      plan: user.plan,
    });

    let reply: string;
    try {
      const result = await callChat(
        {
          instruction: input.content,
          history: history
            .slice(1)
            .reverse()
            .map((m: { role: string; content: string }) => ({
              role:
                m.role === "USER" ? ("user" as const) : ("assistant" as const),
              content: m.content,
            })),
        },
        internalToken,
      );
      reply = result.reply;
    } catch (err) {
      const message =
        err instanceof AppError ? err.message : "Failed to get a response";
      const errorMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: `Sorry, something went wrong: ${message}`,
        },
      });
      return {
        message: errorMessage,
        conversationId: conversation.id,
        error: true,
      };
    }

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: reply,
      },
    });

    return {
      message: assistantMessage,
      conversationId: conversation.id,
      error: false,
    };
  },
};
