import { prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { DomainVerifyJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"
import { addVercelDomain } from "@/lib/vercel.js"

const domainVerifyQueue = new Queue<DomainVerifyJobPayload>(QUEUES.DOMAIN_VERIFY, { connection: redis })
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com"
const POLL_INTERVAL_MS = 30_000

async function loadProject(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { customDomain: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  return project
}

export const DomainsService = {
  async get(userId: string, slug: string) {
    const project = await loadProject(userId, slug)
    return { customDomain: project.customDomain }
  },

  async add(userId: string, slug: string, domain: string) {
    const project = await loadProject(userId, slug)

    if (!project.vercelProjectId) {
      throw new AppError("Deploy this project at least once before adding a custom domain", 409)
    }
    if (project.customDomain) {
      throw new AppError("This project already has a custom domain", 409)
    }

    await addVercelDomain(project.vercelProjectId, domain)

    const customDomain = await prisma.customDomain.create({
      data: {
        projectId: project.id,
        domain,
        status: "PENDING",
        cnameTarget: VERCEL_CNAME_TARGET,
      },
    })

    await domainVerifyQueue.upsertJobScheduler(
      `domain-verify-${customDomain.id}`,
      { every: POLL_INTERVAL_MS },
      { data: { customDomainId: customDomain.id, domain, projectId: project.id } }
    )

    return { customDomain }
  },
}
