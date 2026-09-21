import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { chromium } from "playwright"
import { prisma, resolveContext, getCachedScan, cacheScan } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { extractFrames, isFfmpegAvailable } from "../scraper/extractFrames.js"
import {
  analyzeFramesForPatterns,
  isVisionAnalysisAvailable,
} from "../analysis/analyzeFramesForPatterns.js"

// Records a scroll-through of the page so motion/animation patterns are
// captured, not just a frozen layout. Returns the video file path, or null
// if recording produced nothing.
async function recordCompetitorVideo(url: string, videoDir: string): Promise<string | null> {
  fs.mkdirSync(videoDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
    await page.waitForTimeout(1000) // let initial-load animations settle into frame

    // Scroll slowly so scroll-triggered animations are actually captured.
    await page.evaluate(async () => {
      const distance = 300
      const delay = 400
      let total = 0
      while (total < document.body.scrollHeight) {
        window.scrollBy(0, distance)
        total += distance
        await new Promise((r) => setTimeout(r, delay))
      }
    })
    await page.waitForTimeout(1500)

    const video = page.video()
    // The file is only finalized on context.close(), so resolve the path
    // first, then close, then read.
    const videoPath = video ? await video.path() : null
    await context.close()
    return videoPath
  } finally {
    await browser.close().catch(() => {})
  }
}

// Video recording + frame extraction + vision analysis for the top-ranked
// competitor only. Entirely best-effort: any failure here is logged and
// swallowed, because the ordinary screenshot scan has already succeeded by
// this point and must not be failed by an enrichment step.
async function runVideoAnalysis(scanId: string, sourceUrl: string): Promise<void> {
  if (!isFfmpegAvailable() || !isVisionAnalysisAvailable()) return

  const videoDir = path.join(os.tmpdir(), "scan-videos", crypto.randomUUID())

  try {
    const videoPath = await recordCompetitorVideo(sourceUrl, videoDir)
    if (!videoPath) return

    const frames = extractFrames(videoPath)
    if (frames.length === 0) return

    const analysis = await analyzeFramesForPatterns(frames, sourceUrl)

    await prisma.competitorScan.update({
      where: { id: scanId },
      data: { videoAnalysis: analysis },
    })

    console.log(`[scan] Video analysis complete scanId=${scanId} (${frames.length} frames)`)
  } catch (err) {
    console.warn(
      `[scan] Video analysis failed scanId=${scanId} (continuing without it):`,
      err instanceof Error ? err.message : err,
    )
  } finally {
    // Only the analysis is kept — the raw video and extracted frames are
    // discarded, never stored long-term.
    fs.rmSync(videoDir, { recursive: true, force: true })
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

    await browser.close()

    // Top-ranked competitor only — that single-scan limit is the cost control
    // for this whole path. Runs BEFORE the DONE write on purpose: callers poll
    // for status === "DONE" (waitForScans), so writing videoAnalysis after it
    // would let the planner read the row before the analysis landed. It's
    // fully guarded internally and can only log-and-continue, so it cannot
    // fail the scan it precedes.
    if (job.data.scanType === "COMPETITOR" && job.data.rank === 0) {
      await runVideoAnalysis(scanId, sourceUrl)
    }

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
