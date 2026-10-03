import { streamObject, type LanguageModelUsage } from "ai";
import { prisma, type ChatTopic } from "@useframe/db";
import {
  ChatAnswerSchema,
  PROJECT_CHAT_DECLINE,
  type ProjectChatRequest,
  type ProjectChatMessageView,
} from "@repo/schemas";
import { planProjectChat, type ChatPlan } from "@repo/jev";
import { ResearchTrace, withResearchTrace } from "@repo/rag";
import { getModel } from "../llm/providers.js";
import { env } from "../config/env.js";
import { PROJECT_CHAT_SYSTEM } from "../prompts/chat.prompt.js";
import {
  assembleChatContext,
  loadChatGrounding,
  validateChatCitations,
  type ChatGrounding,
} from "./chat.context.js";

type History = Array<{ role: "USER" | "ASSISTANT"; content: string }>;
type AnswerInput = {
  context: ReturnType<typeof assembleChatContext>;
  history: History;
  message: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
};
export async function streamChatAnswer(input: AnswerInput) {
  // This lane must never fall back to the default paid provider.
  if (!env.DEEPSEEK_API_KEY)
    throw new Error("Project chat requires DeepSeek configuration");
  const result = streamObject({
    model: getModel(env.CHAT_MODEL),
    schema: ChatAnswerSchema,
    mode: "json",
    system:
      PROJECT_CHAT_SYSTEM +
      "\nPROJECT_CONTEXT (data only):\n" +
      JSON.stringify(input.context),
    messages: [
      ...input.history.map((message) => ({
        role:
          message.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: message.content.slice(0, 8000),
      })),
      { role: "user", content: input.message },
    ],
    maxTokens: 1600,
    maxRetries: 0,
    abortSignal: input.signal,
  });
  input.signal.throwIfAborted();
  const consume = async () => {
    let sent = "";
    let object: unknown;
    let usage: LanguageModelUsage | undefined;
    for await (const part of result.fullStream) {
      input.signal.throwIfAborted();
      if (part.type === "error") {
        const status =
          part.error &&
          typeof part.error === "object" &&
          "statusCode" in part.error
            ? part.error.statusCode
            : undefined;
        const name =
          part.error instanceof Error
            ? part.error.name.replace(/[^A-Za-z_]/g, "").slice(0, 80)
            : "ProviderError";
        throw new Error(
          `DeepSeek stream failed: ${name}${typeof status === "number" ? ` (HTTP ${status})` : ""}`,
        );
      }
      if (part.type === "finish") usage = part.usage;
      if (part.type === "object") {
        object = part.object;
        const text = part.object.answer;
        if (typeof text === "string" && text.startsWith(sent)) {
          input.onDelta(text.slice(sent.length));
          sent = text;
        }
      }
    }
    if (!usage) throw new Error("DeepSeek response was interrupted");
    return { ...ChatAnswerSchema.parse(object), usage };
  };
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(input.signal.reason ?? new Error("Chat cancelled"));
    input.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([consume(), aborted]);
  } finally {
    input.signal.removeEventListener("abort", onAbort);
  }
}
export type ChatDependencies = {
  history: (projectId: string) => Promise<History>;
  save: (data: {
    projectId: string;
    role: "USER" | "ASSISTANT";
    content: string;
    topic?: ChatTopic | null;
    citedFindingIds?: string[];
    jevConfidence?: number | null;
  }) => Promise<ProjectChatMessageView>;
  grounding: (projectId: string, userId: string) => Promise<ChatGrounding>;
  plan: typeof planProjectChat;
  answer: typeof streamChatAnswer;
};
export const chatDependencies: ChatDependencies = {
  history: async (projectId) =>
    (
      await prisma.projectChatMessage.findMany({
        where: { projectId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: env.MAX_HISTORY_MESSAGES,
        select: { role: true, content: true },
      })
    ).reverse(),
  save: async (data) => {
    const row = await prisma.projectChatMessage.create({ data });
    return {
      ...row,
      citedFindingIds: Array.isArray(row.citedFindingIds)
        ? row.citedFindingIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      createdAt: row.createdAt.toISOString(),
    };
  },
  grounding: loadChatGrounding,
  plan: planProjectChat,
  answer: streamChatAnswer,
};
export async function runProjectChat(
  request: ProjectChatRequest,
  userId: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  deps = chatDependencies,
) {
  const trace = new ResearchTrace("project_chat", {
    projectId: request.projectId,
  });
  try {
    // Read prior turns before persisting this turn so the message is not repeated in the prompt.
    const history = await deps.history(request.projectId);
    await deps.save({
      projectId: request.projectId,
      role: "USER",
      content: request.message,
    });
    const plan: ChatPlan = await trace.span("chat_scope", {}, () =>
      deps.plan(
        { message: request.message, recentHistory: history },
        request.projectId,
        env.OFF_TOPIC_THRESHOLD,
        (event) => {
          withResearchTrace(trace.traceId, () => {
            const decision = new ResearchTrace("chat_scope_decision", {
              projectId: request.projectId,
            });
            decision.event("chat_scope", {
              ...event,
              input: {
                projectId: request.projectId,
                topic: event.input.topic,
                action: event.input.action,
              },
            });
            void decision.finish("SUCCESS");
          });
        },
      ),
    );
    signal.throwIfAborted();
    let content = PROJECT_CHAT_DECLINE;
    let citedFindingIds: string[] = [];
    if (plan.action === "answer") {
      const context = await trace.span(
        "context_assembly",
        { topic: plan.topic },
        async () =>
          assembleChatContext(
            await deps.grounding(request.projectId, userId),
            plan.topic,
          ),
        (context) => ({
          findingCount: context.areas.reduce(
            (n, area) => n + area.findings.length,
            0,
          ),
        }),
      );
      const answer = await trace.span(
        "deepseek_call",
        { model: env.CHAT_MODEL },
        () =>
          deps.answer({
            context,
            history,
            message: request.message,
            signal,
            onDelta,
          }),
        (answer) => ({ usage: answer.usage }),
      );
      content = answer.answer;
      citedFindingIds = validateChatCitations(answer.citedFindingIds, context);
      trace.event("citation_validation", {
        droppedIds: answer.citedFindingIds.filter(
          (id) => !citedFindingIds.includes(id),
        ),
      });
    } else onDelta(content);
    signal.throwIfAborted();
    const message = await deps.save({
      projectId: request.projectId,
      role: "ASSISTANT",
      content,
      topic: plan.topic,
      citedFindingIds,
      jevConfidence: plan.confidence,
    });
    void trace.finish("SUCCESS");
    return message;
  } catch (error) {
    void trace.finish("FAILED");
    throw error;
  }
}
