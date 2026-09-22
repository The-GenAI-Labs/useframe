import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { chromium } from "playwright"
import { prisma, resolveContext, cacheAnalysis } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { ScoreJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { callAnalyze } from "../lib/scoringService.js"
import { measurePerformance } from "../scraper/measurePerformance.js"

const CURRENT_SCORER_VERSION = "v2"

async function processScore(job: Job<ScoreJobPayload>): Promise<void> {
  const { scoreId, url } = job.data

  await prisma.scoreResult.update({
    where: { id: scoreId },
    data: { status: "SCANNING" },
  })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30_000,
    })

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })

    await page.waitForTimeout(1500)

    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true })
    const screenshotBase64 = screenshotBuffer.toString("base64")

    const designTokens = await page.evaluate(() => {
      const getTokens = (selector: string) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const style = window.getComputedStyle(el)
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        }
      }
      return {
        body: getTokens("body"),
        h1: getTokens("h1"),
        h2: getTokens("h2"),
        p: getTokens("p"),
        btn: getTokens("button, .btn, [class*='btn']"),
      }
    })

    const extractedContent = await page.evaluate(() => {
      const title = document.title
      const metaDescription =
        document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null
      const ogTitle =
        document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null
      const ogDescription =
        document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? null
      const ogImage =
        document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null
      const h1Count = document.querySelectorAll("h1").length
      const headings = Array.from(document.querySelectorAll("h1, h2")).map(
        (el) => el.textContent?.trim() ?? ""
      )
      const ctas = Array.from(
        document.querySelectorAll("button, a[class*='btn'], a[class*='cta']")
      )
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean)
        .slice(0, 10)
      const bodyText = document.body.innerText.slice(0, 3000)

      return { title, metaDescription, ogTitle, ogDescription, ogImage, h1Count, headings, ctas, bodyText }
    })

    // Measured from the page we already have open — no second load, and real
    // navigation timing rather than an LLM's impression of "feels slow".
    const performanceMetrics = await measurePerformance(page)

    await browser.close()

    await prisma.scoreResult.update({
      where: { id: scoreId },
      data: { status: "ANALYZING" },
    })

    const { report } = await callAnalyze({
      scoreId,
      url,
      screenshotBase64,
      extractedContent,
      designTokens,
      performanceMetrics: performanceMetrics ?? undefined,
    })

    await prisma.scoreResult.update({
      where: { id: scoreId },
      data: {
        status: "DONE",
        screenshotBase64,
        report: report as object,
      },
    })

    // Cache this analysis for future requests of the same normalized URL —
    // skipped (no-op) when the URL belongs to the requesting user's own
    // project (see resolveContext/cacheAnalysis in @useframe/db).
    const scoreResultForCache = await prisma.scoreResult.findUnique({
      where: { id: scoreId },
      select: { userId: true },
    })
    if (scoreResultForCache) {
      const cacheContext = await resolveContext(url, scoreResultForCache.userId)
      await cacheAnalysis(scoreId, url, "web_score", CURRENT_SCORER_VERSION, cacheContext)
    }

    // If this URL is a project's live deployment, feed the score back into
    // that project's GenerationOutcome — the highest-value signal for later
    // analysis of which design decisions actually score well. No-op for the
    // common case of scoring an arbitrary third-party URL via /web-score.
    const overallScore = (report as { overallScore?: number }).overallScore
    if (typeof overallScore === "number") {
      const deployment = await prisma.deployment.findFirst({
        where: { liveUrl: url },
        orderBy: { createdAt: "desc" },
        select: { projectId: true },
      })
      if (deployment) {
        const outcome = await prisma.generationOutcome.findFirst({
          where: { projectId: deployment.projectId },
          orderBy: { createdAt: "desc" },
        })
        if (outcome) {
          await prisma.generationOutcome.update({
            where: { id: outcome.id },
            data: { score: Math.round(overallScore) },
          })
        }
      }
    }

    console.log(`[score] Completed scoreId=${scoreId}`)
  } catch (err) {
    await browser.close().catch(() => {})

    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[score] Failed scoreId=${scoreId}:`, reason)

    await prisma.scoreResult.update({
      where: { id: scoreId },
      data: { status: "FAILED", failureReason: reason },
    })

    throw err
  }
}

export function startScoreWorker(): Worker<ScoreJobPayload> {
  const worker = new Worker<ScoreJobPayload>(QUEUES.SCORE, processScore, {
    connection: redis,
    concurrency: 2,
  })

  worker.on("completed", (job) => {
    console.log(`[score] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[score] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
