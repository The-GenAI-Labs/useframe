"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useGenerationStore } from "@/stores/generationStore"
import { useGenerationStream } from "@/hooks/useGenerationStream"
import { useModelStore } from "@/stores/modelStore"
import { useProjectStore } from "@/stores/projectStore"
import { useChatModalStore } from "@/store/chatModalStore"
import { projectsApi, type ProjectDetail } from "@/lib/api/services/projects.service"
import { pipelineApi, type PipelineStepId } from "@/lib/api/services/pipeline.service"
import { ModelSelector } from "./ModelSelector"
import { VersionSlider } from "./VersionSlider"
import { VersionPopover } from "./VersionPopover"
import { PipelineToggle, type PipelineToggleStep } from "@/components/workspace-tabs/PipelineToggle"
import { PipelineModeToggle } from "@/components/workspace-tabs/PipelineModeToggle"
import { ResearchTab } from "@/components/workspace-tabs/ResearchTab"
import { SeoStepView } from "@/components/workspace-tabs/SeoStepView"
import { DeployStepView } from "@/components/workspace-tabs/DeployStepView"
import { StepApprovalBar } from "@/components/workspace-tabs/StepApprovalBar"
import { websiteApi } from "@/lib/api/services/website.service"
import { LowBalanceBanner } from "@/components/billing/LowBalanceBanner"
import { creditsApi } from "@/lib/api/services/credits.service"

// Mirrors the server's cost table (apps/server/src/modules/{seoStep,deploy}/*.service.ts) —
// used only to decide whether to pre-emptively lock a tab client-side; the
// server is still the source of truth and re-checks on approve.
const SEO_CREDIT_COST = 1
const DEPLOY_CREDIT_COST = 1

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

const STEP_LABELS: Record<PipelineStepId, string> = {
  RESEARCH: "Research",
  WEBSITE: "Website",
  SEO: "SEO",
  DEPLOY: "Deploy",
}
const STEP_ORDER: PipelineStepId[] = ["RESEARCH", "WEBSITE", "SEO", "DEPLOY"]

