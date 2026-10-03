import { z } from "zod";
import { AppError } from "@/middleware/errorHandler.js";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "@/types/index.js";
import { ChatService } from "./chat.service.js";
import type { SendChatMessageInput } from "./chat.schema.js";

export const ChatController = {
  history: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = z
        .object({
          projectId: z.string().cuid(),
          before: z.string().cuid().optional(),
        })
        .safeParse({
          projectId: req.params.projectId,
          before: req.query.before,
        });
      if (!input.success)
        throw new AppError("Invalid chat history request", 422);
      res.json({
        success: true,
        data: await ChatService.history(
          req.user!.id,
          input.data.projectId,
          input.data.before,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
  send: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await ChatService.sendMessage(
        req.user!,
        req.body as SendChatMessageInput,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
