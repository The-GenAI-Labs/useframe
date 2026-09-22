import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { ResearchPdfJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import {
  renderResearchPdf,
  type Citation,
  type ResearchDocumentType,
} from "../pdf/renderResearchPdf.js"

const TITLES: Record<ResearchDocumentType, string> = {
  RESEARCH_RATIONALE: "Research Rationale",
  COMPETITOR_ANALYSIS: "Competitor Analysis",
}

type Attachment = {
  type: "pdf"
  documentId: string
  title: string
  url: string
}

async function buildRationale(projectId: string, projectName: string) {
  const report = await prisma.researchReport.findUnique({ where: { projectId } })
  if (!report) return null

  return {
    projectName,
    summary: report.summary,
    primaryColor: report.primaryColor,
    secondaryColor: report.secondaryColor,
    accentColor: report.accentColor,
    colorRationale: report.colorRationale,
    fontPrimary: report.fontPrimary,
    fontSecondary: report.fontSecondary,
    typographyRationale: report.typographyRationale,
    layoutStyle: report.layoutStyle,
    layoutRationale: report.layoutRationale,
    imageStyle: report.imageStyle,
    imageRationale: report.imageRationale,
    citations: Array.isArray(report.citations) ? (report.citations as Citation[]) : [],
  }
}

async function buildCompetitorAnalysis(projectId: string, projectName: string) {
  const scans = await prisma.competitorScan.findMany({
    where: { projectId, status: "DONE" },
    select: { sourceUrl: true, videoAnalysis: true, extractedContent: true },
    orderBy: { createdAt: "asc" },
  })

  if (scans.length === 0) return null

  return {
    projectName,
    competitors: scans.map((s: {
      sourceUrl: string
      videoAnalysis: unknown
      extractedContent: unknown
    }) => ({
      sourceUrl: s.sourceUrl,
      videoAnalysis: s.videoAnalysis as Record<string, unknown> | null,
      extractedContent: s.extractedContent as Record<string, unknown> | null,
    })),
  }
}

async function processResearchPdf(job: Job<ResearchPdfJobPayload>): Promise<void> {
  const { projectId, sections, conversationId } = job.data

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  if (!project) throw new Error(`Project ${projectId} not found`)

  const attachments: Attachment[] = []

  for (const type of sections) {
    const data =
      type === "RESEARCH_RATIONALE"
        ? await buildRationale(projectId, project.name)
        : await buildCompetitorAnalysis(projectId, project.name)

    // Nothing to report on (no research report yet, or no completed scans) —
    // skip that section rather than emitting an empty PDF.
    if (!data) {
      console.warn(`[researchPdf] Skipping ${type} for project=${projectId} — no source data`)
      continue
    }

    const pdf = await renderResearchPdf(type, data)

    const doc = await prisma.researchDocument.create({
      data: { projectId, type, title: TITLES[type], pdf },
      select: { id: true },
    })

    attachments.push({
      type: "pdf",
      documentId: doc.id,
      title: TITLES[type],
      url: `/api/research-documents/${doc.id}`,
    })
  }

  if (attachments.length === 0) {
    console.warn(`[researchPdf] No documents generated for project=${projectId}`)
    return
  }

  await prisma.message.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content:
        attachments.length === 1
          ? `Here's your ${attachments[0]!.title} report.`
          : `Here are your research reports: ${attachments.map((a) => a.title).join(", ")}.`,
      attachments: attachments as unknown as object,
    },
  })

  console.log(`[researchPdf] Generated ${attachments.length} document(s) for project=${projectId}`)
}

export function startResearchPdfWorker(): Worker<ResearchPdfJobPayload> {
  const worker = new Worker<ResearchPdfJobPayload>(QUEUES.RESEARCH_PDF, processResearchPdf, {
    connection: redis,
    // PDF rendering launches a browser per job — keep it to one at a time so
    // it can't starve the scan/score workers of memory.
    concurrency: 1,
  })

  worker.on("failed", (job, err) => {
    console.error(`[researchPdf] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
