"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ProjectDetail } from "@/lib/api/services/projects.service"
import {
  deployApi,
  IN_FLIGHT_STATUSES,
  type Deployment,
  type DeploymentStatus,
} from "@/lib/api/services/deploy.service"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DomainSection } from "./DomainSection"

const PROPAGATION_NOTE = "Changes can take up to 2 minutes to appear everywhere."

const PHASES: { status: DeploymentStatus; label: string }[] = [
  { status: "QUEUED", label: "Queued" },
  { status: "BUILDING", label: "Building" },
  { status: "UPLOADING", label: "Uploading" },
  { status: "ACTIVATING", label: "Going live" },
  { status: "LIVE", label: "Live" },
]

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  QUEUED: "Queued",
  BUILDING: "Building",
  UPLOADING: "Uploading",
  DNS_PROVISIONING: "Going live",
  ACTIVATING: "Going live",
  LIVE: "Live",
  FAILED: "Failed",
  ROLLED_BACK: "Rolled back",
  SUPERSEDED: "Previous",
}

type Props = {
  project: ProjectDetail | null
  /** Insufficient credits before the first live deploy: the whole step is locked. */
  creditLocked?: boolean
  creditLockedReason?: string
  /** Balance can't cover another deploy (redeploys still cost a credit). */
  insufficientCredits?: boolean
  onLive?: () => void
}

const isInFlight = (d: Deployment | undefined) => !!d && IN_FLIGHT_STATUSES.includes(d.status)

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

const primaryButton =
  "px-5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
const secondaryButton =
  "px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"

