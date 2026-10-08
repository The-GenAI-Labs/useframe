"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  BRIEF_STEP_COPY,
  BRIEF_UI_COPY,
  FIELD_DEFS,
  QUICK_STEP_IDS,
  REQUIRED_FIELD_IDS,
  STEP_IDS,
  dropUnconfirmedImportedProof,
  validateFieldValue,
  validateForSubmit,
  type BriefDraftSummary,
  type BriefFieldErrors,
  type BriefView,
  type FieldId,
  type StepId,
} from "@repo/schemas"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/authContext"
import { isFreeTierExhausted } from "@/lib/freeTierError"
import { useProjectModalStore, type BriefModalRequest } from "@/store/projectModalStore"
import { briefAssetUrl, briefsApi, type BriefApiError } from "@/lib/api/services/briefs.service"
import { BriefFieldInput } from "./BriefFieldInput"
import { PrefillPanel } from "./PrefillPanel"
import { useBriefDraft } from "./useBriefDraft"
import {
  errorsForField,
  fieldsFor,
  firstStepWithError,
  firstUnfilledStep,
  stepHasRequired,
  stepsFor,
  type BriefViewMode,
} from "./briefFields"

const VIEW_KEY = "uf-brief-view"
const SIMPLE_LABEL_KINDS = new Set(["text", "textarea", "url", "email", "date"])

function readViewPreference(): BriefViewMode {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "FULL" ? "FULL" : "QUICK"
  } catch {
    return "QUICK"
  }
}

function writeViewPreference(view: BriefViewMode): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {}
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export function BriefModal() {
  const isOpen = useProjectModalStore((s) => s.isOpen)
  const request = useProjectModalStore((s) => s.request)
  const close = useProjectModalStore((s) => s.close)
  const [session, setSession] = useState(0)

  useEffect(() => {
    if (isOpen) setSession((s) => s + 1)
  }, [isOpen])

  if (!isOpen) return null
  return <BriefModalSession key={session} request={request} onClose={close} />
}

type Phase = "loading" | "choose" | "form" | "summary" | "error"

