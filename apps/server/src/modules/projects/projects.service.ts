import { prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { uniqueSlug } from "@/lib/slug.js"
import { AppError } from "@/middleware/errorHandler.js"
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema.js"

const scanQueue = new Queue(QUEUES.SCAN, { connection: redis })

export const ProjectsService = {
  async createProject(userId: string, input: CreateProjectInput) {
    const slug = uniqueSlug(input.name)

    const project = await prisma.project.create({
      data: {
        userId,
        name: input.name,
        slug,
        startupIdea: input.startupIdea,
        niche: input.niche,
        targetAudience: input.targetAudience,
        inputType: input.inputType,
        sourceUrl: input.sourceUrl,
        status: "DRAFT",
      },
    })

    const version = await prisma.projectVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        snapshot: {},
        siteType: input.siteType ?? "SINGLE_PAGE",
      },
    })

    await prisma.project.update({
      where: { id: project.id },
      data: { currentVersionId: version.id },
    })

    let scanQueued = false

    if (
      input.inputType === "FROM_COMPETITOR" ||
      input.inputType === "FROM_OWN_SITE"
    ) {
      const scan = await prisma.competitorScan.create({
        data: {
          userId,
          projectId: project.id,
          sourceUrl: input.sourceUrl!,
          scanType:
            input.inputType === "FROM_COMPETITOR" ? "COMPETITOR" : "OWN_SITE",
          status: "QUEUED",
        },
      })

      await prisma.project.update({
        where: { id: project.id },
        data: { status: "GENERATING" },
      })

      const payload: ScanJobPayload = {
        scanId: scan.id,
        userId,
        projectId: project.id,
        sourceUrl: input.sourceUrl!,
        scanType:
          input.inputType === "FROM_COMPETITOR" ? "COMPETITOR" : "OWN_SITE",
      }

      await scanQueue.add("scan", payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      })

      scanQueued = true
    }

    return {
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        status: scanQueued ? "GENERATING" : project.status,
        inputType: project.inputType,
      },
      version: { id: version.id, versionNumber: version.versionNumber },
      scanQueued,
    }
  },

  async listProjects(userId: string, pinned?: boolean) {
    const where: Record<string, unknown> = {
      userId,
      deletedAt: null,
    }
    if (pinned !== undefined) where.pinned = pinned

    return prisma.project.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        pinned: true,
        niche: true,
        inputType: true,
        startupIdea: true,
        targetAudience: true,
        sourceUrl: true,
        currentVersionId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  },

  async getProjectBySlug(userId: string, slug: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            siteType: true,
            snapshot: true,
            createdAt: true,
          },
        },
        competitorScans: {
          where: { status: { in: ["QUEUED", "RENDERING", "EXTRACTING", "ANALYZING", "DONE"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            designTokens: true,
            extractedContent: true,
          },
        },
      },
    })

    if (!project) throw new AppError("Project not found", 404)
    return project
  },

  async updateProject(
    userId: string,
    slug: string,
    input: UpdateProjectInput
  ) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
    })
    if (!project) throw new AppError("Project not found", 404)

    return prisma.project.update({
      where: { id: project.id },
      data: input,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        pinned: true,
        updatedAt: true,
      },
    })
  },

  async listVersions(userId: string, slug: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    return prisma.projectVersion.findMany({
      where: { projectId: project.id },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        label: true,
        siteType: true,
        createdAt: true,
      },
    })
  },

  async getVersion(userId: string, slug: string, versionId: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    const version = await prisma.projectVersion.findFirst({
      where: { id: versionId, projectId: project.id },
    })
    if (!version) throw new AppError("Version not found", 404)
    return version
  },
}
