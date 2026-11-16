"use client"

import { Hint } from "@/components/ui/hint"

type PipelineMode = "AUTO" | "MANUAL"

type Props = {
  mode: PipelineMode
  onChange: (mode: PipelineMode) => void
  disabled?: boolean
}

function HandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-4.53a2 2 0 0 1 2.53-3.03L6 13" />
    </svg>
  )
}

function AutoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  )
}

const MODES: { mode: PipelineMode; label: string; hint: string; Icon: () => React.JSX.Element }[] = [
  { mode: "MANUAL", label: "Manual mode", hint: "Manual — review and approve each step", Icon: HandIcon },
  { mode: "AUTO", label: "Auto mode", hint: "Auto — runs Research, Website and SEO without pausing; Deploy still needs a click", Icon: AutoIcon },
]

export function PipelineModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-tertiary shrink-0">
      {MODES.map(({ mode: value, label, hint, Icon }) => {
        const button = (
          <button
            type="button"
            aria-label={label}
            aria-pressed={mode === value}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === value ? "" : "text-mut hover:text-sec"
            }`}
            style={mode === value ? { backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" } : undefined}
          >
            <Icon />
          </button>
        )
        return (
          <Hint key={value} label={hint}>
            {disabled ? <span className="inline-flex">{button}</span> : button}
          </Hint>
        )
      })}
    </div>
  )
}
