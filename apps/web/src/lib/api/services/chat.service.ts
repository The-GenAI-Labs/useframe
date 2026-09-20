import { api } from "../axios"

export type SendChatMessageResponse = {
  message: {
    id: string
    role: string
    content: string
  }
  conversationId: string
  error: boolean
}

export const chatApi = {
  sendMessage: async (input: { conversationId?: string; content: string }) => {
    const { data } = await api.post<{
      success: true
      data: SendChatMessageResponse
    }>("/chat/messages", input)
    return data.data
  },
}
