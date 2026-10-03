import {
  ProjectChatMessageSchema,
  type ProjectResearchView,
} from "@repo/schemas";
import { api } from "../axios";

export type SendChatMessageResponse = {
  message: {
    id: string;
    role: string;
    content: string;
  };
  conversationId: string;
  error: boolean;
};

export const chatApi = {
  history: async (projectId: string, before?: string) => {
    const { data } = await api.get<{
      data: { messages: unknown[]; nextCursor: string | null };
    }>(`/chat/projects/${projectId}/messages`, { params: { before } });
    return {
      messages: data.data.messages.map((row) =>
        ProjectChatMessageSchema.parse(row),
      ),
      nextCursor: data.data.nextCursor,
    };
  },
  research: async (projectId: string) => {
    const { data } = await api.get<{ data: ProjectResearchView | null }>(
      `/projects/${projectId}/research/citations`,
    );
    return data.data;
  },
  sendMessage: async (input: { conversationId?: string; content: string }) => {
    const { data } = await api.post<{
      success: true;
      data: SendChatMessageResponse;
    }>("/chat/messages", input);
    return data.data;
  },
};
