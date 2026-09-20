import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { chromium } from "playwright"
import getPort from "get-port"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { SeoAuditJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { env } from "../config/env.js"
import { crawlSite } from "../lib/crawler.js"
import { computeKeywordDensity } from "../lib/keywordDensity.js"
import { discoverUrls } from "../lib/discovery.js"
import { extractPaidTierData, type PaidTierPageData } from "../lib/paidTierExtract.js"
import { computeSeoScore } from "../scoring/seoScore.js"
import { runSeoAnalysis } from "../agents/seoAnalysis.agent.js"
import { seoCacheKey, SEO_CACHE_TTL_SECONDS } from "../lib/seoCache.js"

const JOB_TIMEOUT_MS = 5 * 60 * 1000

async function runSeoAuditJob(
  job: Job<SeoAuditJobPayload>,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  cdpPort: number
): Promise<void> {
  const { seoAuditId, url, tier } = job.data
  const origin = new URL(url).origin
  const domain = new URL(url).hostname

  await prisma.seoAuditResult.update({
    where: { id: seoAuditId },
    data: { status: "CRAWLING" },
  })

  try {
    const page = await browser.newPage()

    const discovery = await discoverUrls(url, env.SEO_AUDIT_MAX_PAGES)
    const crawlResults = await crawlSite(
      page,
      url,
      env.SEO_AUDIT_MAX_PAGES,
      discovery.urls.length > 0 ? discovery.urls : undefined
    )

    await prisma.seoAuditResult.update({
      where: { id: seoAuditId },
      data: {
        status: "AUDITING",
        pagesCrawled: crawlResults.length,
        crawlResults: {
          pages: crawlResults.map((p) => ({
            url: p.url,
            title: p.title,
            metaDescription: p.metaDescription,
            h1s: p.h1s,
            wordCount: p.wordCount,
            statusCode: p.statusCode,
          })),
          discoverySource: discovery.source,
        },
      },
    })

    let paidTierData: PaidTierPageData[] | undefined
    if (tier === "paid") {
      paidTierData = []
      for (const crawled of crawlResults) {
        try {
          await page.goto(crawled.url, { waitUntil: "networkidle", timeout: 15_000 })
          const extracted = await extractPaidTierData(page, crawled.url, origin)
          paidTierData.push(extracted)
        } catch {
          continue
        }
      }
    }

    const { default: lighthouse } = await import("lighthouse")
    const runnerResult = await lighthouse(url, {
      port: cdpPort,
      output: "json",
      onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
      logLevel: "error",
    })

    const categories = runnerResult?.lhr?.categories
    const lighthouseAudits = runnerResult?.lhr?.audits
    const scoreOf = (key: string) => {
      const raw = categories?.[key]?.score
      return typeof raw === "number" ? Math.round(raw * 100) : null
    }

    const lighthouseSeoScore = scoreOf("seo") ?? 0
    const keywords = computeKeywordDensity(crawlResults)

    const auditJson = {
      lighthouseCategories: categories,
      lighthouseSeoAudits: lighthouseAudits,
      paidTierData: paidTierData ?? null,
    }

    const computedScore = computeSeoScore({
      lighthouseSeoScore,
      paidTierData,
    })

    let llmSummary: unknown = null
    try {
      llmSummary = await runSeoAnalysis({
        domain,
        tier,
        computedScore,
        lighthouseSeoAudits: lighthouseAudits,
        paidTierData,
      })
    } catch (llmErr) {
      console.error(
        `[seoAudit] LLM analysis failed seoAuditId=${seoAuditId}:`,
        llmErr instanceof Error ? llmErr.message : String(llmErr)
      )
    }

    const expiresAt = new Date(Date.now() + SEO_CACHE_TTL_SECONDS * 1000)

    await prisma.seoAuditResult.update({
      where: { id: seoAuditId },
      data: {
        status: "DONE",
        domain,
        performanceScore: scoreOf("performance"),
        accessibilityScore: scoreOf("accessibility"),
        seoScore: lighthouseSeoScore,
        bestPracticesScore: scoreOf("best-practices"),
        keywords: { topKeywords: keywords },
        auditJson,
        computedScore,
        llmSummary: llmSummary as object | undefined,
        expiresAt,
      },
    })

    await redis.set(seoCacheKey(domain, tier), seoAuditId, "EX", SEO_CACHE_TTL_SECONDS)

    console.log(`[seoAudit] Completed seoAuditId=${seoAuditId}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[seoAudit] Failed seoAuditId=${seoAuditId}:`, reason)

    await prisma.seoAuditResult.update({
      where: { id: seoAuditId },
      data: { status: "FAILED", failureReason: reason },
    })

    throw err
  }
}

async function processSeoAudit(job: Job<SeoAuditJobPayload>): Promise<void> {
  const cdpPort = await getPort()
  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${cdpPort}`],
  })

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true
      reject(new Error(`SEO audit job timed out after ${JOB_TIMEOUT_MS}ms`))
    }, JOB_TIMEOUT_MS)
  })

  try {
    await Promise.race([runSeoAuditJob(job, browser, cdpPort), timeout])
  } catch (err) {
    if (timedOut) {
      await browser.close().catch(() => {})
      await prisma.seoAuditResult.update({
        where: { id: job.data.seoAuditId },
        data: { status: "FAILED", failureReason: "Job timed out" },
      })
    }
    throw err
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    if (!timedOut) await browser.close().catch(() => {})
  }
}

export function startSeoAuditWorker(): Worker<SeoAuditJobPayload> {
  const worker = new Worker<SeoAuditJobPayload>(QUEUES.SEO_AUDIT, processSeoAudit, {
    connection: redis,
    concurrency: env.SEO_AUDIT_CONCURRENCY,
  })

  worker.on("completed", (job) => {
    console.log(`[seoAudit] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[seoAudit] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
