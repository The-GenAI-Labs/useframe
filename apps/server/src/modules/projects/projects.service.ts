import { prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { uniqueSlug } from "@/lib/slug.js"
import { AppError } from "@/middleware/errorHandler.js"
import { GenerateService } from "@/modules/generate/generate.service.js"
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema.js"

const scanQueue = new Queue(QUEUES.SCAN, { connection: redis })

export const ProjectsService = {
  async createProject(userId: string, input: CreateProjectInput) {
    const slug = uniqueSlug(input.name)
    const extracted = input.extracted

    // checked before the project row exists — an exhausted/uncredited user
    // must never end up with an orphaned DRAFT project
    const { tier } = await GenerateService.authorize(userId)

    const project = await prisma.project.create({
      data: {
        userId,
        name: input.name,
        slug,
        startupIdea: input.ideaText ?? input.startupIdea,
        niche: extracted?.niche ?? input.niche,
        targetAudience: extracted?.targetAudience ?? input.targetAudience,
        brandPersonality: extracted?.brandPersonality,
        pricePositioning: extracted?.pricePositioning,
        businessModel: extracted?.businessModel,
        differentiator: extracted?.differentiator,
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
      // generationTier is stamped here (not left to default) so the
      // workspace's model-tier banner can read it back reliably after a
      // reload rather than relying on this create response alone.
      data: { currentVersionId: version.id, generationTier: tier === "free" ? "FREE" : "PAID" },
    })

    await prisma.pipelineState.create({
      data: { projectId: project.id },
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
      tier,
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
        generationTier: true,
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
          select: {
            id: true,
            versionNumber: true,
            label: true,
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
        snapshot: true,
        createdAt: true,
      },
    })
  },

  async createVersion(userId: string, slug: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
    })
    if (!project) throw new AppError("Project not found", 404)

    const latest = await prisma.projectVersion.findFirst({
      where: { projectId: project.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, siteType: true },
    })

    const version = await prisma.projectVersion.create({
      data: {
        projectId: project.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        siteType: latest?.siteType ?? "SINGLE_PAGE",
        snapshot: {},
      },
    })

    await prisma.project.update({
      where: { id: project.id },
      data: { currentVersionId: version.id, status: "GENERATING" },
    })

    return { version: { id: version.id, versionNumber: version.versionNumber } }
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

  async getVersionSnapshot(userId: string, slug: string, versionId: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    const version = await prisma.projectVersion.findFirst({
      where: { id: versionId, projectId: project.id },
      select: { snapshot: true },
    })
    if (!version) throw new AppError("Version not found", 404)
    return { snapshot: version.snapshot }
  },

  async restoreVersion(userId: string, slug: string, versionId: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    const version = await prisma.projectVersion.findFirst({
      where: { id: versionId, projectId: project.id },
      select: { id: true },
    })
    if (!version) throw new AppError("Version not found", 404)

    await prisma.project.update({
      where: { id: project.id },
      data: { currentVersionId: version.id },
    })

    return { currentVersionId: version.id }
  },

  async getResearchReport(userId: string, slug: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    const report = await prisma.researchReport.findUnique({
      where: { projectId: project.id },
    })

    return { report: report ?? null }
  },
}
