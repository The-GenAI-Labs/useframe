"use client"

import { useRef } from "react"
import type { PipelineStage } from "@repo/schemas"
import { useGenerationStore } from "@/stores/generationStore"

const STEPS = [
  "Planning your page structure",
  "Writing your copy",
  "Applying your design direction",
  "Optimising for search",
  "Final quality review",
]

// GENERATE is reused for structure, design and media placement, so the message disambiguates it.
function stepIndexOf(stage: PipelineStage | null, message: string): number {
  switch (stage) {
    case "COPY":
      return 1
    case "SEO":
      return 3
    case "CRITIQUE":
      return 4
    case "COMPLETE":
      return STEPS.length
    case "GENERATE":
      if (/design/i.test(message)) return 2
      if (/placing your media/i.test(message)) return 4
      return 0
    default:
      return 0
  }
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function GenerationStream({ onRetry }: { onRetry?: () => void }) {
  const { currentStage, stageMessage, substep, error } = useGenerationStore()
  const furthest = useRef(0)

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Generation failed</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-lg bg-bubble px-3.5 py-2 text-[12.5px] font-semibold text-pri transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 cursor-pointer"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!currentStage) furthest.current = 0
  furthest.current = Math.max(furthest.current, stepIndexOf(currentStage, stageMessage))
  const active = furthest.current

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div role="status" aria-live="polite" className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" />
          <p className="text-sm font-semibold text-pri">Building your website</p>
          <p className="text-[12.5px] text-mut">This usually takes a few minutes. You can stay on this page.</p>
        </div>

        <ol className="flex flex-col gap-2.5">
          {STEPS.map((label, i) => {
            const done = i < active
            const current = i === active
            return (
              <li key={label} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : current
                        ? "border-indigo-500"
                        : "border-base"
                  }`}
                >
                  {done ? (
                    <CheckIcon />
                  ) : current ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500 motion-reduce:animate-none" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className={`text-[13px] ${current ? "font-medium text-pri" : done ? "text-sec" : "text-mut"}`}>
                    {label}
                    {done && <span className="sr-only"> (done)</span>}
                    {current && <span className="sr-only"> (in progress)</span>}
                  </p>
                  {current && substep && stageMessage && (
                    <p className="mt-0.5 text-[12px] text-mut">{stageMessage}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
