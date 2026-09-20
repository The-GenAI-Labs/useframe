import { prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"

export const PipelineService = {
  async get(userId: string, slug: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      include: { pipelineState: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    return { pipelineState: project.pipelineState ?? null }
  },

  async setMode(userId: string, slug: string, mode: "AUTO" | "MANUAL") {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      include: { pipelineState: true },
    })
    if (!project) throw new AppError("Project not found", 404)
    if (!project.pipelineState) throw new AppError("Pipeline not initialized for this project", 409)

    const updated = await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: { mode },
    })

    return { pipelineState: updated }
  },
}
