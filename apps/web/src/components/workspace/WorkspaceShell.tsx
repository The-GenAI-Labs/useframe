"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useGenerationStore } from "@/stores/generationStore"
import { useGenerationStream } from "@/hooks/useGenerationStream"
import { useModelStore } from "@/stores/modelStore"
import { GenerationStream } from "./GenerationStream"
import { ModelSelector } from "./ModelSelector"
import { PreviewPane } from "@/components/webcontainer/PreviewPane"

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

export function WorkspaceShell({ project }: Props) {
  const searchParams = useSearchParams()
  const isScanning = searchParams.get("status") === "scanning"
  const [tab, setTab] = useState<"stream" | "preview">("stream")
  const { startGeneration } = useGenerationStream()
  const { siteSpec, isStreaming } = useGenerationStore()
  const { selectedModelId } = useModelStore()
  const [generationStarted, setGenerationStarted] = useState(false)

  const latestVersion = project.versions[0]
  const latestScan = project.competitorScans[0]

  useEffect(() => {
    if (generationStarted || !latestVersion) return
    if (isScanning && project.status === "GENERATING") return

    setGenerationStarted(true)
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
    startGeneration,
    selectedModelId,
  ])

  useEffect(() => {
    if (siteSpec) setTab("preview")
  }, [siteSpec])

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
      <div className="flex items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-1">
          <button
            className={`border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === "stream"
                ? "border-indigo-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("stream")}
          >
            Generation
          </button>
          <button
            className={`border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === "preview"
                ? "border-indigo-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            } ${!siteSpec ? "cursor-not-allowed opacity-40" : ""}`}
            onClick={() => siteSpec && setTab("preview")}
            disabled={!siteSpec}
          >
            Preview
          </button>
        </div>

        <div className="py-1.5">
          <ModelSelector disabled={isStreaming} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "stream" ? (
          <GenerationStream />
        ) : (
          <PreviewPane siteSpec={siteSpec!} />
        )}
      </div>
    </div>
  )
}
