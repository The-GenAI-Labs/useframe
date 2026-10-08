"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BRIEF_PANEL_COPY,
  BRIEF_SOURCE_LABELS,
  BRIEF_STEP_COPY,
  CLAIM_PATHS,
  FIELD_DEFS,
  FIELD_IDS,
  STEP_IDS,
  isBlankValue,
  type BriefView,
  type FieldId,
  type Source,
  type StepId,
} from "@repo/schemas"
import { briefsApi, type BriefApiError } from "@/lib/api/services/briefs.service"
import { useProjectModalStore } from "@/store/projectModalStore"
import { cn } from "@/lib/utils"
import { fieldLabel, summarize } from "./briefFields"

const SOURCE_STYLE: Record<Source, string> = {
  user: "bg-tertiary text-sec",
  imported: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  researched: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  assumed: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  default: "bg-tertiary text-mut",
}

export function briefQueryKey(slug: string) {
  return ["brief", slug] as const
}

// Resolves to null for projects created before intake briefs existed.
export function useProjectBrief(slug: string | undefined) {
  return useQuery({
    queryKey: briefQueryKey(slug ?? ""),
    enabled: !!slug,
    queryFn: async (): Promise<BriefView | null> => {
      try {
        return await briefsApi.getForProject(slug!)
      } catch (err) {
        if ((err as BriefApiError).status === 404) return null
        throw err
      }
    },
    refetchInterval: (query) => (query.state.data?.status === "RESOLVING" ? 1500 : false),
  })
}

type Props = {
  slug: string
  brief: BriefView
  staleVersion: boolean
  onRegenerate?: () => void
  onApproved: () => void
}