type Props = {
  project: ProjectDetail
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
  const [viewingStep, setViewingStep] = useState<PipelineStepId | null>(null)
  const generatingVersionId = streamVersionId && isStreaming ? streamVersionId : null

  const setVersions = useProjectStore((s) => s.setVersions)
  const addVersion = useProjectStore((s) => s.addVersion)
  const restoreVersionInStore = useProjectStore((s) => s.restoreVersion)
  const setProjectContext = useChatModalStore((s) => s.setProjectContext)
  const chatMessages = useChatModalStore((s) => s.messages)
  const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set())
  const [versions, setLocalVersions] = useState(project.versions)
  const [currentVersionId, setCurrentVersionId] = useState(
    project.versions[0]?.id ?? null
  )

  const { data: pipelineData } = useQuery({
    queryKey: ["pipeline", project.slug],
    queryFn: () => pipelineApi.get(project.slug),
    refetchInterval: 4000,
  })
  const pipeline = pipelineData?.pipelineState ?? null

  const { data: creditsSummary } = useQuery({
    queryKey: ["credits-summary"],
    queryFn: () => creditsApi.getSummary(),
  })
  const balance = creditsSummary?.balance ?? 0
  // Steps that are still ahead (PENDING/LOCKED, not yet approved) get locked
  // if the balance can't cover them — approved steps stay visible/approved
  // regardless of balance, since that credit was already spent.
  const seoCreditLocked = pipeline?.seoStatus !== "APPROVED" && balance < SEO_CREDIT_COST
  const deployCreditLocked = pipeline?.deployStatus !== "APPROVED" && balance < DEPLOY_CREDIT_COST

  const invalidatePipeline = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pipeline", project.slug] })
  }, [queryClient, project.slug])

  // Manual mode lets you jump between steps freely; Auto locks the toggle to
  // whichever step is actually running so you can't navigate away mid-chain.
  const currentStep =
    pipeline?.mode === "AUTO" ? pipeline.currentStep : (viewingStep ?? pipeline?.currentStep ?? "RESEARCH")

  // Mode is chosen once, on the home page, before the project (and this
  // pipeline) exist at all — by the time we're here it's already decided,
  // so the toggle is shown read-only rather than being clickable again.

  useEffect(() => {
    setVersions(project.versions)
    setLocalVersions(project.versions)
  }, [project.versions, setVersions])

  useEffect(() => {
    const versionId = currentVersionId ?? project.versions[0]?.id ?? null
    setProjectContext(project.slug, versionId)
    return () => setProjectContext(null, null)
  }, [project.slug, currentVersionId, project.versions, setProjectContext])

  // Pick up new versions produced by chat iteration (see chatModalStore.sendMessage)
  // and splice them into the local version list without a page reload.
  useEffect(() => {
    for (const msg of chatMessages) {
      if (seenMessageIds.has(msg.id)) continue
      if (msg.producedVersion) {
        setLocalVersions((prev) => {
          if (prev.some((v) => v.id === msg.producedVersion!.id)) return prev
          const newVersion = {
            id: msg.producedVersion!.id,
            versionNumber: msg.producedVersion!.versionNumber,
            label: null,
            siteType: prev[0]?.siteType ?? "SINGLE_PAGE",
            snapshot: {},
            createdAt: new Date().toISOString(),
          }
          addVersion(newVersion)
          return [newVersion, ...prev]
        })
        setCurrentVersionId(msg.producedVersion.id)
        setActiveIndex(0)
      }
      setSeenMessageIds((prev) => new Set(prev).add(msg.id))
    }
  }, [chatMessages, seenMessageIds, addVersion])

  const handleRestore = async (versionId: string) => {
    await restoreVersionInStore(versionId)
    setCurrentVersionId(versionId)
  }

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

  // Website generation only auto-starts once Research has been approved
  // (websiteStatus unlocked from LOCKED) — this is the pipeline gate.
  const websiteUnlocked = !pipeline || pipeline.websiteStatus !== "LOCKED"

  useEffect(() => {
    if (generationStarted || !needsGeneration || !websiteUnlocked) return
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
    websiteUnlocked,
    startGeneration,
    selectedModelId,
    alreadyStreamingFromElsewhere,
  ])

  const handleWebsiteApprove = useCallback(() => {
    websiteApi.approve(project.slug).then(invalidatePipeline)
  }, [project.slug, invalidatePipeline])

  const handleWebsiteReject = useCallback(
    (feedback: string) => {
      websiteApi.reject(project.slug, feedback).then(() => {
        invalidatePipeline()
        queryClient.invalidateQueries({ queryKey: ["project", project.slug] })
        router.refresh()
      })
    },
    [project.slug, invalidatePipeline, queryClient, router]
  )

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

  const toggleSteps: PipelineToggleStep[] = STEP_ORDER.map((id) => ({
    id,
    label: STEP_LABELS[id],
    status: pipeline
      ? id === "RESEARCH"
        ? pipeline.researchStatus
        : id === "WEBSITE"
          ? pipeline.websiteStatus
          : id === "SEO"
            ? pipeline.seoStatus
            : pipeline.deployStatus
      : "LOCKED",
    hardLocked: id === "SEO" ? seoCreditLocked : id === "DEPLOY" ? deployCreditLocked : false,
    hardLockedReason:
      id === "SEO"
        ? `Add credits to unlock — SEO costs ${SEO_CREDIT_COST} credit`
        : id === "DEPLOY"
          ? `Add credits to unlock — Deploy costs ${DEPLOY_CREDIT_COST} credit`
          : undefined,
  }))

  const isStepApproved = (id: PipelineStepId) =>
    pipeline
      ? (id === "RESEARCH"
          ? pipeline.researchStatus
          : id === "WEBSITE"
            ? pipeline.websiteStatus
            : id === "SEO"
              ? pipeline.seoStatus
              : pipeline.deployStatus) === "APPROVED"
      : false

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-base px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-pri">{project.name}</h1>
          <span className="rounded-full bg-tertiary px-2 py-0.5 text-xs capitalize text-mut">
            {project.status.toLowerCase()}
          </span>
          {currentStep === "WEBSITE" && versions.length > 0 && (
            <div className="flex items-center gap-1.5">
              {versions.map((v, i) => (
                <VersionPopover
                  key={v.id}
                  version={v}
                  isCurrent={v.id === currentVersionId}
                  onRestore={() => handleRestore(v.id)}
                >
                  <button
                    onClick={() => setActiveIndex(i)}
                    title={`Version ${v.versionNumber}`}
                    className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                      i === activeIndex ? "w-6 bg-pri" : "w-1.5 bg-tertiary hover:bg-bubble"
                    } ${v.id === currentVersionId ? "ring-2 ring-offset-1 ring-indigo-400" : ""}`}
                  />
                </VersionPopover>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentStep === "WEBSITE" && versions.length > 0 && (
            <span className="text-[12px] text-mut">
              Version {versions[activeIndex]?.versionNumber} of {versions.length}
            </span>
          )}
          {currentStep === "WEBSITE" && (
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
          )}
          <ModelSelector disabled={isStreaming} />
        </div>
      </div>

      <div className="px-4 pt-2.5 shrink-0">
        <LowBalanceBanner />
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-b border-base shrink-0">
        <PipelineModeToggle
          mode={pipeline?.mode ?? "MANUAL"}
          onChange={() => {}}
          disabled
        />
        <PipelineToggle
          steps={toggleSteps}
          activeStep={currentStep}
          onSelectStep={(id) => setViewingStep(id)}
          interactive
          ignoreLock={pipeline?.mode === "MANUAL"}
        />
        {pipeline?.mode === "MANUAL" && (() => {
          const idx = STEP_ORDER.indexOf(currentStep)
          const nextStep = idx >= 0 && idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : null
          if (!nextStep) return null
          return (
            <button
              type="button"
              onClick={() => setViewingStep(nextStep)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12.5px] font-semibold text-mut hover:text-sec hover:bg-tertiary transition-all cursor-pointer"
            >
              Continue
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )
        })()}
      </div>

      <div className="flex-1 overflow-hidden">
        {currentStep === "RESEARCH" && (
          <ResearchTab
            project={project}
            pipelineStatus={pipeline?.researchStatus}
            locked={isStepApproved("RESEARCH")}
            onApproved={() => {
              invalidatePipeline()
              setViewingStep(null)
            }}
          />
        )}

        {currentStep === "WEBSITE" && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-hidden">
              <VersionSlider
                versions={versions}
                generatingVersionId={generatingVersionId}
                activeIndex={activeIndex}
                onActiveIndexChange={setActiveIndex}
              />
            </div>
            {isStepApproved("WEBSITE") ? (
              <div className="shrink-0 px-4 py-3">
                <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-medium w-fit dark:bg-emerald-950/30 dark:text-emerald-400">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Approved
                </div>
              </div>
            ) : pipeline?.websiteStatus === "AWAITING_APPROVAL" ? (
              <div className="shrink-0 px-4 py-3">
                <StepApprovalBar
                  onApprove={handleWebsiteApprove}
                  onReject={handleWebsiteReject}
                />
              </div>
            ) : null}
          </div>
        )}

        {currentStep === "SEO" && (
          <SeoStepView
            project={project}
            pipelineStatus={pipeline?.seoStatus}
            locked={isStepApproved("SEO")}
            creditLocked={seoCreditLocked}
            creditLockedReason={`You need at least ${SEO_CREDIT_COST} credit to run the SEO step.`}
            onApproved={() => {
              invalidatePipeline()
              setViewingStep(null)
            }}
          />
        )}

        {currentStep === "DEPLOY" && (
          <DeployStepView
            project={project}
            locked={isStepApproved("DEPLOY")}
            creditLocked={deployCreditLocked}
            creditLockedReason={`You need at least ${DEPLOY_CREDIT_COST} credit to deploy.`}
            onApproved={invalidatePipeline}
          />
        )}
      </div>
    </div>
  )
}
