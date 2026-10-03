import { z } from "zod";
import { DECISION_AREAS } from "./retrieval.schema.js";
export const CHAT_TOPICS = [
  ...DECISION_AREAS,
  "SEO",
  "PROJECT_OVERVIEW",
  "COMPETITOR",
  "OFF_TOPIC",
] as const;
export const ProjectChatRequestSchema = z.object({
  projectId: z.string().cuid(),
  message: z.string().trim().min(1).max(2000),
});
export const ChatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  citedFindingIds: z.array(z.string()).max(50).default([]),
});
export const ProjectChatMessageSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  role: z.enum(["USER", "ASSISTANT"]),
  content: z.string(),
  topic: z.enum(CHAT_TOPICS).nullable(),
  citedFindingIds: z.array(z.string()),
  jevConfidence: z.number().nullable(),
  createdAt: z.string(),
});
export type ProjectChatMessageView = z.infer<typeof ProjectChatMessageSchema>;
export type ProjectChatRequest = z.infer<typeof ProjectChatRequestSchema>;
export type ProjectChatTopic = (typeof CHAT_TOPICS)[number];
export type SSEChatMessageEvent = {
  type: "chat_message";
  message: ProjectChatMessageView;
};
export const PROJECT_CHAT_DECLINE =
  "I can only help with questions about this project — its design choices, research citations, SEO practices, or what it's built for. Ask me something about this project and I'll dig in.";
