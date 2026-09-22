import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { chromium } from "playwright"
import type { Page } from "playwright"
import { prisma, resolveContext, getCachedScan, cacheScan } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { captureTallSegments } from "../scraper/captureSegments.js"
import { captureMotionMoments } from "../scraper/captureMotionMoments.js"
import {
  analyzeFramesForPatterns,
  isVisionAnalysisAvailable,
} from "../analysis/analyzeFramesForPatterns.js"

// Design-pattern analysis for the top-ranked competitor only.
//
// Captures 2-3 tall native-resolution segments for static properties, plus
// targeted before/after pairs for motion — typically 3-6 images total, down
// from a flat 8 evenly-spaced video frames, with no video recording and no
// ffmpeg dependency. Reuses the page the scan already has open rather than
// launching a second browser.
//
// Entirely best-effort: any failure is logged and swallowed, because the
// ordinary screenshot scan must not be failed by an enrichment step.
async function runPatternAnalysis(page: Page, scanId: string, sourceUrl: string): Promise<void> {
  if (!isVisionAnalysisAvailable()) return

  try {
    const staticFrames = await captureTallSegments(page)
    const motionFrames = await captureMotionMoments(page)
    const allFrames = [...staticFrames, ...motionFrames]

    if (allFrames.length === 0) return

    const analysis = await analyzeFramesForPatterns(allFrames, sourceUrl)

    await prisma.competitorScan.update({
      where: { id: scanId },
      data: { videoAnalysis: analysis },
    })

    console.log(
      `[scan] Pattern analysis complete scanId=${scanId} ` +
        `(${staticFrames.length} static + ${motionFrames.length} motion frames)`,
    )
  } catch (err) {
    console.warn(
      `[scan] Pattern analysis failed scanId=${scanId} (continuing without it):`,
      err instanceof Error ? err.message : err,
    )
  }
}

async function processScan(job: Job<ScanJobPayload>): Promise<void> {
  const { scanId, userId, projectId, sourceUrl } = job.data

  // Cache-check-first: if a DONE, unexpired scan of this normalized URL
  // already exists (and this isn't the requesting user's own project),
  // reuse it instead of spending a Playwright run. Must run before the
  // first "RENDERING" status write below.
  const cacheContext = await resolveContext(sourceUrl, userId)
  const cachedScan = await getCachedScan(sourceUrl, cacheContext)
  if (cachedScan) {
    await prisma.competitorScan.update({
      where: { id: scanId },
      data: {
        status: "DONE",
        screenshotKey: cachedScan.screenshotKey,
        rawHtmlKey: cachedScan.rawHtmlKey,
        designTokens: cachedScan.designTokens ?? undefined,
        extractedContent: cachedScan.extractedContent ?? undefined,
      },
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "READY" },
    })

    console.log(`[scan] Cache hit scanId=${scanId} (reused scan ${cachedScan.id})`)
    return
  }

  await prisma.competitorScan.update({
    where: { id: scanId },
    data: { status: "RENDERING" },
  })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(sourceUrl, {
      waitUntil: "networkidle",
      timeout: 30_000,
    })

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })

    await page.waitForTimeout(1500)

    await prisma.competitorScan.update({
      where: { id: scanId },
      data: { status: "EXTRACTING" },
    })

    const rawHtml = await page.content()
    const cleanedHtml = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/src="data:[^"]+"/gi, 'src="[base64-removed]"')
      .slice(0, 50_000)

    await prisma.competitorScan.update({
      where: { id: scanId },
      data: { status: "ANALYZING" },
    })

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

      return { title, headings, ctas, bodyText }
    })

    // Top-ranked competitor only — that single-scan limit is the cost control
    // for this whole path. Runs while the page is still open (it captures
    // from this same page, avoiding a second load) and BEFORE the DONE write:
    // callers poll for status === "DONE" (waitForScans), so writing the
    // analysis afterwards would let the planner read the row before it
    // landed. It's fully guarded internally and can only log-and-continue, so
    // it cannot fail the scan it precedes.
    if (job.data.scanType === "COMPETITOR" && job.data.rank === 0) {
      await runPatternAnalysis(page, scanId, sourceUrl)
    }

    await browser.close()

    await prisma.competitorScan.update({
      where: { id: scanId },
      data: {
        status: "DONE",
        rawHtmlKey: `scans/${scanId}/raw.html`,
        designTokens,
        extractedContent: {
          ...extractedContent,
          rawHtml: cleanedHtml.slice(0, 5000),
        },
      },
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "READY" },
    })

    await cacheScan(scanId, sourceUrl, cacheContext)

    console.log(`[scan] Completed scanId=${scanId}`)
  } catch (err) {
    await browser.close().catch(() => {})

    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[scan] Failed scanId=${scanId}:`, reason)

    await prisma.competitorScan.update({
      where: { id: scanId },
      data: { status: "FAILED", failureReason: reason },
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "FAILED" },
    })

    throw err
  }
}

export function startScanWorker(): Worker<ScanJobPayload> {
  const worker = new Worker<ScanJobPayload>(QUEUES.SCAN, processScan, {
    connection: redis,
    concurrency: 2,
  })

  worker.on("completed", (job) => {
    console.log(`[scan] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[scan] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
