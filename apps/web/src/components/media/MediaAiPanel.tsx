"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ACTIVE_MEDIA_JOB,
  mediaJobsApi,
  type CheckpointAction,
  type MediaJob,
  type MediaJobOverview,
} from "@/lib/api/services/mediaJobs.service"
import { MediaCheckpointCard } from "./MediaCheckpointCard"

type Props = { projectSlug: string; paid: boolean; onMediaChanged: () => void }

const ITEM_STATUS: Record<string, string> = {
  PENDING: "Waiting",
  RUNNING: "In progress",
  DONE: "Done",
  FAILED: "Kept your current media",
  DROPPED: "Removed",
  SKIPPED: "Using the still",
}

const button =
  "rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 cursor-pointer"

function finishedLine(job: MediaJob): string {
  const refunded = job.creditsRefunded > 0 ? ` ${job.creditsRefunded} unused credits were refunded.` : ""
  if (job.status === "DONE") return `AI media is ready and has been added to your site as a new version.${refunded}`
  if (job.status === "CANCELLED") return `${job.failureReason ?? "Cancelled"}.${refunded}`
  return `${job.failureReason ?? "AI media couldn't be finished"}. Your site is unchanged.${refunded}`
}

function WhyHere({ overview }: { overview: MediaJobOverview }) {
  if (!overview.narrative && overview.script.length === 0) return null
  return (
    <details className="rounded-xl border border-base p-3 text-[12px] text-sec">
      <summary className="cursor-pointer font-semibold text-pri">Why these images and videos are here</summary>
      {overview.narrative && <p className="mt-2">{overview.narrative.storyArc}</p>}
      {overview.script.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {overview.script.map((i) => (
            <li key={i.itemId}>
              <span className="font-medium text-pri">
                {i.kind === "video" ? "Video" : "Image"} · {i.role}:
              </span>{" "}
              {i.reason}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

export function MediaAiPanel({ projectSlug, paid, onMediaChanged }: Props) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<"AUTO" | "MANUAL">("AUTO")
  const key = ["media-job", projectSlug]

  const overview = useQuery({
    queryKey: key,
    queryFn: () => mediaJobsApi.latest(projectSlug),
    refetchInterval: (q) => {
      const status = q.state.data?.job?.status
      if (status === "AWAITING_USER") return 15_000
      return status && ACTIVE_MEDIA_JOB.includes(status) ? 3000 : false
    },
  })
  const job = overview.data?.job ?? null
  const running = !!job && ACTIVE_MEDIA_JOB.includes(job.status)

  const estimate = useQuery({
    queryKey: ["media-job-estimate", projectSlug],
    queryFn: () => mediaJobsApi.estimate(projectSlug),
    enabled: paid && !running,
    staleTime: 60_000,
  })

  // Refresh the library when generated files arrive or the job settles.
  const lastSeen = useRef<string | null>(null)
  useEffect(() => {
    if (!job) return
    const signature = `${job.id}:${job.status}:${job.items.filter((i) => i.status === "DONE").length}`
    if (lastSeen.current && lastSeen.current !== signature) onMediaChanged()
    lastSeen.current = signature
  }, [job, onMediaChanged])

  const setJob = (next: MediaJob) => queryClient.setQueryData<MediaJobOverview>(key, (old) => (old ? { ...old, job: next } : old))
  const onError = (err: Error) => toast.error(err.message)

  const start = useMutation({
    mutationFn: () => mediaJobsApi.start(projectSlug, { mode, scope: { kind: "site" } }),
    onSuccess: (next) => {
      setJob(next)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError,
  })
  const act = useMutation({
    mutationFn: (action: CheckpointAction) => mediaJobsApi.checkpoint(projectSlug, job!.id, action),
    onSuccess: setJob,
    onError: (err: Error & { code?: string }) => {
      onError(err)
      if (err.code === "MEDIA_CHECKPOINT_STALE") void queryClient.invalidateQueries({ queryKey: key })
    },
  })
  const cancel = useMutation({
    mutationFn: () => mediaJobsApi.cancel(projectSlug, job!.id),
    onSuccess: setJob,
    onError,
  })

  if (!paid && !job) {
    return (
      <div className="mx-4 mt-3 flex flex-col gap-2 rounded-2xl border border-base p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-sec">
          Generate images and short videos made for your site&apos;s story. Available on paid plans.
        </p>
        <Link href="/billing" className={`${button} bg-inv text-center text-inv hover:opacity-90`}>
          See plans
        </Link>
      </div>
    )
  }

  const data = overview.data
  return (
    <div className="mx-4 mt-3 flex flex-col gap-3 rounded-2xl border border-base p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[13.5px] font-semibold text-pri">AI images and videos</h2>
          <p className="text-[12px] text-mut" aria-live="polite">
            {running
              ? job!.status === "AWAITING_USER"
                ? "Waiting for your answer below"
                : job!.stageLabel ?? "Getting started…"
              : estimate.data
                ? `${estimate.data.maximum ? "Up to " : ""}${estimate.data.credits} credits · you have ${estimate.data.balance}`
                : "Made for this site, from your brief and research"}
          </p>
        </div>
        {running ? (
          <button type="button" className={`${button} border border-base text-sec hover:bg-tertiary`} disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {cancel.isPending ? "Cancelling…" : "Cancel"}
          </button>
        ) : !paid ? (
          <Link href="/billing" className={`${button} bg-inv text-center text-inv hover:opacity-90`}>
            Add credits
          </Link>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="How to run" className="flex rounded-xl bg-tertiary p-0.5">
              {(["AUTO", "MANUAL"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer ${
                    mode === m ? "bg-surface text-pri shadow-sm" : "text-sec"
                  }`}
                >
                  {m === "AUTO" ? "Automatic" : "Approve each step"}
                </button>
              ))}
            </div>
            <button type="button" className={`${button} bg-inv text-inv hover:opacity-90`} disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? "Starting…" : "Generate with AI"}
            </button>
          </div>
        )}
      </div>

      {data?.notice && <p className="text-[12px] text-amber-700 dark:text-amber-400">{data.notice}</p>}

      {job && running && job.status !== "AWAITING_USER" && job.items.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12px]" aria-label="AI media progress">
          {job.items.map((i) => (
            <li key={i.itemId} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-sec">
                {i.kind === "video" ? "Video" : "Image"} · {i.role}
              </span>
              <span className="shrink-0 text-mut">{ITEM_STATUS[i.status] ?? i.status}</span>
            </li>
          ))}
        </ul>
      )}

      {job?.status === "AWAITING_USER" && (
        <MediaCheckpointCard job={job} pending={act.isPending} onAction={(a) => act.mutate({ ...a, checkpoint: job.checkpoint! })} />
      )}

      {job && !running && <p className="text-[12px] text-sec">{finishedLine(job)}</p>}

      {data && <WhyHere overview={data} />}
    </div>
  )
}
