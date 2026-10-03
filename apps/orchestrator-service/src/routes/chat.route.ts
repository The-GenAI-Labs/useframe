import { Router } from "express";
import { prisma } from "@useframe/db";
import { ProjectChatRequestSchema, PROJECT_CHAT_DECLINE } from "@repo/schemas";
import { verifyToken } from "../lib/auth.js";
import { runProjectChat } from "../agents/chat.agent.js";
import { initSSE, sseWrite, sseError } from "../llm/stream.js";
const router: Router = Router();
router.post("/chat", async (req, res, next) => {
  let user;
  try {
    user = verifyToken(req);
  } catch {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  // The old global chat client receives a zero-model response until it has project context.
  if (!req.body?.projectId) {
    res.json({
      success: true,
      data: {
        reply: "Open a project to ask a question. " + PROJECT_CHAT_DECLINE,
      },
    });
    return;
  }
  const parsed = ProjectChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(422)
      .json({ success: false, message: "Invalid project chat message" });
    return;
  }
  try {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    initSSE(res);
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(90000),
    ]);
    const close = () => controller.abort();
    res.once("close", close);
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": heartbeat\n\n");
    }, 15000);
    try {
      const message = await runProjectChat(
        parsed.data,
        user.id,
        signal,
        (delta) => sseWrite(res, { type: "token", delta }),
      );
      sseWrite(res, { type: "chat_message", message });
    } catch {
      if (!controller.signal.aborted)
        sseError(
          res,
          "Could not answer this project question. Please try again.",
        );
    } finally {
      clearInterval(heartbeat);
      res.off("close", close);
      res.end();
    }
  } catch (error) {
    next(error);
  }
});
export default router;
