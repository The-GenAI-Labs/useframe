"use client"

import type { ProjectInputType } from "@repo/schemas"

type Props = {
  value: ProjectInputType
  onChange: (value: ProjectInputType) => void
}

const options: { value: ProjectInputType; label: string; description: string }[] = [
  {
    value: "FROM_SCRATCH",
    label: "From Idea",
    description: "Describe your startup and let AI build your page.",
  },
  {
    value: "FROM_COMPETITOR",
    label: "From URL",
    description: "Analyse a competitor or reference site to inspire the design.",
  },
  {
    value: "FROM_OWN_SITE",
    label: "From Scratch",
    description: "Upload your existing site to reimagine it with AI.",
  },
]

export function EntryPathSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-xl border p-4 text-left transition-all ${
            value === opt.value
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
              : "border-border bg-card hover:border-muted-foreground/40"
          }`}
        >
          <p className="font-medium text-foreground">{opt.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
        </button>
      ))}
    </div>
  )
}
