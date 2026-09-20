"use client"

import { useCallback, useEffect, useState } from "react"
import type { ProjectDetail } from "@/lib/api/services/projects.service"
import { seoStepApi, type SeoStepResult } from "@/lib/api/services/seoStep.service"
import { StepApprovalBar } from "./StepApprovalBar"
import type { PipelineStepStatus } from "@/lib/api/services/pipeline.service"

type LoadState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; result: SeoStepResult }
  | { status: "error"; message: string }

type Props = {
  project: ProjectDetail | null
  pipelineStatus?: PipelineStepStatus
  locked?: boolean
  /** Insufficient credits — distinct from `locked` (which means "approved"). */
  creditLocked?: boolean
  creditLockedReason?: string
  onApproved?: () => void
}

export function SeoStepView({ project, pipelineStatus, locked, creditLocked, creditLockedReason, onApproved }: Props) {
  const [state, setState] = useState<LoadState>({ status: "idle" })
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  const generate = useCallback(() => {
    if (!project) return
    setState({ status: "generating" })
    seoStepApi
      .generate(project.slug)
      .then((result) => setState({ status: "ready", result }))
      .catch((err) => {
        setState({ status: "error", message: err instanceof Error ? err.message : "SEO step failed" })
      })
  }, [project])

  useEffect(() => {
    if (creditLocked) return
    if (project && pipelineStatus === "PENDING" && state.status === "idle") {
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, pipelineStatus, state.status, creditLocked])

  if (creditLocked) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary text-mut">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-pri">SEO is locked</p>
        <p className="max-w-xs text-xs text-mut">{creditLockedReason ?? "Add credits to unlock this step."}</p>
      </div>
    )
  }

  const handleApprove = useCallback(() => {
    if (!project) return
    setIsApproving(true)
    seoStepApi
      .approve(project.slug)
      .then(() => onApproved?.())
      .finally(() => setIsApproving(false))
  }, [project, onApproved])

  const handleReject = useCallback(
    (feedback: string) => {
      if (!project) return
      setIsRejecting(true)
      seoStepApi
        .reject(project.slug, feedback)
        .then(() => generate())
        .finally(() => setIsRejecting(false))
    },
    [project, generate]
  )

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-6 md:px-10 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold text-pri tracking-tight">SEO</h1>
        <p className="text-sm text-mut mt-1">
          robots.txt, sitemap.xml, and keyword validation for the generated site.
        </p>
      </div>

      {state.status === "generating" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-[12.5px] text-mut">Validating SEO and generating files…</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="flex flex-col items-center gap-3 text-center max-w-sm">
            <p className="text-sm font-semibold text-pri">Something went wrong</p>
            <p className="text-xs text-mut">{state.message}</p>
            <button
              type="button"
              onClick={generate}
              className="px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="px-6 md:px-10 pb-10 flex flex-col gap-4 max-w-2xl">
          <div className="flex flex-col gap-2 p-4 rounded-2xl border border-base bg-surface">
            <p className="text-[13px] font-semibold text-sec">Keyword validation</p>
            <div className="flex flex-col gap-1.5 mt-1">
              {state.result.keywordValidation.map((kv) => (
                <div key={kv.pageSlug} className="flex items-center justify-between gap-3 text-[11.5px] py-1.5 border-b border-base last:border-0">
                  <span className="text-sec truncate">{kv.pageSlug}</span>
                  <span className={kv.pass ? "text-emerald-600" : "text-amber-600"}>
                    {kv.pass
                      ? "All keywords present"
                      : kv.declaredKeywords.length === 0
                        ? "No keywords declared"
                        : `Missing: ${kv.missingKeywords.join(", ")}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 p-4 rounded-2xl border border-base bg-surface">
            <p className="text-[13px] font-semibold text-sec">robots.txt</p>
            <pre className="text-[11px] text-mut bg-tertiary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{state.result.robotsTxt}</pre>
          </div>

          <div className="flex flex-col gap-2 p-4 rounded-2xl border border-base bg-surface">
            <p className="text-[13px] font-semibold text-sec">sitemap.xml</p>
            <pre className="text-[11px] text-mut bg-tertiary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{state.result.sitemapXml}</pre>
          </div>

          {locked ? (
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-medium w-fit dark:bg-emerald-950/30 dark:text-emerald-400">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approved
            </div>
          ) : pipelineStatus === "AWAITING_APPROVAL" ? (
            <StepApprovalBar
              onApprove={handleApprove}
              onReject={handleReject}
              isApproving={isApproving}
              isRejecting={isRejecting}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
