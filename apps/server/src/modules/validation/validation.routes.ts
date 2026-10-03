import { Router } from "express";
import { z } from "zod";
import { prisma } from "@useframe/db";
import { authenticate } from "../../middleware/authenticate.js";
import type { AuthenticatedRequest } from "../../types/index.js";
const router: Router = Router();
router.use(authenticate);
router.post("/stream", async (req: AuthenticatedRequest, res, next) => {
  const input = z
    .object({
      pipeline: z.enum(["MAIN", "REPLICATE"]),
      slug: z.string().min(1).max(200),
    })
    .safeParse(req.body);
  if (!input.success) {
    res.status(422).json({ message: "Invalid validation subscription" });
    return;
  }
  try {
    const { pipeline, slug } = input.data;
    const owner =
      pipeline === "MAIN"
        ? await prisma.project.findFirst({
            where: { slug, userId: req.user!.id, deletedAt: null },
            select: { id: true },
          })
        : await prisma.replication.findFirst({
            where: { slug, userId: req.user!.id },
            select: { id: true },
          });
    if (!owner) {
      res.status(404).json({ message: "Project not found" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let closed = false;
    let last = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = setTimeout(() => res.end(), 15 * 60 * 1000);
    res.once("close", () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(expiry);
    });
    const poll = async () => {
      try {
        const project =
          pipeline === "MAIN"
            ? await prisma.project.findFirst({
                where: {
                  id: owner.id,
                  userId: req.user!.id,
                  deletedAt: null,
                  generationTier: "PAID",
                },
                select: { id: true },
              })
            : (
                await prisma.replication.findFirst({
                  where: { id: owner.id, userId: req.user!.id },
                  select: { project: { select: { id: true } } },
                })
              )?.project;
        const run = project
          ? await prisma.validationRun.findFirst({
              where: {
                projectId: project.id,
                pipeline,
                ...(pipeline === "MAIN" ? { isFreeTier: false } : {}),
              },
              orderBy: { startedAt: "desc" },
              select: {
                id: true,
                status: true,
                finalScore: true,
                startVersionId: true,
                iterationCount: true,
              },
            })
          : null;
        const versions = project
          ? await prisma.projectVersion.findMany({
              where: { projectId: project.id },
              orderBy: { versionNumber: "desc" },
              select: { id: true },
              take: 100,
            })
          : [];
        const data = JSON.stringify({
          type: "validation_status",
          run,
          versionIds: versions.map((v) => v.id),
        });
        if (!closed) {
          if (data !== last) {
            res.write(`event: validation_status\ndata: ${data}\n\n`);
            last = data;
          } else res.write(": keep-alive\n\n");
        }
      } catch (error) {
        console.error("[validation] subscription failed", error);
        res.end();
      } finally {
        if (!closed && !res.writableEnded)
          timer = setTimeout(() => {
            void poll();
          }, 4000);
      }
    };
    void poll();
  } catch (error) {
    next(error);
  }
});
export default router;
