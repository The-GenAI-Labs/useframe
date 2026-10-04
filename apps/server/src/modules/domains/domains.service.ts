import { prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"
import { redis } from "@/lib/redis.js"
import * as deployService from "@/lib/deployService.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import { DEPLOY_CREDIT_COST } from "@/modules/deploy/deploy.service.js"

const CHECK_COOLDOWN_SECONDS = 10

async function loadProject(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    select: { id: true, pipelineState: { select: { currentStep: true } } },
  })
  if (!project) throw new AppError("Project not found", 404)
  return project
}

export const DomainsService = {
  async get(userId: string, slug: string) {
    const project = await loadProject(userId, slug)
    return deployService.getProjectDomain(project.id)
  },

  // Same entitlement as deploying: the DEPLOY step is reached and the balance covers a deploy.
  async add(userId: string, slug: string, hostname: string) {
    const project = await loadProject(userId, slug)
    if (project.pipelineState?.currentStep !== "DEPLOY") {
      throw new AppError("Finish the earlier steps before connecting a domain.", 409, "deploy_step_locked")
    }
    if (!(await CreditsService.hasSufficientBalance(userId, DEPLOY_CREDIT_COST))) {
      throw new AppError("Connecting a domain needs the same plan as deploying.", 402, "insufficient_credits")
    }
    return deployService.addProjectDomain(project.id, hostname)
  },

  async check(userId: string, slug: string, domainId: string) {
    const project = await loadProject(userId, slug)
    const allowed = await redis.set(
      `ratelimit:domain-check:${domainId}`,
      "1",
      "EX",
      CHECK_COOLDOWN_SECONDS,
      "NX"
    )
    if (allowed !== "OK") {
      throw new AppError("Please wait a few seconds before checking again.", 429, "check_cooldown")
    }
    return deployService.checkProjectDomain(project.id, domainId)
  },

  async retry(userId: string, slug: string, domainId: string) {
    const project = await loadProject(userId, slug)
    return deployService.retryProjectDomain(project.id, domainId)
  },

  async remove(userId: string, slug: string, domainId: string) {
    const project = await loadProject(userId, slug)
    return deployService.removeProjectDomain(project.id, domainId)
  },
}
