"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useGenerationStore } from "@/stores/generationStore"
import { useGenerationStream } from "@/hooks/useGenerationStream"
import { useModelStore } from "@/stores/modelStore"
import { ModelSelector } from "./ModelSelector"
import { VersionSlider } from "./VersionSlider"

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

type ProjectShape = {
  id: string
  slug: string
  name: string
  status: string
  inputType: string
  niche: string
  startupIdea: string
  targetAudience: string
  sourceUrl?: string | null
  versions: {
    id: string
    versionNumber: number
    label: string | null
    siteType: string
    snapshot: unknown
    createdAt: string
  }[]
  competitorScans: {
    id: string
    status: string
    designTokens: Record<string, unknown> | null
    extractedContent: Record<string, unknown> | null
  }[]
}

type Props = {
  project: ProjectShape
}

function hasSnapshot(snapshot: unknown): boolean {
  return !!snapshot && typeof snapshot === "object" && Array.isArray((snapshot as { pages?: unknown }).pages)
}

export function WorkspaceShell({ project }: Props) {
  const searchParams = useSearchParams()
  const isScanning = searchParams.get("status") === "scanning"
  const arrivedGenerating = searchParams.get("status") === "generating"
  const { startGeneration } = useGenerationStream()
  const { isStreaming, siteSpec } = useGenerationStore()
  const { selectedModelId } = useModelStore()
  const [generationStarted, setGenerationStarted] = useState(false)
  const [streamVersionId, setStreamVersionId] = useState<string | null>(
    arrivedGenerating ? (project.versions[0]?.id ?? null) : null,
  )
  const generatingVersionId = streamVersionId && isStreaming ? streamVersionId : null

  const latestVersion = project.versions[0]
  const latestScan = project.competitorScans[0]
  const needsGeneration = latestVersion && !hasSnapshot(latestVersion.snapshot)

  // ?status=generating means generation was already kicked off elsewhere (the
  // home page's clarify flow) and this navigation is just following the SSE
  // stream's project_created event — the generationStore singleton already
  // has the in-flight stream, so don't start a second one here.
  const alreadyStreamingFromElsewhere = arrivedGenerating && (isStreaming || !!siteSpec)

  useEffect(() => {
    if (generationStarted || !needsGeneration) return
    if (isScanning && project.status === "GENERATING") return
    if (alreadyStreamingFromElsewhere) return

    setGenerationStarted(true)
    setStreamVersionId(latestVersion.id)
    startGeneration(ORCHESTRATOR_URL, {
      projectId: project.id,
      versionId: latestVersion.id,
      startupIdea: project.startupIdea,
      niche: project.niche,
      targetAudience: project.targetAudience,
      inputType: project.inputType,
      sourceUrl: project.sourceUrl ?? undefined,
      scanResult:
        latestScan?.extractedContent as Record<string, unknown> | undefined,
      modelId: selectedModelId,
    })
  }, [
    project,
    latestVersion,
    latestScan,
    isScanning,
    generationStarted,
    needsGeneration,
    startGeneration,
    selectedModelId,
    alreadyStreamingFromElsewhere,
  ])

  if (isScanning && project.status === "GENERATING") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <div className="text-center">
          <p className="font-medium">Analysing your site...</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;re scanning the URL. This takes about 30 seconds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-base px-4 py-1.5 shrink-0">
        <ModelSelector disabled={isStreaming} />
      </div>

      <div className="flex-1 overflow-hidden">
        <VersionSlider
          slug={project.slug}
          versions={project.versions}
          generatingVersionId={generatingVersionId}
        />
      </div>
    </div>
  )
}