export function DeployStepView({ project, creditLocked, creditLockedReason, insufficientCredits, onLive }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const slug = project?.slug ?? ""
  const [copied, setCopied] = useState(false)
  const [rollbackTarget, setRollbackTarget] = useState<Deployment | null>(null)

  const siteQuery = useQuery({
    queryKey: ["deploy-site", slug],
    queryFn: () => deployApi.site(slug),
    enabled: !!slug,
  })
  const deploymentsQuery = useQuery({
    queryKey: ["deployments", slug],
    queryFn: () => deployApi.list(slug),
    enabled: !!slug,
    refetchInterval: (query) => (isInFlight(query.state.data?.[0]) ? 3000 : false),
  })

  const deployments = deploymentsQuery.data ?? []
  const latest = deployments[0]
  const site = siteQuery.data ?? null
  const activeId = site?.activeDeployment?.id ?? null

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["deployments", slug] })
    queryClient.invalidateQueries({ queryKey: ["deploy-site", slug] })
    queryClient.invalidateQueries({ queryKey: ["credits-summary"] })
  }

  const deploy = useMutation({ mutationFn: () => deployApi.create(slug), onSettled: refresh })
  const rollback = useMutation({
    mutationFn: (deploymentId: string) => deployApi.rollback(slug, deploymentId),
    onSettled: refresh,
  })

  // A deployment that was in flight has just finished: refresh the site and pipeline.
  const lastSeen = useRef<{ id: string; status: DeploymentStatus } | null>(null)
  useEffect(() => {
    if (!latest) return
    const previous = lastSeen.current
    lastSeen.current = { id: latest.id, status: latest.status }
    if (previous?.id === latest.id && isInFlight({ ...latest, status: previous.status }) && !isInFlight(latest)) {
      queryClient.invalidateQueries({ queryKey: ["deploy-site", slug] })
      queryClient.invalidateQueries({ queryKey: ["credits-summary"] })
      if (latest.status === "LIVE") onLive?.()
    }
  }, [latest, queryClient, slug, onLive])

  if (creditLocked && !activeId) {
    return (
      <button
        type="button"
        onClick={() => router.push("/billing")}
        className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary text-mut">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-pri">Deploy is locked</p>
        <p className="max-w-xs text-xs text-mut">{creditLockedReason ?? "Add credits to unlock this step."}</p>
        <p className="text-xs font-medium text-blue-500">Upgrade to unlock &rarr;</p>
      </button>
    )
  }

  const liveUrl = site && activeId ? site.liveUrl : null
  const inFlight = isInFlight(latest) || deploy.isPending
  const failed = !inFlight && latest?.status === "FAILED" ? latest : null
  const deployError = deploy.error instanceof Error ? deploy.error.message : null
  const phaseIndex = PHASES.findIndex((p) => p.status === (latest?.status === "DNS_PROVISIONING" ? "ACTIVATING" : latest?.status))
  const canDeploy = !!project && !inFlight && !site?.suspended && !insufficientCredits

  const copy = () => {
    if (!liveUrl) return
    navigator.clipboard.writeText(liveUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-md flex-col gap-5">
        {site?.suspended && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <p className="font-semibold">This site has been suspended</p>
            <p className="mt-0.5">It is not being served and can&apos;t be redeployed. Contact support if you think this is a mistake.</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-pri">{project ? `Deploy ${project.name}` : "Deploy your site"}</p>
          {site ? (
            <p className="text-xs text-mut break-all">{site.primaryHost}</p>
          ) : (
            <p className="text-xs text-mut leading-relaxed">Builds your site and publishes it on its own useframe address.</p>
          )}
        </div>

        {inFlight && (
          <div className="flex flex-col gap-3" aria-live="polite">
            <ol className="flex items-center justify-between gap-1">
              {PHASES.map((phase, i) => {
                const done = phaseIndex > i
                const current = phaseIndex === i || (deploy.isPending && i === 0)
                return (
                  <li key={phase.status} className="flex flex-1 flex-col items-center gap-1.5">
                    <span
                      className={`h-1.5 w-full rounded-full ${done ? "bg-emerald-500" : current ? "bg-indigo-500 animate-pulse" : "bg-tertiary"}`}
                    />
                    <span className={`text-[11px] ${current ? "font-semibold text-pri" : "text-mut"}`}>{phase.label}</span>
                  </li>
                )
              })}
            </ol>
            {latest?.status === "ACTIVATING" && <p className="text-center text-[11.5px] text-mut">{PROPAGATION_NOTE}</p>}
          </div>
        )}

        {!inFlight && liveUrl && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-base px-4 py-4 text-center">
            <p className="text-sm font-semibold text-emerald-600">Live</p>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline break-all">
              {liveUrl}
            </a>
            <div className="flex gap-2">
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                Visit
              </a>
              <button type="button" onClick={copy} className={secondaryButton}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[11.5px] text-mut">{PROPAGATION_NOTE}</p>
          </div>
        )}

        {failed && (
          <div role="alert" className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-semibold text-pri">Deployment failed</p>
            <p className="text-xs text-mut leading-relaxed">{failed.failureReason ?? "Something went wrong."}</p>
            <p className="text-[11.5px] text-mut">Your credit for this attempt has been refunded.</p>
          </div>
        )}

        {deployError && !inFlight && (
          <p role="alert" className="text-center text-xs text-red-600">
            {deployError}
          </p>
        )}

        {!inFlight && (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => deploy.mutate()}
              disabled={!canDeploy}
              className={primaryButton}
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              {failed ? "Retry" : liveUrl ? "Redeploy" : "Deploy"}
            </button>
            <p className="text-[11.5px] text-mut">
              {insufficientCredits ? "You need at least 1 credit to deploy." : "Each deploy costs 1 credit. Rollbacks are free."}
            </p>
          </div>
        )}

        {deployments.length > 0 && (
          <section aria-label="Deployment history" className="flex flex-col gap-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-mut">History</h3>
            <ul className="flex flex-col divide-y divide-[var(--border-base)] rounded-xl border border-base">
              {deployments.map((d) => {
                const isActive = d.id === activeId
                const canRollback = !isActive && d.status === "SUPERSEDED" && !d.purgedAt && !inFlight && !site?.suspended
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-pri">{formatDate(d.createdAt)}</p>
                      <p className="text-[11.5px] text-mut">
                        {isActive ? "Live now" : STATUS_LABEL[d.status]}
                        {d.status === "FAILED" && d.failureReason ? ` — ${d.failureReason}` : ""}
                      </p>
                    </div>
                    {canRollback && (
                      <button
                        type="button"
                        onClick={() => setRollbackTarget(d)}
                        disabled={rollback.isPending}
                        className={secondaryButton}
                      >
                        {rollback.isPending && rollback.variables === d.id ? "Restoring…" : "Rollback"}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            {rollback.error instanceof Error && (
              <p role="alert" className="text-xs text-red-600">
                {rollback.error.message}
              </p>
            )}
          </section>
        )}
        {project && <DomainSection slug={project.slug} defaultHost={site?.defaultHost} />}
      </div>

      <Dialog open={!!rollbackTarget} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back to this version?</DialogTitle>
            <DialogDescription>
              {rollbackTarget
                ? `Your site will serve the version deployed on ${formatDate(rollbackTarget.createdAt)}. This is free. ${PROPAGATION_NOTE}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={secondaryButton} onClick={() => setRollbackTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={primaryButton}
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
              onClick={() => {
                if (rollbackTarget) rollback.mutate(rollbackTarget.id)
                setRollbackTarget(null)
              }}
            >
              Roll back
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
