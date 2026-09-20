import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ChatService } from "./chat.service.js"
import type { SendChatMessageInput } from "./chat.schema.js"

export const ChatController = {
  send: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ChatService.sendMessage(
        req.user!,
        req.body as SendChatMessageInput
      )
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
