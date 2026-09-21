"use client"

import { useCallback, useEffect, useState } from "react"
import type { ProjectDetail } from "@/lib/api/services/projects.service"
import {
  researchApi,
  type DesignBrief,
  type PlanCandidates,
} from "@/lib/api/services/research.service"
import { CandidatePicker } from "./CandidatePicker"
import { StepApprovalBar } from "./StepApprovalBar"
import { BriefFieldEditor } from "./BriefFieldEditor"
import type { PipelineStepStatus } from "@/lib/api/services/pipeline.service"

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; brief: DesignBrief }
  | { status: "error" }

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <div className="w-12 h-12 rounded-2xl bg-tertiary flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-mut">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-sec">{title}</p>
          <p className="text-xs text-mut mt-1 leading-relaxed">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  citation,
  editing,
  onToggleEdit,
  children,
  editor,
}: {
  title: string
  citation?: string
  editing?: boolean
  onToggleEdit?: () => void
  children: React.ReactNode
  editor?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-2xl border border-base bg-surface">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-sec">{title}</p>
        {citation && onToggleEdit && (
          <button
            type="button"
            onClick={onToggleEdit}
            className="text-[11px] text-mut hover:text-sec transition-colors cursor-pointer"
          >
            {editing ? "close" : "[change]"}
          </button>
        )}
      </div>
      {children}
      {editing && editor}
    </div>
  )
}

function ColorSwatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg border border-base shrink-0" style={{ backgroundColor: hex }} />
      <div className="flex flex-col">
        <span className="text-[11px] text-mut">{label}</span>
        <span className="text-[11.5px] font-medium text-sec">{hex}</span>
      </div>
    </div>
  )
}

function CitationLine({ text, source }: { text: string; source?: string }) {
  return (
    <p className="text-[11.5px] text-mut leading-relaxed mt-1">
      {text}
      {source && <span className="text-mut italic"> — {source}</span>}
    </p>
  )
}

type Props = {
  project: ProjectDetail | null
  pipelineStatus?: PipelineStepStatus
  locked?: boolean
  onApproved?: () => void
}

