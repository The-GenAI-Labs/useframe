import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ReplicateMessagesService } from "./replicateMessages.service.js"
import type { ReplicateMessageInput } from "./replicateMessages.schema.js"

export const ReplicateMessagesController = {
  send: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ReplicateMessagesService.sendMessage(
        req.user!,
        req.params.slug as string,
        req.body as ReplicateMessageInput
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
