import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { chromium } from "playwright"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"

async function processScan(job: Job<ScanJobPayload>): Promise<void> {
  const { scanId, projectId, sourceUrl } = job.data

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