export function ResearchTab({ project, pipelineStatus, locked, onApproved }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [editingField, setEditingField] = useState<"colors" | "typography" | null>(null)
  // Populated by generate(); the picker replaces the approve bar while the
  // user still has a choice to make. Cleared once they select.
  const [candidates, setCandidates] = useState<PlanCandidates | null>(null)

  const load = useCallback(() => {
    if (!project) {
      setState({ status: "empty" })
      return
    }
    setState({ status: "loading" })
    researchApi
      .get(project.slug)
      .then(({ brief }) => {
        setState(brief ? { status: "ready", brief } : { status: "empty" })
      })
      .catch(() => {
        setState({ status: "error" })
      })
  }, [project])

  useEffect(() => {
    load()
  }, [load])

  const generate = useCallback(
    (feedback?: string) => {
      if (!project) return
      setIsGenerating(true)
      researchApi
        .generate(project.slug, feedback)
        .then(({ brief, candidates: next }) => {
          setState({ status: "ready", brief })
          setCandidates(next ?? null)
        })
        .catch(() => {
          setState({ status: "error" })
        })
        .finally(() => setIsGenerating(false))
    },
    [project]
  )

  // Kick off the first brief generation automatically once we know none
  // exists yet — the user still approves/rejects the result, this just saves
  // them a manual "generate" click on a step that has to happen either way.
  useEffect(() => {
    if (state.status === "empty" && project && pipelineStatus === "PENDING" && !isGenerating) {
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, project, pipelineStatus])

  const handleApprove = useCallback(() => {
    if (!project) return
    setIsApproving(true)
    researchApi
      .approve(project.slug)
      .then(() => onApproved?.())
      .finally(() => setIsApproving(false))
  }, [project, onApproved])

  const handleSelect = useCallback(
    async (choice: "A" | "B" | "auto") => {
      if (!project || !candidates) return
      const { brief } = await researchApi.select(project.slug, {
        choice,
        candidateA: candidates.candidateA.brief,
        candidateB: candidates.candidateB.brief,
        recommended: candidates.recommended,
      })
      setState({ status: "ready", brief })
      setCandidates(null)
      onApproved?.()
    },
    [project, candidates, onApproved],
  )

  const handleReject = useCallback(
    (feedback: string) => {
      if (!project) return
      setIsRejecting(true)
      researchApi
        .reject(project.slug, feedback)
        .then(() => generate(feedback))
        .finally(() => setIsRejecting(false))
    },
    [project, generate]
  )

  const handlePickOption = useCallback(
    (field: "colors" | "typography", value: string) => {
      if (!project || state.status !== "ready") return
      const nextBrief: DesignBrief = {
        ...state.brief,
        [field]: { ...state.brief[field], primary: value },
      }
      // Persist optimistically; the field editor already restricted the
      // choice to that finding's own options[], so this can't drift outside
      // the research-approved range.
      setState({ status: "ready", brief: nextBrief })
      researchApi.update(project.slug, nextBrief).catch(() => {
        // Revert on failure by reloading from the server.
        load()
      })
    },
    [project, state, load]
  )

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-6 md:px-10 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold text-pri tracking-tight">Research</h1>
        <p className="text-sm text-mut mt-1">
          Evidence-backed design decisions behind this page, cited to real research.
        </p>
      </div>

      {(state.status === "loading" || isGenerating) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          {isGenerating && <p className="text-[12.5px] text-mut">Researching design direction…</p>}
        </div>
      )}

      {state.status === "empty" && !isGenerating && (
        <EmptyState
          title={project ? "No design brief yet" : "Start a project to see research"}
          subtitle={
            project
              ? "This project hasn't generated a design brief yet."
              : "Design and copy rationale will appear here once you generate a page."
          }
        />
      )}

      {state.status === "error" && (
        <EmptyState title="Couldn't load research" subtitle="Something went wrong fetching this brief." />
      )}

      {state.status === "ready" && (
        <div className="px-6 md:px-10 pb-10 flex flex-col gap-4 max-w-2xl">
          <div className="flex flex-col gap-1 p-6 rounded-3xl border border-base bg-surface shadow-sm">
            <p className="text-sm font-semibold text-pri">{state.brief.product}</p>
            <p className="text-xs text-mut leading-relaxed">
              For {state.brief.audience.primary} — {state.brief.goal}
            </p>
          </div>

          <Section
            title="Colors"
            citation={state.brief.colors.citation}
            editing={editingField === "colors"}
            onToggleEdit={() => setEditingField((f) => (f === "colors" ? null : "colors"))}
            editor={
              editingField === "colors" && state.brief.colors.citation ? (
                <BriefFieldEditor
                  slug={project?.slug ?? ""}
                  citation={state.brief.colors.citation}
                  onPick={(opt) => handlePickOption("colors", opt.value)}
                  onClose={() => setEditingField(null)}
                />
              ) : null
            }
          >
            <div className="grid grid-cols-3 gap-3">
              <ColorSwatch label="Primary" hex={state.brief.colors.primary} />
              <ColorSwatch label="Secondary" hex={state.brief.colors.secondary} />
              <ColorSwatch label="Accent" hex={state.brief.colors.accent} />
            </div>
            <CitationLine text={state.brief.colors.rationale} />
          </Section>

          <Section
            title="Typography"
            citation={state.brief.typography.citation}
            editing={editingField === "typography"}
            onToggleEdit={() => setEditingField((f) => (f === "typography" ? null : "typography"))}
            editor={
              editingField === "typography" && state.brief.typography.citation ? (
                <BriefFieldEditor
                  slug={project?.slug ?? ""}
                  citation={state.brief.typography.citation}
                  onPick={(opt) => handlePickOption("typography", opt.value)}
                  onClose={() => setEditingField(null)}
                />
              ) : null
            }
          >
            <div className="flex gap-4 text-[12px] text-sec">
              <span>Primary: <span className="font-medium">{state.brief.typography.primary}</span></span>
              <span>Secondary: <span className="font-medium">{state.brief.typography.secondary}</span></span>
              <span>Min size: <span className="font-medium">{state.brief.typography.minSize}</span></span>
            </div>
            <CitationLine text={state.brief.typography.rationale} />
          </Section>

          <Section title="Layout" citation={state.brief.layout.citation}>
            <p className="text-[12px] font-medium text-sec">{state.brief.layout.sections.join(" → ")}</p>
            <CitationLine text={state.brief.layout.rationale} />
          </Section>

          <Section title="Copy framework">
            <p className="text-[12px] font-medium text-sec">{state.brief.copyFramework}</p>
            <CitationLine text={state.brief.frameworkRationale} />
          </Section>

          <Section title="Brand">
            <div className="flex flex-col gap-1 text-[12px] text-sec">
              <span>Personality: {state.brief.brand.personality}</span>
              <span>Positioning: {state.brief.brand.positioning}</span>
              <span>Tone: {state.brief.brand.tone}</span>
              <span>Density: {state.brief.density} · Motion: {state.brief.motion}</span>
            </div>
          </Section>

          {state.brief.citations.length > 0 && (
            <Section title="Citations">
              <ul className="flex flex-col gap-2">
                {state.brief.citations.map((c, i) => (
                  <li key={c.id ?? i} className="text-[11.5px] text-sec leading-relaxed">
                    <span className="font-medium">[{i + 1}]</span> {c.title}
                    {c.source && <span className="text-mut italic"> — {c.source}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {locked ? (
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-medium w-fit dark:bg-emerald-950/30 dark:text-emerald-400">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approved
            </div>
          ) : pipelineStatus === "AWAITING_APPROVAL" && candidates ? (
            // Two directions available — the user picks one instead of
            // approving a single pre-chosen brief.
            <CandidatePicker
              candidateA={candidates.candidateA}
              candidateB={candidates.candidateB}
              recommended={candidates.recommended}
              recommendedReason={candidates.recommendedReason}
              onSelect={handleSelect}
            />
          ) : pipelineStatus === "AWAITING_APPROVAL" ? (
            // No candidates (e.g. a brief generated before this flow shipped,
            // or reloaded from the DB) — fall back to plain approve/reject.
            <StepApprovalBar
              onApprove={handleApprove}
              onReject={handleReject}
              isApproving={isApproving}
              isRejecting={isRejecting}
              approveLabel="Approve & Generate"
              rejectLabel="Regenerate brief"
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
