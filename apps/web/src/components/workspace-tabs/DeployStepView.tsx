"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import type { ProjectDetail } from "@/lib/api/services/projects.service"
import { deployApi, type DeploymentResult, type DeploymentStatus } from "@/lib/api/services/deploy.service"
import { DomainSection } from "./DomainSection"

type ViewState =
  | { status: "idle" }
  | { status: "polling"; deploymentId: string; phase: DeploymentStatus }
  | { status: "done"; result: DeploymentResult }
  | { status: "failed"; reason: string }

const PHASE_TEXT: Record<string, string> = {
  QUEUED: "Queuing deployment…",
  BUILDING: "Running a real Vite build…",
  UPLOADING: "Uploading to Vercel…",
  DNS_PROVISIONING: "Provisioning DNS…",
}

type Props = {
  project: ProjectDetail | null
  locked?: boolean
  /** Insufficient credits — distinct from `locked` (which means "approved"). */
  creditLocked?: boolean
  creditLockedReason?: string
  onApproved?: () => void
}

export function DeployStepView({ project, locked, creditLocked, creditLockedReason, onApproved }: Props) {
  const [state, setState] = useState<ViewState>({ status: "idle" })
  const [isApproving, setIsApproving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  if (creditLocked) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary text-mut">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-pri">Deploy is locked</p>
        <p className="max-w-xs text-xs text-mut">{creditLockedReason ?? "Add credits to unlock this step."}</p>
      </div>
    )
  }

  const handleDeploy = useCallback(() => {
    if (!project) return
    deployApi
      .create(project.slug)
      .then(({ deploymentId }) => {
        setState({ status: "polling", deploymentId, phase: "QUEUED" })

        pollRef.current = setInterval(() => {
          deployApi
            .get(project.slug, deploymentId)
            .then((result) => {
              if (result.status === "LIVE") {
                if (pollRef.current) clearInterval(pollRef.current)
                setState({ status: "done", result })
              } else if (result.status === "FAILED") {
                if (pollRef.current) clearInterval(pollRef.current)
                setState({ status: "failed", reason: result.failureReason ?? "Deployment failed." })
              } else {
                setState((s) =>
                  s.status === "polling" ? { ...s, phase: result.status } : s
                )
              }
            })
            .catch(() => {
              if (pollRef.current) clearInterval(pollRef.current)
              setState({ status: "failed", reason: "Lost connection while checking status." })
            })
        }, 2000)
      })
      .catch((err) => {
        setState({ status: "failed", reason: err instanceof Error ? err.message : "Failed to start deploy." })
      })
  }, [project])

  const handleApprove = useCallback(() => {
    if (!project) return
    setIsApproving(true)
    deployApi
      .approve(project.slug)
      .then(() => onApproved?.())
      .finally(() => setIsApproving(false))
  }, [project, onApproved])

  return (
    <div className="flex flex-col h-full w-full items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm w-full">
        <div className="w-16 h-16 rounded-3xl bg-tertiary border border-base flex items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-mut">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </div>

        {state.status === "idle" && (
          <>
            <div>
              <p className="text-sm font-semibold text-pri">
                {project ? `Deploy ${project.name}` : "Deploy your site"}
              </p>
              <p className="text-xs text-mut mt-1 leading-relaxed">
                Runs a real build and publishes it live on Vercel.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={locked}
              className="px-5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              Deploy
            </button>
          </>
        )}

        {state.status === "polling" && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-[12.5px] text-mut">{PHASE_TEXT[state.phase] ?? "Deploying…"}</p>
          </div>
        )}

        {state.status === "failed" && (
          <>
            <div>
              <p className="text-sm font-semibold text-pri">Deployment failed</p>
              <p className="text-xs text-mut mt-1 leading-relaxed">{state.reason}</p>
            </div>
            <button
              type="button"
              onClick={handleDeploy}
              className="px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
            >
              Try again
            </button>
          </>
        )}

        {state.status === "done" && (
          <>
            <div>
              <p className="text-sm font-semibold text-emerald-600">Live</p>
              {state.result.liveUrl && (
                <a
                  href={state.result.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-500 hover:underline mt-1 inline-block break-all"
                >
                  {state.result.liveUrl}
                </a>
              )}
            </div>
            {locked ? (
              <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-medium dark:bg-emerald-950/30 dark:text-emerald-400">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Approved
              </div>
            ) : (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="px-5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
                style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                {isApproving ? "Approving…" : "Approve"}
              </button>
            )}
            {project && <DomainSection slug={project.slug} />}
          </>
        )}
      </div>
    </div>
  )
}