export function BriefPanel({ slug, brief, staleVersion, onRegenerate, onApproved }: Props) {
  const queryClient = useQueryClient()
  const openModal = useProjectModalStore((s) => s.open)
  const [onlyPending, setOnlyPending] = useState(brief.status === "AWAITING_REVIEW")
  const [confirmed, setConfirmed] = useState<Set<FieldId>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reviewing = brief.status === "AWAITING_REVIEW"
  const pendingClaims = brief.needsConfirmation
  const allConfirmed = pendingClaims.every((p) => confirmed.has(p))

  const rows = useMemo(
    () =>
      STEP_IDS.map((step) => ({
        step,
        fields: FIELD_IDS.filter((id) => {
          if (isBlankValue(brief.data[id])) return false
          if (id === "sourceDocument") return false
          const meta = brief.meta[id]
          if (onlyPending) return meta?.source === "assumed" || (meta?.source === "imported" && !meta.confirmed)
          return true
        }).filter((id) => fieldStep(id) === step),
      })).filter((g) => g.fields.length > 0),
    [brief, onlyPending],
  )

  const refresh = (view?: BriefView) => {
    if (view) queryClient.setQueryData(briefQueryKey(slug), view)
    else void queryClient.invalidateQueries({ queryKey: briefQueryKey(slug) })
  }

  const remove = async (id: FieldId) => {
    setBusy(true)
    setError(null)
    try {
      const result = await briefsApi.patchForProject(slug, { expectedVersion: brief.version, unset: [id] })
      setConfirmed((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      refresh(result.brief)
    } catch (err) {
      setError((err as Error).message)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      const view = await briefsApi.approveForProject(slug, { expectedVersion: brief.version, confirmedPaths: [...confirmed] })
      refresh(view)
      onApproved()
    } catch (err) {
      setError((err as Error).message)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="brief-panel-title" className="flex flex-col gap-4 rounded-3xl border border-base bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="brief-panel-title" className="text-[15px] font-semibold text-pri">
          {BRIEF_PANEL_COPY.title}
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" aria-pressed={onlyPending} onClick={() => setOnlyPending((v) => !v)} className={cn("rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50", onlyPending ? "border-amber-400 text-amber-800 dark:text-amber-300" : "border-base text-mut")}>
            {onlyPending ? BRIEF_PANEL_COPY.showAll : BRIEF_PANEL_COPY.needsConfirmation}
          </button>
          <button type="button" disabled={brief.status === "RESOLVING"} onClick={() => openModal({ mode: "edit", projectSlug: slug })} className="rounded-lg bg-inv px-3 py-1.5 text-[12px] font-semibold text-inv focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40">
            {BRIEF_PANEL_COPY.editBrief}
          </button>
        </div>
      </div>

      {brief.status === "RESOLVING" && (
        <p role="status" className="flex items-center gap-2 text-[12.5px] text-mut">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          {BRIEF_PANEL_COPY.resolving}
        </p>
      )}

      {reviewing && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">{BRIEF_PANEL_COPY.reviewBanner}</p>
          <p className="mt-1">{BRIEF_PANEL_COPY.reviewHelp}</p>
          {brief.resolution.notice && <p className="mt-1">{BRIEF_PANEL_COPY.resolveNotice}</p>}
        </div>
      )}

      {staleVersion && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-[12.5px] text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
          {BRIEF_PANEL_COPY.staleBanner}
          {onRegenerate && (
            <button type="button" onClick={onRegenerate} className="rounded-lg border border-current px-2.5 py-1 font-semibold">
              Regenerate
            </button>
          )}
        </div>
      )}

      {rows.length === 0 && onlyPending && <p className="text-[12.5px] text-mut">Nothing needs your confirmation.</p>}

      {rows.map(({ step, fields }) => (
        <div key={step} className="flex flex-col gap-2">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-mut">{BRIEF_STEP_COPY[step].title}</h3>
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {fields.map((id) => {
              const meta = brief.meta[id]
              const source = meta?.source ?? "user"
              const isClaim = (CLAIM_PATHS as readonly string[]).includes(id)
              const needsClick = pendingClaims.includes(id)
              return (
                <li key={id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-pri">{fieldLabel(id)}</p>
                    <p className="break-words text-[12.5px] text-sec">{summarize(id, brief.data)}</p>
                    {source === "researched" && meta?.citations?.length ? (
                      <p className="text-[11.5px] text-mut">
                        {id === "competitors" ? `${BRIEF_PANEL_COPY.competitorNote}: ` : "Sources: "}
                        {meta.citations.map((c, i) => (
                          <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                            {c.title ?? new URL(c.url).hostname}
                            {i < meta.citations!.length - 1 ? ", " : ""}
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", SOURCE_STYLE[source])}>{BRIEF_SOURCE_LABELS[source]}</span>
                    {needsClick && (
                      <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300">
                        <input
                          type="checkbox"
                          className="size-4 accent-amber-600"
                          checked={confirmed.has(id)}
                          onChange={(e) =>
                            setConfirmed((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(id)
                              else next.delete(id)
                              return next
                            })
                          }
                          aria-describedby={`${id}-claim-note`}
                        />
                        {BRIEF_PANEL_COPY.confirm}
                        <span id={`${id}-claim-note`} className="sr-only">
                          {BRIEF_PANEL_COPY.claimNote}
                        </span>
                      </label>
                    )}
                    {source === "assumed" && (
                      <>
                        <button type="button" onClick={() => openModal({ mode: "edit", projectSlug: slug, step: fieldStep(id) })} className="rounded-lg border border-base px-2 py-0.5 text-[11.5px] font-semibold text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`${BRIEF_PANEL_COPY.edit} ${fieldLabel(id)}`}>
                          {BRIEF_PANEL_COPY.edit}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void remove(id)} className="rounded-lg border border-base px-2 py-0.5 text-[11.5px] font-semibold text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40" aria-label={`${BRIEF_PANEL_COPY.remove} ${fieldLabel(id)}`}>
                          {BRIEF_PANEL_COPY.remove}
                        </button>
                      </>
                    )}
                    {isClaim && source === "assumed" && !needsClick && <span className="sr-only">{BRIEF_PANEL_COPY.claimNote}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {!onlyPending && brief.omitted.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-mut">{BRIEF_PANEL_COPY.omittedTitle}</h3>
          <ul className="flex flex-wrap gap-2">
            {brief.omitted.map((o) => (
              <li key={`${o.field}-${o.label}`} className="flex items-center gap-1.5 rounded-full border border-base px-3 py-1 text-[12px] text-sec">
                {o.label}
                <button type="button" onClick={() => openModal({ mode: "edit", projectSlug: slug, step: o.step })} className="font-semibold text-blue-700 underline underline-offset-2 dark:text-blue-300" aria-label={`Add ${o.label}`}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-mut">{BRIEF_PANEL_COPY.warningsTitle}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[12.5px] text-sec">
            {brief.warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {reviewing && (
        <div className="flex flex-col items-start gap-1.5">
          <button type="button" disabled={busy || !allConfirmed} onClick={() => void approve()} className="rounded-xl bg-inv px-5 py-2.5 text-[13px] font-semibold text-inv hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40">
            {BRIEF_PANEL_COPY.approve}
          </button>
          {!allConfirmed && (
            <p className="text-[11.5px] text-mut">
              Confirm or remove: {pendingClaims.filter((p) => !confirmed.has(p)).map(fieldLabel).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function fieldStep(id: FieldId): StepId {
  return FIELD_DEFS[id].step
}
