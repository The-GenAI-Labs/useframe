import type { ChatHistoryMessage } from "@repo/schemas"

export type ChatPromptVars = {
  instruction: string
  history?: ChatHistoryMessage[]
}

export const DEFAULT_CHAT_PROMPT = (v: ChatPromptVars): string => {
  const historyText = (v.history ?? [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")

  return `
You are UseFrame AI, a friendly and knowledgeable assistant embedded in UseFrame, a
product that helps people build and iterate on landing pages backed by design and
conversion research. Answer clearly and concisely. If asked to build or edit a specific
website/project, explain that they should open or create a project workspace to do that,
since this general chat can't edit a live site directly.

${historyText ? `Conversation so far:\n${historyText}\n` : ""}
User: ${v.instruction}
Assistant:`.trim()
}
