"use client"

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

export function PipelineModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-tertiary shrink-0">
      <button
        type="button"
        title="Manual — step through and approve each stage"
        disabled={disabled}
        onClick={() => onChange("MANUAL")}
        className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          mode === "MANUAL" ? "" : "text-mut hover:text-sec"
        }`}
        style={mode === "MANUAL" ? { backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" } : undefined}
      >
        <HandIcon />
      </button>
      <button
        type="button"
        title="Auto — runs Research → Website → SEO without pausing (Deploy still needs a click)"
        disabled={disabled}
        onClick={() => onChange("AUTO")}
        className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          mode === "AUTO" ? "" : "text-mut hover:text-sec"
        }`}
        style={mode === "AUTO" ? { backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" } : undefined}
      >
        <AutoIcon />
      </button>
    </div>
  )
}
