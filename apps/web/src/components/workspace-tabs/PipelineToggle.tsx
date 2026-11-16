"use client"

import { useRef, type KeyboardEvent } from "react"
import type { PipelineStepId, PipelineStepStatus } from "@/lib/api/services/pipeline.service"

export type PipelineToggleStep = {
  id: PipelineStepId
  label: string
  status: PipelineStepStatus
  /**
   * A lock that always holds regardless of `ignoreLock` — e.g. insufficient
   * credits. `ignoreLock` only exists to let MANUAL mode bypass sequencing
   * locks (you can jump between steps freely); it must never bypass a
   * payment gate.
   */
  hardLocked?: boolean
  hardLockedReason?: string
}

type Props = {
  steps: PipelineToggleStep[]
  activeStep: PipelineStepId | null
  onSelectStep?: (id: PipelineStepId) => void
  interactive?: boolean
  /** Manual mode: let the user click any step regardless of LOCKED status. */
  ignoreLock?: boolean
  /** Renders the steps as an ARIA tablist controlling the element with this id. */
  tabPanelId?: string
  tabListLabel?: string
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function PipelineToggle({
  steps,
  activeStep,
  onSelectStep,
  interactive = true,
  ignoreLock = false,
  tabPanelId,
  tabListLabel,
}: Props) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isTabs = !!tabPanelId
  const isClickable = (step: PipelineToggleStep) =>
    interactive && !((step.status === "LOCKED" && !ignoreLock) || step.hardLocked)

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!isTabs) return
    const enabled = steps.map((step, i) => (isClickable(step) ? i : -1)).filter((i) => i >= 0)
    const position = enabled.indexOf(index)
    let next: number | undefined
    if (e.key === "ArrowRight") next = enabled[(position + 1) % enabled.length]
    else if (e.key === "ArrowLeft") next = enabled[(position - 1 + enabled.length) % enabled.length]
    else if (e.key === "Home") next = enabled[0]
    else if (e.key === "End") next = enabled[enabled.length - 1]
    if (next === undefined) return
    e.preventDefault()
    onSelectStep?.(steps[next].id)
    buttonRefs.current[next]?.focus()
  }

  return (
    <div
      role={isTabs ? "tablist" : undefined}
      aria-label={isTabs ? tabListLabel : undefined}
      className="inline-flex items-center gap-1 p-1 rounded-2xl border border-base bg-tertiary w-fit mx-auto"
    >
      {steps.map((step, index) => {
        const isActive = step.id === activeStep
        const isSequenceLocked = step.status === "LOCKED" && !ignoreLock
        const isLocked = isSequenceLocked || !!step.hardLocked
        const isApproved = step.status === "APPROVED"
        const clickable = isClickable(step)

        return (
          <button
            key={step.id}
            ref={(el) => {
              buttonRefs.current[index] = el
            }}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSelectStep?.(step.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            title={step.hardLocked ? step.hardLockedReason : undefined}
            {...(isTabs && {
              role: "tab",
              id: `${tabPanelId}-tab-${step.id}`,
              "aria-selected": isActive,
              "aria-controls": tabPanelId,
              tabIndex: isActive ? 0 : -1,
            })}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all ${
              isTabs ? "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1" : ""
            } ${
              clickable ? "cursor-pointer" : "cursor-not-allowed"
            } ${
              isActive
                ? "shadow-sm"
                : isLocked
                  ? "opacity-40 text-mut"
                  : "text-mut hover:text-sec"
            }`}
            style={isActive ? { backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" } : undefined}
          >
            {isLocked && <LockIcon />}
            {isApproved && !isActive && <CheckIcon />}
            {step.label}
          </button>
        )
      })}
    </div>
  )
}
