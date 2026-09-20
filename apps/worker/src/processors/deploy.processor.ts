import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { DeployJobPayload } from "@repo/events"
import type { SiteSpec } from "@repo/schemas"
import { redis } from "../lib/redis.js"
import { env } from "../config/env.js"
import { buildStaticSite } from "../lib/staticSiteBuilder.js"
import { createVercelDeployment, getVercelDeployment } from "../lib/vercel.js"

const JOB_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function processDeploy(job: Job<DeployJobPayload>): Promise<void> {
  const { deploymentId, projectId, versionId } = job.data
  const startedAt = Date.now()

  try {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    const version = await prisma.projectVersion.findUniqueOrThrow({ where: { id: versionId } })

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "BUILDING" },
    })

    const spec = version.snapshot as unknown as SiteSpec
    const seoMeta = (version.seo ?? {}) as { robotsTxt?: string; sitemapXml?: string }

    const projectName = `${env.VERCEL_PROJECT_NAME_PREFIX}-${project.slug}`.slice(0, 100)

    const builtFiles = await buildStaticSite(spec, {
      robotsTxt: seoMeta.robotsTxt,
      sitemapXml: seoMeta.sitemapXml,
    })

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "UPLOADING" },
    })

    const created = await createVercelDeployment(projectName, builtFiles)

    let deployment = created
    while (
      deployment.readyState !== "READY" &&
      deployment.readyState !== "ERROR" &&
      Date.now() - startedAt < JOB_TIMEOUT_MS
    ) {
      await sleep(POLL_INTERVAL_MS)
      deployment = await getVercelDeployment(created.id)
    }

    if (deployment.readyState !== "READY") {
      throw new Error(`Vercel deployment did not become ready (state: ${deployment.readyState})`)
    }

    const liveUrl = deployment.url.startsWith("http") ? deployment.url : `https://${deployment.url}`

    await prisma.$transaction([
      prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "LIVE",
          liveUrl,
          deployedAt: new Date(),
          buildDurationMs: Date.now() - startedAt,
        },
      }),
      prisma.pipelineState.update({
        where: { projectId },
        data: { deployStatus: "AWAITING_APPROVAL" },
      }),
      // userEdits is populated from /iterate (messages.service.ts) and score
      // from score.processor.ts once a scan targets this liveUrl — both are
      // wired elsewhere; this write only ever needs to flip `deployed`.
      prisma.generationOutcome.updateMany({
        where: { versionId },
        data: { deployed: true },
      }),
    ])

    // Captured once per project — custom domains (added later, if the user
    // adds one) need this to call Vercel's per-project domains API.
    if (!project.vercelProjectId && deployment.vercelProjectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { vercelProjectId: deployment.vercelProjectId },
      })
    }

    console.log(`[deploy] Completed deploymentId=${deploymentId} url=${liveUrl}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[deploy] Failed deploymentId=${deploymentId}:`, reason)

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "FAILED", failedAt: new Date(), failureReason: reason },
    })

    throw err
  }
}

export function startDeployWorker(): Worker<DeployJobPayload> {
  const worker = new Worker<DeployJobPayload>(QUEUES.DEPLOY, processDeploy, {
    connection: redis,
    concurrency: 2,
  })

  worker.on("completed", (job) => {
    console.log(`[deploy] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[deploy] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
