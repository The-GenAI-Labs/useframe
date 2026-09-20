import { prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { SeoAuditJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"
import { seoCacheKey } from "@/lib/seoCache.js"

const seoAuditQueue = new Queue(QUEUES.SEO_AUDIT, { connection: redis })

function serializeAudit(audit: {
  id: string
  url: string
  domain: string | null
  tier: string
  status: string
  performanceScore: number | null
  accessibilityScore: number | null
  seoScore: number | null
  bestPracticesScore: number | null
  pagesCrawled: number | null
  crawlResults: unknown
  keywords: unknown
  auditJson: unknown
  computedScore: number | null
  llmSummary: unknown
  failureReason: string | null
}) {
  return {
    id: audit.id,
    url: audit.url,
    domain: audit.domain,
    tier: audit.tier,
    status: audit.status,
    performanceScore: audit.performanceScore,
    accessibilityScore: audit.accessibilityScore,
    seoScore: audit.seoScore,
    bestPracticesScore: audit.bestPracticesScore,
    pagesCrawled: audit.pagesCrawled,
    crawlResults: audit.crawlResults,
    keywords: audit.keywords,
    auditJson: audit.auditJson,
    computedScore: audit.computedScore,
    llmSummary: audit.llmSummary,
    failureReason: audit.failureReason,
  }
}

export const SeoService = {
  async create(userId: string, url: string, tier: "free" | "paid") {
    const domain = new URL(url).hostname

    const cachedId = await redis.get(seoCacheKey(domain, tier))
    if (cachedId) {
      const cached = await prisma.seoAuditResult.findUnique({ where: { id: cachedId } })
      if (cached && cached.status === "DONE") {
        const copy = await prisma.seoAuditResult.create({
          data: {
            userId,
            url,
            domain,
            tier,
            status: "DONE",
            performanceScore: cached.performanceScore,
            accessibilityScore: cached.accessibilityScore,
            seoScore: cached.seoScore,
            bestPracticesScore: cached.bestPracticesScore,
            pagesCrawled: cached.pagesCrawled,
            crawlResults: cached.crawlResults as object | undefined,
            keywords: cached.keywords as object | undefined,
            auditJson: cached.auditJson as object | undefined,
            computedScore: cached.computedScore,
            llmSummary: cached.llmSummary as object | undefined,
            expiresAt: cached.expiresAt,
          },
        })

        return { seoAuditId: copy.id, cached: true }
      }
    }

    const audit = await prisma.seoAuditResult.create({
      data: { userId, url, domain, tier, status: "PENDING" },
    })

    const payload: SeoAuditJobPayload = { seoAuditId: audit.id, url, tier }

    await seoAuditQueue.add("seoAudit", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    })

    return { seoAuditId: audit.id, cached: false }
  },

  async get(userId: string, id: string) {
    const audit = await prisma.seoAuditResult.findFirst({
      where: { id, userId },
    })

    if (!audit) {
      throw new AppError("SEO audit not found", 404)
    }

    return serializeAudit(audit)
  },
}
