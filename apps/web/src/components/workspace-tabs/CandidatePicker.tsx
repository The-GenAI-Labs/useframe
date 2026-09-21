"use client"

import { useState } from "react"
import type { DesignBrief } from "@/lib/api/services/research.service"

export type Candidate = {
  brief: DesignBrief
  previewUrl: string
}

type Props = {
  candidateA: Candidate
  candidateB: Candidate
  recommended: "A" | "B"
  recommendedReason: string
  onSelect: (choice: "A" | "B" | "auto") => void | Promise<void>
  disabled?: boolean
}

// Short descriptor line — colour name, brand personality, copy framework —
// so the two directions are comparable at a glance without reading the full
// brief.
function summarize(brief: DesignBrief): string {
  return [brief.colors.primary, brief.brand.personality, brief.copyFramework]
    .filter(Boolean)
    .join(" · ")
}

function CandidateCard({
  label,
  candidate,
  isRecommended,
  onChoose,
  disabled,
}: {
  label: "A" | "B"
  candidate: Candidate
  isRecommended: boolean
  onChoose: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-base bg-card">
      <div className="relative aspect-[1200/630] w-full bg-tertiary">
        {/* Preview is an inline SVG data URL built from this brief's own
            colours/typography — not a screenshot, so no next/image loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={candidate.previewUrl}
          alt={`Option ${label} hero preview`}
          className="h-full w-full object-cover"
        />
        {isRecommended && (
          <span className="absolute right-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
            Recommended
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-pri">Option {label}</p>
        <p className="text-[12.5px] text-mut">{summarize(candidate.brief)}</p>
        <p className="text-[12.5px] leading-relaxed text-sec">
          {candidate.brief.colors.rationale}
        </p>

        <button
          type="button"
          onClick={onChoose}
          disabled={disabled}
          className="mt-auto w-full cursor-pointer rounded-xl bg-blue-600 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Choose Option {label}
        </button>
      </div>
    </div>
  )
}

// Shared by both research flows — the workspace pipeline's ResearchTab and
// the home-page /plan SSE flow — so the two can't drift apart in how a
// direction gets picked.
export function CandidatePicker({
  candidateA,
  candidateB,
  recommended,
  recommendedReason,
  onSelect,
  disabled,
}: Props) {
  const [pending, setPending] = useState<"A" | "B" | "auto" | null>(null)

  const choose = async (choice: "A" | "B" | "auto") => {
    if (pending || disabled) return
    setPending(choice)
    try {
      await onSelect(choice)
    } finally {
      setPending(null)
    }
  }

  const busy = disabled || pending !== null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-pri">
          Research complete — two directions to choose from
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-mut">{recommendedReason}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <CandidateCard
          label="A"
          candidate={candidateA}
          isRecommended={recommended === "A"}
          onChoose={() => choose("A")}
          disabled={busy}
        />
        <CandidateCard
          label="B"
          candidate={candidateB}
          isRecommended={recommended === "B"}
          onChoose={() => choose("B")}
          disabled={busy}
        />
      </div>

      <div className="flex items-center justify-center gap-2 text-[12.5px] text-mut">
        <span>Not sure?</span>
        <button
          type="button"
          onClick={() => choose("auto")}
          disabled={busy}
          className="cursor-pointer font-semibold text-blue-600 underline underline-offset-2 transition-colors hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "auto"
            ? "Selecting…"
            : `Let the model decide → recommends Option ${recommended}`}
        </button>
      </div>
    </div>
  )
}