function BriefModalSession({ request, onClose }: { request: BriefModalRequest; onClose: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const editing = request.mode === "edit"
  const projectSlug = request.mode === "edit" ? request.projectSlug : undefined
  const draft = useBriefDraft(editing ? "edit" : "draft", projectSlug)

  const [phase, setPhase] = useState<Phase>("loading")
  const [view, setView] = useState<BriefViewMode>(() => (editing ? "FULL" : readViewPreference()))
  const [step, setStep] = useState<StepId>(request.mode === "edit" ? (request.step ?? "about") : "about")
  const [drafts, setDrafts] = useState<BriefDraftSummary[]>([])
  const [atDraftLimit, setAtDraftLimit] = useState(false)
  const [clientErrors, setClientErrors] = useState<BriefFieldErrors>({})
  const [live, setLive] = useState("")
  const [banner, setBanner] = useState<{ text: string; upgrade?: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [autoPrefillText, setAutoPrefillText] = useState<string | undefined>()
  const bodyRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const announce = useCallback((message: string) => {
    setLive("")
    requestAnimationFrame(() => setLive(message))
  }, [])

  const { data: eligibility } = useQuery({
    queryKey: ["brief-eligibility"],
    queryFn: briefsApi.eligibility,
    enabled: !editing,
    staleTime: 30_000,
  })

  const openBrief = useCallback(
    (brief: BriefView) => {
      draft.load(brief)
      const pointer = brief.currentStep
      if (!editing && pointer && pointer !== "start" && pointer !== "summary") setStep(pointer)
      if (!editing && brief.mode && brief.mode !== view) setView(brief.mode)
      setPhase("form")
    },
    [draft, editing, view],
  )

  const startNew = useCallback(
    async (ideaText?: string) => {
      setPhase("loading")
      try {
        const { brief, prefillSuggested } = await briefsApi.create({ ...(ideaText ? { ideaText } : {}), mode: view })
        openBrief(brief)
        if (ideaText && prefillSuggested) setAutoPrefillText(ideaText)
      } catch (err) {
        const e = err as BriefApiError
        if (e.code === "BRIEF_DRAFT_LIMIT") {
          setDrafts((e.data as { drafts?: BriefDraftSummary[] } | undefined)?.drafts ?? [])
          setAtDraftLimit(true)
          setPhase("choose")
          return
        }
        setBanner({ text: e.status === 429 ? BRIEF_UI_COPY.rateLimited : e.message })
        setPhase("error")
      }
    },
    [openBrief, view],
  )

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void (async () => {
      try {
        if (request.mode === "edit") {
          openBrief(await briefsApi.getForProject(request.projectSlug))
          return
        }
        if (request.ideaText) return void (await startNew(request.ideaText))
        const open = await briefsApi.listOpen()
        if (open.length > 0) {
          setDrafts(open)
          setPhase("choose")
          return
        }
        await startNew()
      } catch (err) {
        setBanner({ text: (err as Error).message })
        setPhase("error")
      }
    })()
  }, [request, openBrief, startNew])

  const steps = stepsFor(view)
  const stepIndex = Math.max(0, steps.indexOf(step))
  const isLastStep = stepIndex === steps.length - 1
  const fields = useMemo(() => fieldsFor(step, view, draft.data), [step, view, draft.data])
  const errors: BriefFieldErrors = { ...draft.errors, ...clientErrors }

  const goTo = useCallback(
    (next: StepId | "summary") => {
      if (next === "summary") {
        setPhase("summary")
        draft.setColumns({ currentStep: "summary" })
      } else {
        setPhase("form")
        setStep(next)
        draft.setColumns({ currentStep: next })
      }
      bodyRef.current?.scrollTo({ top: 0 })
      announce(next === "summary" ? BRIEF_UI_COPY.quickSummaryTitle : BRIEF_STEP_COPY[next].title)
    },
    [draft, announce],
  )

  const switchView = (next: BriefViewMode) => {
    if (next === view) return
    setView(next)
    writeViewPreference(next)
    draft.setColumns({ mode: next })
    if (next === "QUICK" && !QUICK_STEP_IDS.includes(step as (typeof QUICK_STEP_IDS)[number])) setStep(QUICK_STEP_IDS[0])
    if (phase === "summary" && next === "FULL") goTo(firstUnfilledStep(draft.data, null))
  }

  const validateStep = (): boolean => {
    const found: BriefFieldErrors = {}
    for (const id of fields) {
      const value = draft.data[id]
      if (REQUIRED_FIELD_IDS.includes(id) && (value === undefined || value === "")) {
        found[id] = ["Required"]
        continue
      }
      if (value === undefined) continue
      const result = validateFieldValue(id, value, "submit")
      if (!result.ok) Object.assign(found, result.errors)
    }
    setClientErrors((prev) => {
      const next = { ...prev }
      for (const id of fields) for (const k of Object.keys(next)) if (k === id || k.startsWith(`${id}.`)) delete next[k]
      return { ...next, ...found }
    })
    const count = Object.keys(found).length
    if (count > 0) {
      announce(`${count} answer${count === 1 ? " needs" : "s need"} attention`)
      const first = Object.keys(found)[0]!.split(".")[0]
      requestAnimationFrame(() => document.getElementById(first!)?.focus())
    }
    return count === 0
  }

  const blurField = (id: FieldId) => {
    const value = draft.data[id]
    if (value === undefined) return
    const result = validateFieldValue(id, value, "submit")
    setClientErrors((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) if (k === id || k.startsWith(`${id}.`)) delete next[k]
      return result.ok ? next : { ...next, ...result.errors }
    })
  }

  const onContinue = () => {
    if (!validateStep()) return
    if (!isLastStep) return goTo(steps[stepIndex + 1]!)
    if (view === "QUICK" && !editing) return goTo("summary")
    void submit()
  }

  const onBack = () => {
    if (phase === "summary") return goTo(steps[steps.length - 1]!)
    if (stepIndex > 0) goTo(steps[stepIndex - 1]!)
  }

  const submit = async () => {
    if (editing) return void saveEdit()
    const cleaned = dropUnconfirmedImportedProof({ data: draft.data, meta: draft.brief?.meta ?? {} })
    const check = validateForSubmit(cleaned.data)
    if (!check.ok) {
      setClientErrors(check.errors)
      const target = firstStepWithError(check.errors)
      if (target) {
        if (!QUICK_STEP_IDS.includes(target as (typeof QUICK_STEP_IDS)[number])) switchView("FULL")
        goTo(target)
      }
      announce(`${Object.keys(check.errors).length} answers need attention`)
      return
    }
    setSubmitting(true)
    setBanner(null)
    try {
      const saved = await draft.flush()
      if (!saved) throw new Error("Couldn't save your draft")
      const created = await briefsApi.createProject(saved.id)
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      onClose()
      router.push(`/project/${created.project.slug}`)
    } catch (err) {
      const e = err as BriefApiError
      if (e.status === 422 && e.errors) {
        setClientErrors(e.errors)
        const target = firstStepWithError(e.errors)
        if (target) goTo(target)
      } else if (isFreeTierExhausted(err) || e.status === 402) {
        setBanner({ text: BRIEF_UI_COPY.eligibility, upgrade: true })
      } else {
        setBanner({ text: e.status === 429 ? BRIEF_UI_COPY.rateLimited : e.message })
      }
      announce(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const saveEdit = async () => {
    if (!projectSlug) return
    setSubmitting(true)
    try {
      const result = await draft.saveEdit()
      queryClient.invalidateQueries({ queryKey: ["brief", projectSlug] })
      onClose()
      if (result.regenerateNeeded) toast(BRIEF_UI_COPY.editSavedNeedsRegenerate)
      else toast(BRIEF_UI_COPY.saved)
    } catch (err) {
      const e = err as BriefApiError
      if (e.status === 422 && e.errors) {
        const target = firstStepWithError(e.errors)
        if (target) goTo(target)
      }
      setBanner({ text: e.status === 409 ? BRIEF_UI_COPY.conflict : e.message })
      announce(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const requestClose = async () => {
    if (editing) {
      if (draft.dirty) return void saveEdit()
      return onClose()
    }
    const brief = draft.brief
    if (brief) {
      await draft.flush().catch(() => null)
      if (!draft.hasUserAnswers()) {
        void briefsApi.remove(brief.id).catch(() => {})
      } else {
        toast(BRIEF_UI_COPY.draftSaved)
      }
    }
    onClose()
  }

  const reloadAfterConflict = async () => {
    if (!draft.brief) return
    const fresh = editing && projectSlug ? await briefsApi.getForProject(projectSlug) : await briefsApi.get(draft.brief.id)
    draft.load(fresh)
    setBanner(null)
  }

  const uploadLogo = async (file: File) => {
    if (!draft.brief) return
    setUploading(true)
    try {
      await draft.flush()
      const view = editing && projectSlug ? await briefsApi.uploadForProject(projectSlug, file, "logo") : await briefsApi.upload(draft.brief.id, file, "logo")
      draft.acceptServer(view)
      announce("Logo uploaded")
    } catch (err) {
      setClientErrors((prev) => ({ ...prev, logo: [(err as Error).message] }))
    } finally {
      setUploading(false)
    }
  }

  const saveLabel =
    draft.saveState === "saving"
      ? BRIEF_UI_COPY.saving
      : draft.saveState === "saved"
        ? BRIEF_UI_COPY.saved
        : draft.saveState === "rateLimited"
          ? BRIEF_UI_COPY.rateLimited
          : draft.saveState === "error"
            ? "Not saved yet"
            : ""

  const canSkip = !stepHasRequired(step) && view === "FULL" && !editing
  const title = editing ? BRIEF_UI_COPY.editTitle : BRIEF_UI_COPY.modalTitle

  return (
    <Dialog open onOpenChange={(o) => !o && void requestClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-3xl border border-base bg-surface p-0 sm:max-w-[720px] motion-reduce:animate-none",
          "max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none",
        )}
      >
        <header className="flex shrink-0 flex-col gap-3 border-b border-base px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3 pr-10">
            <div>
              <DialogTitle className="text-[19px] font-semibold text-pri">{title}</DialogTitle>
              <DialogDescription className="mt-1 text-[12.5px] text-mut">
                {phase === "form" ? BRIEF_STEP_COPY[step].description : BRIEF_UI_COPY.quickSummary}
              </DialogDescription>
            </div>
            {!editing && phase !== "choose" && (
              <div role="group" aria-label="Form length" className="flex shrink-0 rounded-xl border border-base p-0.5">
                {(["QUICK", "FULL"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => switchView(v)}
                    className={cn(
                      "rounded-lg px-3 py-1 text-[12px] font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      view === v ? "bg-inv text-inv" : "text-mut hover:text-sec",
                    )}
                  >
                    {v === "QUICK" ? BRIEF_UI_COPY.quickLabel : BRIEF_UI_COPY.fullLabel}
                  </button>
                ))}
              </div>
            )}
          </div>
          {(phase === "form" || phase === "summary") && (
            <nav aria-label="Steps" className="flex items-center justify-between gap-3">
              <ol className="flex flex-wrap items-center gap-1.5">
                {steps.map((s, i) => {
                  const current = phase === "form" && s === step
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => goTo(s)}
                        aria-current={current ? "step" : undefined}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11.5px] font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          current ? "bg-blue-600 text-white" : i < stepIndex || phase === "summary" ? "bg-bubble text-sec" : "text-mut hover:bg-tertiary",
                        )}
                      >
                        <span className="sr-only">Step {i + 1}: </span>
                        {BRIEF_STEP_COPY[s].title}
                      </button>
                    </li>
                  )
                })}
              </ol>
              <span className="shrink-0 text-[11.5px] text-mut" aria-hidden="true">
                {saveLabel}
              </span>
            </nav>
          )}
        </header>

        <p aria-live="polite" className="sr-only">
          {live}
        </p>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {!editing && eligibility && !eligibility.eligible && (
            <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {BRIEF_UI_COPY.eligibility}{" "}
              <a href="/billing" className="font-semibold underline underline-offset-2">
                {BRIEF_UI_COPY.upgrade}
              </a>
            </div>
          )}
          {draft.saveState === "conflict" && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {BRIEF_UI_COPY.conflict}
              <button type="button" onClick={() => void reloadAfterConflict()} className="rounded-lg border border-current px-2.5 py-1 font-semibold">
                {BRIEF_UI_COPY.reload}
              </button>
            </div>
          )}
          {banner && (
            <div role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-[12.5px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {banner.text}{" "}
              {banner.upgrade && (
                <a href="/billing" className="font-semibold underline underline-offset-2">
                  {BRIEF_UI_COPY.upgrade}
                </a>
              )}
            </div>
          )}

          {phase === "loading" && (
            <div className="flex justify-center py-16">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" aria-label="Loading" />
            </div>
          )}

          {phase === "choose" && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-semibold text-pri">{BRIEF_UI_COPY.continueDraft}</p>
              {atDraftLimit && <p className="text-[12.5px] text-mut">You have 5 drafts open. Continue one, or delete one to start fresh.</p>}
              <ul className="flex flex-col gap-2">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-base px-4 py-3">
                    <span className="text-[13px] text-pri">
                      <span className="font-semibold">{d.productName ?? "Untitled draft"}</span>
                      <span className="text-mut">, edited {timeAgo(d.updatedAt)}</span>
                    </span>
                    <span className="flex gap-2">
                      <button type="button" onClick={async () => openBrief(await briefsApi.get(d.id))} className="rounded-xl bg-inv px-3 py-1.5 text-[12px] font-semibold text-inv focus-visible:ring-[3px] focus-visible:ring-ring/50">
                        Continue
                      </button>
                      {atDraftLimit && (
                        <button
                          type="button"
                          onClick={async () => {
                            await briefsApi.remove(d.id)
                            setDrafts((prev) => prev.filter((x) => x.id !== d.id))
                            setAtDraftLimit(false)
                          }}
                          className="rounded-xl border border-base px-3 py-1.5 text-[12px] font-semibold text-sec focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          aria-label={`Delete draft ${d.productName ?? "Untitled draft"}`}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {!atDraftLimit && (
                <button type="button" onClick={() => void startNew(request.mode === "create" ? request.ideaText : undefined)} className="self-start rounded-xl border border-base px-4 py-2 text-[12.5px] font-semibold text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  {BRIEF_UI_COPY.startNew}
                </button>
              )}
            </div>
          )}

          {phase === "summary" && (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-[16px] font-semibold text-pri">{BRIEF_UI_COPY.quickSummaryTitle}</p>
              <p className="text-[13px] text-sec">{BRIEF_UI_COPY.quickSummary}</p>
              <button type="button" onClick={() => switchView("FULL")} className="text-[12.5px] font-semibold text-blue-700 underline underline-offset-2 dark:text-blue-300">
                {BRIEF_UI_COPY.addMoreDetails}
              </button>
            </div>
          )}

          {phase === "form" && (
            <div className="flex flex-col gap-6">
              {!editing && step === steps[0] && (
                <PrefillPanel
                  briefId={draft.brief?.id ?? null}
                  defaultOpen={view === "QUICK"}
                  autoRunText={autoPrefillText}
                  beforeRun={draft.flush}
                  onResult={(v) => draft.acceptServer(v)}
                  announce={announce}
                />
              )}
              {step === "proof" && (
                <p className="rounded-2xl bg-tertiary px-4 py-3 text-[12.5px] text-sec">{BRIEF_STEP_COPY.proof.description}</p>
              )}
              {fields.map((id) => (
                <FieldBlock
                  key={id}
                  id={id}
                  draft={draft}
                  errors={errorsForField(errors, id)}
                  onBlur={() => blurField(id)}
                  logoUrl={draft.brief?.uploads.logo ? briefAssetUrl(draft.brief.uploads.logo.url) : undefined}
                  onUpload={uploadLogo}
                  uploading={uploading}
                  contactPublic={draft.data.showContactPublicly !== false}
                  accountEmail={user?.email}
                />
              ))}
            </div>
          )}
        </div>

        {(phase === "form" || phase === "summary") && (
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-base px-5 py-3 sm:px-6">
            <button type="button" onClick={onBack} disabled={phase === "form" && stepIndex === 0} className="rounded-xl px-3 py-2 text-[12.5px] font-semibold text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40">
              {BRIEF_UI_COPY.back}
            </button>
            <div className="flex items-center gap-2">
              {phase === "form" && canSkip && !isLastStep && (
                <button type="button" onClick={() => goTo(steps[stepIndex + 1]!)} className="rounded-xl px-3 py-2 text-[12.5px] font-semibold text-mut hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  {BRIEF_UI_COPY.skipStep}
                </button>
              )}
              <button
                type="button"
                disabled={submitting}
                onClick={phase === "summary" ? () => void submit() : onContinue}
                className="rounded-xl bg-inv px-5 py-2.5 text-[13px] font-semibold text-inv hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {submitting
                  ? BRIEF_UI_COPY.saving
                  : phase === "summary" || (isLastStep && view === "FULL")
                    ? editing
                      ? BRIEF_UI_COPY.saveChanges
                      : BRIEF_UI_COPY.createProject
                    : BRIEF_UI_COPY.continue}
              </button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldBlock({
  id,
  draft,
  errors,
  onBlur,
  logoUrl,
  onUpload,
  uploading,
  contactPublic,
  accountEmail,
}: {
  id: FieldId
  draft: ReturnType<typeof useBriefDraft>
  errors: string[]
  onBlur: () => void
  logoUrl?: string
  onUpload: (file: File) => void
  uploading: boolean
  contactPublic: boolean
  accountEmail?: string
}) {
  const def = FIELD_DEFS[id]
  const meta = draft.brief?.meta[id]
  const required = def.tier === "required"
  const aiAllowed = "aiDecideAllowed" in def && def.aiDecideAllowed === true
  const aiOn = aiAllowed && draft.isAiDecide(id)
  const suggested = meta?.source === "imported" && !meta.confirmed && draft.data[id] !== undefined
  const isProof = "proof" in def && def.proof === true
  const labelId = `${id}-label`
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [helpId, errors.length ? errorId : null].filter(Boolean).join(" ")
  const simple = SIMPLE_LABEL_KINDS.has(def.kind)

  let help: string = def.help
  if (id === "contactEmail") {
    help = `${def.help} ${contactPublic ? BRIEF_UI_COPY.publicEmailNote : BRIEF_UI_COPY.privateEmailNote}`
    if (accountEmail && draft.data.contactEmail === accountEmail && meta?.source === "default") help += " Pre-filled from your account."
  }

  return (
    <div role={simple ? undefined : "group"} aria-labelledby={simple ? undefined : labelId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {simple ? (
          <label id={labelId} htmlFor={id} className="text-[13.5px] font-semibold text-pri">
            {def.label}
          </label>
        ) : (
          <span id={labelId} className="text-[13.5px] font-semibold text-pri">
            {def.label}
          </span>
        )}
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", required ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-mut")}>
          {required ? BRIEF_UI_COPY.required : BRIEF_UI_COPY.optional}
        </span>
        {suggested && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{BRIEF_UI_COPY.suggested}</span>}
        {aiOn && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{BRIEF_UI_COPY.aiWillDecide}</span>}
      </div>
      <p id={helpId} className="text-[12px] leading-relaxed text-mut">
        {help}
      </p>
      {aiAllowed && (
        <label className="flex items-center gap-2 text-[12px] text-sec">
          <input type="checkbox" className="size-4 accent-emerald-600" checked={aiOn} onChange={(e) => draft.setAiDecide(id, e.target.checked)} />
          {BRIEF_UI_COPY.letAiDecide}
        </label>
      )}
      {suggested && meta?.excerpt && <p className="text-[11.5px] italic text-mut">From your source: “{meta.excerpt}”</p>}
      <BriefFieldInput
        id={id}
        data={draft.data}
        onChange={(v) => draft.setField(id, v)}
        onBlur={onBlur}
        disabled={aiOn}
        describedBy={describedBy}
        invalid={errors.length > 0}
        logoUrl={logoUrl}
        onUpload={onUpload}
        uploading={uploading}
      />
      {suggested &&
        (isProof ? (
          <label className="flex items-center gap-2 text-[12px] font-medium text-sec">
            <input type="checkbox" className="size-4 accent-blue-600" onChange={(e) => e.target.checked && draft.setField(id, draft.data[id])} />
            {BRIEF_UI_COPY.proofImportedConfirm}
          </label>
        ) : (
          <button type="button" onClick={() => draft.setField(id, draft.data[id])} className="self-start rounded-lg border border-base px-2.5 py-1 text-[11.5px] font-semibold text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {BRIEF_UI_COPY.accept}
          </button>
        ))}
      {errors.length > 0 && (
        <p id={errorId} className="text-[12px] font-medium text-red-600 dark:text-red-400">
          {[...new Set(errors)].join(" ")}
        </p>
      )}
    </div>
  )
}
