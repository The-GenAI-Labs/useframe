"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useGenerationStore } from "@/stores/generationStore"
import { useGenerationStream } from "@/hooks/useGenerationStream"
import { useModelStore } from "@/stores/modelStore"
import { projectsApi } from "@/lib/api/services/projects.service"
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
  const router = useRouter()
  const queryClient = useQueryClient()
  const isScanning = searchParams.get("status") === "scanning"
  const arrivedGenerating = searchParams.get("status") === "generating"
  const { startGeneration } = useGenerationStream()
  const { isStreaming, siteSpec } = useGenerationStore()
  const { selectedModelId } = useModelStore()
  const [generationStarted, setGenerationStarted] = useState(false)
  const [streamVersionId, setStreamVersionId] = useState<string | null>(
    arrivedGenerating ? (project.versions[0]?.id ?? null) : null,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const generatingVersionId = streamVersionId && isStreaming ? streamVersionId : null

  const createVersionMutation = useMutation({
    mutationFn: () => projectsApi.createVersion(project.slug),
    onSuccess: () => {
      router.push(`/project/${project.slug}?status=generating`)
      router.refresh()
      queryClient.invalidateQueries({ queryKey: ["project", project.slug] })
    },
  })

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
      <div className="flex items-center justify-between border-b border-base px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-pri">{project.name}</h1>
          <span className="rounded-full bg-tertiary px-2 py-0.5 text-xs capitalize text-mut">
            {project.status.toLowerCase()}
          </span>
          {project.versions.length > 0 && (
            <div className="flex items-center gap-1.5">
              {project.versions.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => setActiveIndex(i)}
                  title={`Version ${v.versionNumber}`}
                  className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                    i === activeIndex ? "w-6 bg-pri" : "w-1.5 bg-tertiary hover:bg-bubble"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {project.versions.length > 0 && (
            <span className="text-[12px] text-mut">
              Version {project.versions[activeIndex]?.versionNumber} of {project.versions.length}
            </span>
          )}
          <button
            onClick={() => createVersionMutation.mutate()}
            disabled={createVersionMutation.isPending || isStreaming}
            className="flex items-center gap-1.5 rounded-lg bg-bubble px-2.5 py-1.5 text-[12px] font-semibold text-pri transition-opacity duration-150 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {createVersionMutation.isPending ? "Starting..." : "New generation"}
          </button>
          <ModelSelector disabled={isStreaming} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <VersionSlider
          versions={project.versions}
          generatingVersionId={generatingVersionId}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
        />
      </div>
    </div>
  )
}
