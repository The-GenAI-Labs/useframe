import { Worker, Queue } from "bullmq"
import type { Job } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { DomainVerifyJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { getVercelDomainStatus } from "../lib/vercel.js"

const domainVerifyQueue = new Queue<DomainVerifyJobPayload>(QUEUES.DOMAIN_VERIFY, { connection: redis })

function schedulerId(customDomainId: string): string {
  return `domain-verify-${customDomainId}`
}

// A repeatable job scheduler (created via upsertJobScheduler by
// domains.service.ts on POST /domains) — each invocation here is one poll.
// It removes its own scheduler once the domain reaches a terminal state so
// it doesn't poll forever.
async function processDomainVerify(job: Job<DomainVerifyJobPayload>): Promise<void> {
  const { customDomainId, domain, projectId } = job.data

  const customDomain = await prisma.customDomain.findUnique({ where: { id: customDomainId } })
  if (!customDomain || customDomain.deletedAt) {
    await domainVerifyQueue.removeJobScheduler(schedulerId(customDomainId))
    return
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { vercelProjectId: true },
  })
  if (!project?.vercelProjectId) {
    await domainVerifyQueue.removeJobScheduler(schedulerId(customDomainId))
    return
  }

  try {
    const status = await getVercelDomainStatus(project.vercelProjectId, domain)

    if (status.verified) {
      await prisma.customDomain.update({
        where: { id: customDomainId },
        data: {
          status: "ACTIVE",
          verifiedAt: new Date(),
          lastCheckedAt: new Date(),
          sslStatus: status.sslStatus,
          sslIssuedAt: status.sslStatus ? new Date() : undefined,
        },
      })
      console.log(`[domainVerify] ${domain} is now ACTIVE`)
      await domainVerifyQueue.removeJobScheduler(schedulerId(customDomainId))
      return
    }

    await prisma.customDomain.update({
      where: { id: customDomainId },
      data: { status: "VERIFYING", lastCheckedAt: new Date() },
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[domainVerify] Failed checking ${domain}:`, reason)
    await prisma.customDomain.update({
      where: { id: customDomainId },
      data: { lastCheckedAt: new Date(), failureReason: reason },
    })
  }
}

export function startDomainVerifyWorker(): Worker<DomainVerifyJobPayload> {
  const worker = new Worker<DomainVerifyJobPayload>(QUEUES.DOMAIN_VERIFY, processDomainVerify, {
    connection: redis,
    concurrency: 5,
  })

  worker.on("completed", (job) => {
    console.log(`[domainVerify] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[domainVerify] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
