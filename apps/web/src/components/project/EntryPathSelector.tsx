"use client"

import type { ProjectInputType } from "@repo/schemas"

type Props = {
  value: ProjectInputType
  onChange: (value: ProjectInputType) => void
}

const options: { value: ProjectInputType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "FROM_SCRATCH",
    label: "From Idea",
    description: "Describe your startup and let AI build your page.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 6.464 0A3.5 3.5 0 0 0 15 18.5h-6a3.5 3.5 0 0 0-1.172-2.464Z" />
      </svg>
    ),
  },
  {
    value: "FROM_COMPETITOR",
    label: "From URL",
    description: "Analyse a competitor or reference site to inspire the design.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    value: "FROM_OWN_SITE",
    label: "From Scratch",
    description: "Upload your existing site to reimagine it with AI.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
]

export function EntryPathSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all duration-150 cursor-pointer ${
              active
                ? "border-em bg-bubble"
                : "border-base bg-tertiary/40 hover:bg-tertiary hover:border-em"
            }`}
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                active ? "bg-inv text-inv" : "bg-tertiary text-mut"
              }`}
            >
              {opt.icon}
            </div>
            <div>
              <p className="text-[13.5px] font-semibold text-pri">{opt.label}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-mut">{opt.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
