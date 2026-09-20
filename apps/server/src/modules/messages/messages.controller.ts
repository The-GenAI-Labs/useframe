import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { MessagesService } from "./messages.service.js"
import type { SendMessageInput } from "./messages.schema.js"

export const MessagesController = {
  send: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await MessagesService.sendMessage(
        req.user!,
        req.params.slug!,
        req.body as SendMessageInput
      )
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
